import json
import os
from copy import deepcopy
from typing import Any

from sqlalchemy.orm import Session

from ..models import SystemSetting


DEFAULT_LLM_SETTINGS = {
    "enabled": True,
    "base_url": os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
    "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
    "timeout_seconds": float(os.getenv("LLM_TIMEOUT_SECONDS", "90")),
}

DEFAULT_SYSTEM_SETTINGS = {
    "llm": DEFAULT_LLM_SETTINGS,
}


def _parse_json_object(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def load_raw_system_settings(db: Session) -> dict[str, dict[str, Any]]:
    settings = deepcopy(DEFAULT_SYSTEM_SETTINGS)
    rows = db.query(SystemSetting).all()
    for row in rows:
        if row.key not in settings:
            continue
        settings[row.key].update(_parse_json_object(row.value_json))
    return settings


def public_system_settings(db: Session) -> dict[str, Any]:
    settings = load_raw_system_settings(db)
    rows = db.query(SystemSetting).all()
    updated_at = None
    updated_by_user_id = None
    for row in rows:
        if row.key not in DEFAULT_SYSTEM_SETTINGS:
            continue
        if not updated_at or row.updated_at > updated_at:
            updated_at = row.updated_at
            updated_by_user_id = row.updated_by_user_id

    public = deepcopy(settings)
    llm = public.get("llm", {})
    llm.pop("api_key", None)
    llm["api_key_configured"] = bool(settings.get("llm", {}).get("api_key") or os.getenv("LLM_API_KEY"))
    return {
        "settings": public,
        "updated_at": updated_at.isoformat() if updated_at else None,
        "updated_by_user_id": updated_by_user_id,
    }


def load_llm_config(db: Session) -> dict[str, Any]:
    raw = load_raw_system_settings(db).get("llm", {})
    return {
        "enabled": bool(raw.get("enabled", True)),
        "api_key": raw.get("api_key") or os.getenv("LLM_API_KEY", ""),
        "base_url": raw.get("base_url") or os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
        "model": raw.get("model") or os.getenv("LLM_MODEL", "gpt-4o-mini"),
        "timeout_seconds": raw.get("timeout_seconds") or os.getenv("LLM_TIMEOUT_SECONDS", "90"),
    }
