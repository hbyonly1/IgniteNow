from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models import SystemSetting


def test_system_settings_require_admin(
    client: TestClient,
    uploader_headers: dict[str, str],
) -> None:
    assert client.get("/api/system/settings").status_code == 401
    response = client.put(
        "/api/system/settings",
        headers=uploader_headers,
        json={"player": {"overlay_duration_ms": 3000}},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "admin role required"


def test_system_settings_defaults_and_save(
    client: TestClient,
    db_session: Session,
    admin_headers: dict[str, str],
) -> None:
    get_response = client.get("/api/system/settings", headers=admin_headers)
    assert get_response.status_code == 200
    data = get_response.json()["data"]
    assert data["settings"]["player"]["overlay_duration_ms"] == 4000
    assert data["settings"]["ai"]["max_highlights_per_episode"] == 8

    save_response = client.put(
        "/api/system/settings",
        headers=admin_headers,
        json={
            "player": {"overlay_duration_ms": 5500, "record_ignore": False},
            "review": {"min_confidence": 0.8},
        },
    )

    assert save_response.status_code == 200
    saved = save_response.json()["data"]
    assert saved["settings"]["player"]["overlay_duration_ms"] == 5500
    assert saved["settings"]["player"]["record_ignore"] is False
    assert saved["settings"]["review"]["min_confidence"] == 0.8
    assert saved["settings"]["review"]["default_highlight_status"] == "draft"
    assert saved["updated_by_user_id"] is not None

    rows = db_session.query(SystemSetting).all()
    assert {row.key for row in rows} == {"ai", "review", "player", "upload", "security"}
