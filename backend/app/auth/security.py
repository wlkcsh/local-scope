"""
Zero-dependency cryptographic security utilities using Python standard library.
Implements scrypt password hashing, HMAC-SHA256 signed tokens, and input validation.
"""

import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from typing import Any, Dict, Optional

STEAMID64_REGEX = re.compile(r"^7656119[0-9]{10}$")
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_-]{3,24}$")


def hash_password(password: str) -> str:
    """Hash a password with scrypt (n=16384, r=8, p=1) and a random 16-byte salt."""
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters long")
    salt = secrets.token_bytes(16)
    n, r, p = 16384, 8, 1
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=32)
    return f"scrypt${n}${r}${p}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored scrypt hash in constant time."""
    if not password or not stored_hash:
        return False
    try:
        parts = stored_hash.split("$")
        if len(parts) != 6 or parts[0] != "scrypt":
            return False
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        salt = bytes.fromhex(parts[4])
        expected_dk = bytes.fromhex(parts[5])
        actual_dk = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=len(expected_dk)
        )
        return secrets.compare_digest(actual_dk, expected_dk)
    except Exception:
        return False


def _b64u_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64u_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_token(payload: Dict[str, Any], ttl_seconds: int, secret: str) -> str:
    """Create a compact HMAC-SHA256 signed token with an expiration timestamp."""
    body = dict(payload)
    body["exp"] = int(time.time()) + ttl_seconds
    raw_json = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    b64_payload = _b64u_encode(raw_json)
    sig = hmac.new(secret.encode("utf-8"), b64_payload.encode("ascii"), hashlib.sha256).digest()
    b64_sig = _b64u_encode(sig)
    return f"{b64_payload}.{b64_sig}"


def verify_token_str(
    token: str, secret: str, expected_scope: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Verify an HMAC-SHA256 signed token's signature, expiration, and optional scope."""
    if not token or "." not in token:
        return None
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        b64_payload, b64_sig = parts
        expected_sig = hmac.new(
            secret.encode("utf-8"), b64_payload.encode("ascii"), hashlib.sha256
        ).digest()
        actual_sig = _b64u_decode(b64_sig)
        if not secrets.compare_digest(expected_sig, actual_sig):
            return None

        payload = json.loads(_b64u_decode(b64_payload).decode("utf-8"))
        if not isinstance(payload, dict):
            return None
        exp = payload.get("exp")
        if not isinstance(exp, (int, float)) or exp < time.time():
            return None
        if expected_scope and payload.get("scope") != expected_scope:
            return None
        return payload
    except Exception:
        return None


def validate_steamid64(steamid: Optional[str]) -> Optional[str]:
    """Validate optional 17-digit SteamID64 string (starts with 7656119)."""
    if steamid is None:
        return None
    cleaned = steamid.strip()
    if not cleaned:
        return None
    if not STEAMID64_REGEX.match(cleaned):
        raise ValueError("Invalid SteamID64 format (must be 17 digits starting with 7656119)")
    return cleaned


def validate_username(username: str) -> str:
    """Validate username (3-24 alphanumeric, underscore, or hyphen characters)."""
    cleaned = username.strip()
    if not USERNAME_REGEX.match(cleaned):
        raise ValueError("Username must be 3–24 characters using letters, numbers, _ or -")
    return cleaned
