from collections.abc import Callable
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.auth_service import ADMIN_ROLE, security, user_from_token


def require_roles(*roles: str) -> Callable:
    allowed_roles = set(roles)

    def dependency(
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
        db: Session = Depends(get_db),
    ):
        if not credentials:
            raise HTTPException(status_code=401, detail="authentication required")
        user = user_from_token(credentials.credentials, db)
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="insufficient role")
        return user

    return dependency


def require_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="authentication required")
    user = user_from_token(credentials.credentials, db)
    if user.role != ADMIN_ROLE:
        raise HTTPException(status_code=403, detail="admin role required")
    return user


def ok(data=None, message="ok"):
    return {"success": True, "message": message, "data": data}
