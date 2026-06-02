from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import UserAccount

security = HTTPBearer(auto_error=False)
ADMIN_ROLE = "admin"
UPLOADER_ROLE = "uploader"
ALLOWED_ROLES = {ADMIN_ROLE, UPLOADER_ROLE}


def hash_password(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, salt, expected = stored_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    actual = hash_password(password, salt).split("$", 2)[2]
    return hmac.compare_digest(actual, expected)


def create_access_token(user: UserAccount) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def user_from_token(token: str, db: Session) -> UserAccount:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = int(payload.get("sub", "0"))
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="invalid token") from exc

    user = db.get(UserAccount, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="user not found")
    return user


def require_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> UserAccount:
    if not credentials:
        raise HTTPException(status_code=401, detail="authentication required")
    return user_from_token(credentials.credentials, db)
