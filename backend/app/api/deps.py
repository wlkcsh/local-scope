"""
API Authentication Dependency per SPEC §4 and Phase 2.
Enforces Bearer API_TOKEN verification when configured, never echoing secrets.
"""

import secrets
from typing import Optional
from fastapi import Header, HTTPException, status
from app.config import settings


async def verify_token(authorization: Optional[str] = Header(None)) -> None:
    """
    Enforces Bearer authentication if settings.api_token is set and non-empty.
    Returns 401 Unauthorized otherwise.
    """
    if settings.api_token and settings.api_token.strip():
        if not authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing Authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )
        parts = authorization.split()
        if (
            len(parts) != 2
            or parts[0].lower() != "bearer"
            or not secrets.compare_digest(parts[1], settings.api_token.strip())
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API token",
                headers={"WWW-Authenticate": "Bearer"},
            )
