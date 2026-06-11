from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models import SystemSetting
from backend.app.routers import system


def test_system_settings_require_admin(
    client: TestClient,
    uploader_headers: dict[str, str],
) -> None:
    assert client.get("/api/system/settings").status_code == 401
    response = client.put(
        "/api/system/settings",
        headers=uploader_headers,
        json={},
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
    assert data["settings"] == {}

    save_response = client.put(
        "/api/system/settings",
        headers=admin_headers,
        json={},
    )

    assert save_response.status_code == 200
    saved = save_response.json()["data"]
    assert saved["settings"] == {}
    assert saved["updated_by_user_id"] is None

    rows = db_session.query(SystemSetting).all()
    assert rows == []


def test_system_settings_reject_unwired_options(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.put(
        "/api/system/settings",
        headers=admin_headers,
        json={"player": {"overlay_duration_ms": 5500}},
    )

    assert response.status_code == 422


def test_prompt_template_read_and_write(client: TestClient, admin_headers: dict[str, str], tmp_path, monkeypatch) -> None:
    prompt_path = tmp_path / "prompt_template.md"
    prompt_path.write_text("请输出 highlights，并包含 highlight_type 字段。", encoding="utf-8")
    monkeypatch.setattr(system, "PROMPT_TEMPLATE_PATH", prompt_path)

    get_response = client.get("/api/settings/prompt-template", headers=admin_headers)
    assert get_response.status_code == 200
    assert "highlight_type" in get_response.json()["data"]["content"]

    next_content = "新的 Prompt 模板，请输出 highlights 数组，并保证每条包含 highlight_type 字段。"
    put_response = client.put(
        "/api/settings/prompt-template",
        headers=admin_headers,
        json={"content": next_content},
    )

    assert put_response.status_code == 200
    assert prompt_path.read_text(encoding="utf-8").strip() == next_content
