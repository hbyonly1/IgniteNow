from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import HighlightEvent, UserInteractionLog
from ..schemas import ACTION_TYPES, InteractionCreate
from ..services.auth_service import security, user_from_token
from .common import ok

router = APIRouter()


def _validate_interaction_identity(
    payload: InteractionCreate,
    credentials: Optional[HTTPAuthorizationCredentials],
    db: Session,
) -> None:
    expected_prefix = f"{payload.user_id}_{payload.highlight_id}_{payload.action_type}_"
    if not payload.idempotency_key.startswith(expected_prefix):
        raise HTTPException(status_code=400, detail="idempotency_key does not match interaction identity")

    if payload.user_id.startswith("anonymous_"):
        return

    if not credentials:
        raise HTTPException(status_code=401, detail="authentication required for non-anonymous user")
    user = user_from_token(credentials.credentials, db)
    if payload.user_id != f"user_{user.id}":
        raise HTTPException(status_code=403, detail="interaction user does not match token")


@router.post("/interactions")
def create_interaction(
    payload: InteractionCreate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    if payload.action_type not in ACTION_TYPES:
        raise HTTPException(status_code=400, detail="illegal action_type")
    _validate_interaction_identity(payload, credentials, db)
    highlight = db.get(HighlightEvent, payload.highlight_id)
    if not highlight or highlight.episode_id != payload.episode_id:
        raise HTTPException(status_code=404, detail="highlight not found for episode")
    log = UserInteractionLog(**payload.model_dump())
    db.add(log)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return ok(None, "duplicate interaction ignored")
    return ok(None, "interaction recorded")
