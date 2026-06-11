import json

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
    monkeypatch,
) -> None:
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    get_response = client.get("/api/system/settings", headers=admin_headers)
    assert get_response.status_code == 200
    data = get_response.json()["data"]
    assert data["settings"]["llm"]["enabled"] is True
    assert data["settings"]["llm"]["use_response_format"] is False
    assert data["settings"]["llm"]["api_key_configured"] is False

    save_response = client.put(
        "/api/system/settings",
        headers=admin_headers,
        json={
            "llm": {
                "enabled": True,
                "api_key": "sk-test",
                "base_url": "https://api.example.com/v1",
                "model": "test-model",
                "timeout_seconds": 45,
                "use_response_format": True,
            }
        },
    )

    assert save_response.status_code == 200
    saved = save_response.json()["data"]
    assert saved["settings"]["llm"]["base_url"] == "https://api.example.com/v1"
    assert saved["settings"]["llm"]["model"] == "test-model"
    assert saved["settings"]["llm"]["use_response_format"] is True
    assert saved["settings"]["llm"]["api_key_configured"] is True
    assert "api_key" not in saved["settings"]["llm"]
    assert saved["updated_by_user_id"] is not None

    rows = db_session.query(SystemSetting).all()
    assert len(rows) == 1
    stored = json.loads(rows[0].value_json)
    assert stored["api_key"] == "sk-test"
    assert stored["use_response_format"] is True


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
