from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import UserAccount
from ..config import settings
from ..schemas import AuthLogin, AuthRegister, AuthTokenOut, AuthUserCreate, AuthUserOut
from ..services.auth_service import ALLOWED_ROLES, create_access_token, hash_password, require_user, verify_password
from .common import ok, require_admin

router = APIRouter(prefix="/auth")


def _token_response(user: UserAccount) -> dict:
    token = create_access_token(user)
    user_out = AuthUserOut(id=user.id, username=user.username, role=user.role)
    return AuthTokenOut(
        access_token=token,
        expires_in=settings.jwt_expire_minutes * 60,
        user=user_out,
    ).model_dump()


def _create_user(payload: AuthRegister, role: str, db: Session) -> UserAccount:
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="illegal role")
    if db.query(UserAccount).filter(UserAccount.username == username).first():
        raise HTTPException(status_code=409, detail="username already exists")
    user = UserAccount(username=username, password_hash=hash_password(payload.password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/register")
def register(payload: AuthRegister, db: Session = Depends(get_db)):
    user = _create_user(payload, "uploader", db)
    return ok(_token_response(user), "registered")


@router.post("/login")
def login(payload: AuthLogin, db: Session = Depends(get_db)):
    user = db.query(UserAccount).filter(UserAccount.username == payload.username.strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid username or password")
    return ok(_token_response(user), "logged in")


@router.get("/me")
def me(user: UserAccount = Depends(require_user)):
    return ok(_token_response(user), "authenticated")


@router.post("/logout")
def logout():
    return ok({"revoked": False}, "logged out")


@router.post("/admin/users", dependencies=[Depends(require_admin)])
def create_admin_managed_user(payload: AuthUserCreate, db: Session = Depends(get_db)):
    user = _create_user(payload, payload.role, db)
    return ok(_token_response(user), "user created")
