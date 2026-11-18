"""
User Authentication, Registration, and Session Management API Routes.
Provides scrypt-hashed username/password auth, HttpOnly cookies, and CloudFront upload tokens.
"""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, update
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User, Match
from app.api.deps import require_user, get_optional_user
from app.auth.security import (
    hash_password,
    verify_password,
    create_token,
    validate_username,
    validate_steamid64,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthConfigResponse(BaseModel):
    invite_required: bool


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: Optional[str] = None
    steamid: Optional[str] = None
    invite_code: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    steamid: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    steamid: Optional[str] = None
    is_admin: bool


class UploadTokenResponse(BaseModel):
    upload_token: str
    expires_in: int = 300


def _set_session_cookie(response: Response, token: str, request: Request) -> None:
    max_age = settings.session_ttl_days * 86400
    # Determine secure flag: True if configured, or if requested over HTTPS
    is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    secure = settings.cookie_secure or is_https
    response.set_cookie(
        key="ls_session",
        value=token,
        max_age=max_age,
        expires=max_age,
        path="/",
        httponly=True,
        samesite="lax",
        secure=secure,
    )


@router.get("/config", response_model=AuthConfigResponse)
def get_auth_config():
    """Returns public auth requirements, such as whether an invite code is needed."""
    return AuthConfigResponse(
        invite_required=bool(settings.invite_code and settings.invite_code.strip())
    )


@router.post("/register", response_model=UserResponse)
def register(
    req: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Registers a new squad member account and starts a session."""
    # 1. Verify invite code if configured
    if settings.invite_code and settings.invite_code.strip():
        req_code = (req.invite_code or "").strip()
        if req_code != settings.invite_code.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid club invite code",
            )

    # 2. Validate username & password
    try:
        clean_username = validate_username(req.username).lower()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        pw_hash = hash_password(req.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # 3. Validate optional SteamID64
    clean_steamid = None
    if req.steamid:
        try:
            clean_steamid = validate_steamid64(req.steamid)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # 4. Check if username exists
    existing = db.scalar(select(User).where(User.username == clean_username))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken",
        )

    # 5. First user becomes Admin and claims legacy matches
    user_count = db.scalar(select(func.count(User.id))) or 0
    is_admin = user_count == 0

    user_id = str(uuid.uuid4())
    display_name = (req.display_name or "").strip() or clean_username

    user = User(
        id=user_id,
        username=clean_username,
        display_name=display_name,
        password_hash=pw_hash,
        steamid=clean_steamid,
        is_admin=is_admin,
    )
    db.add(user)
    db.flush()  # Flush User row into SQLite before updating foreign keys in matches

    if is_admin:
        # Claim unowned legacy matches
        db.execute(
            update(Match)
            .where(Match.owner_user_id.is_(None))
            .values(owner_user_id=user_id)
        )

    db.commit()
    db.refresh(user)

    # 6. Issue session token and cookie
    ttl = settings.session_ttl_days * 86400
    token = create_token({"sub": user.id, "scope": "session"}, ttl, settings.auth_secret)
    _set_session_cookie(response, token, request)

    return UserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        steamid=user.steamid,
        is_admin=user.is_admin,
    )


@router.post("/login", response_model=UserResponse)
def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Authenticates username & password and sets an HttpOnly session cookie."""
    clean_username = req.username.strip().lower()
    user = db.scalar(select(User).where(User.username == clean_username))
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    ttl = settings.session_ttl_days * 86400
    token = create_token({"sub": user.id, "scope": "session"}, ttl, settings.auth_secret)
    _set_session_cookie(response, token, request)

    return UserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        steamid=user.steamid,
        is_admin=user.is_admin,
    )


@router.post("/logout")
def logout(response: Response):
    """Clears the session cookie."""
    response.delete_cookie(key="ls_session", path="/")
    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(require_user)):
    """Retrieves current authenticated user profile."""
    return UserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        steamid=user.steamid,
        is_admin=user.is_admin,
    )


@router.patch("/me", response_model=UserResponse)
def update_me(
    req: UpdateProfileRequest,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Updates user display name or links/updates public 17-digit SteamID64."""
    if req.display_name is not None:
        user.display_name = req.display_name.strip() or user.username

    if req.steamid is not None:
        try:
            user.steamid = validate_steamid64(req.steamid)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    db.add(user)
    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        steamid=user.steamid,
        is_admin=user.is_admin,
    )


@router.post("/upload-token", response_model=UploadTokenResponse)
def get_upload_token(user: User = Depends(require_user)):
    """
    Generates a short-lived (5-minute) signed upload token.
    Used by the browser to stream 70-200 MB .dem files directly to AWS CloudFront
    without passing credentials or long-lived cookies.
    """
    token = create_token({"sub": user.id, "scope": "upload"}, 300, settings.auth_secret)
    return UploadTokenResponse(upload_token=token, expires_in=300)
