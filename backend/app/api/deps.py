"""
API Authentication & User Identity Dependencies.
Supports HttpOnly session cookies, short-lived signed upload tokens, and static API_TOKEN fallback.
"""

import secrets
from typing import Optional
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User
from app.auth.security import verify_token_str


def get_token_from_request(
    request: Request, authorization: Optional[str] = Header(None)
) -> Optional[str]:
    """Extract token from either Authorization header or ls_session cookie."""
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1].strip()
    cookie_token = request.cookies.get("ls_session")
    if cookie_token:
        return cookie_token.strip()
    return None


async def get_optional_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Retrieves authenticated user from session cookie or bearer token if valid; otherwise None."""
    raw_token = get_token_from_request(request, authorization)
    if not raw_token:
        return None

    # Check signed token (session or upload scope)
    payload = verify_token_str(raw_token, settings.auth_secret)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    user = db.scalar(select(User).where(User.id == str(user_id)))
    return user


async def require_user(
    user: Optional[User] = Depends(get_optional_user),
) -> User:
    """Enforces that an authenticated user session is present."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def verify_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Authorizes API action if:
    1. Caller provides a valid session cookie or upload token for a registered user, OR
    2. Caller provides static Bearer API_TOKEN (for automation/n8n).
    Otherwise returns 401 Unauthorized.
    """
    # 1. Check logged-in user session or upload token
    user = await get_optional_user(request, authorization, db)
    if user:
        return user

    # 2. Check static API_TOKEN fallback
    if authorization and settings.api_token and settings.api_token.strip():
        parts = authorization.split()
        if (
            len(parts) == 2
            and parts[0].lower() == "bearer"
            and secrets.compare_digest(parts[1].strip(), settings.api_token.strip())
        ):
            return None  # Authorized via static API_TOKEN

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Valid session or API token required",
        headers={"WWW-Authenticate": "Bearer"},
    )
