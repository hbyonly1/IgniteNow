import json

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models import Episode, Job, UserAccount


def test_analysis_queue_requires_workspace_login(client: TestClient) -> None:
    response = client.get("/api/analysis/queue")

    assert response.status_code == 401
    assert response.json()["detail"] == "authentication required"


def test_analysis_queue_returns_episode_drama_counts_and_latest_job(
    client: TestClient,
    db_session: Session,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    job = Job(
        type="ai_analyze",
        status="running",
        progress=42,
        payload_json=json.dumps({"episode_id": demo_episode.id}),
        rq_job_id="rq-analysis-queue",
    )
    db_session.add(job)
    db_session.commit()

    response = client.get("/api/analysis/queue", headers=admin_headers)

    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    item = data[0]
    assert item["id"] == demo_episode.id
    assert item["drama_title"] == "Test Drama"
    assert item["subtitle_ready"] is False
    assert item["asset_status"] == "incomplete"
    assert item["draft_highlight_count"] == 1
    assert item["published_highlight_count"] == 1
    assert item["rejected_highlight_count"] == 1
    assert item["latest_job"]["id"] == job.id
    assert item["latest_job"]["progress"] == 42


def test_analysis_queue_filters_status_and_uploader_ownership(
    client: TestClient,
    db_session: Session,
    demo_episode: Episode,
    uploader_headers: dict[str, str],
) -> None:
    uploader = db_session.query(UserAccount).filter(UserAccount.username == "uploader-user").one()

    hidden_response = client.get("/api/analysis/queue", headers=uploader_headers)
    assert hidden_response.status_code == 200
    assert hidden_response.json()["data"] == []

    demo_episode.owner_user_id = uploader.id
    demo_episode.analyze_status = "success"
    db_session.commit()

    success_response = client.get("/api/analysis/queue", headers=uploader_headers, params={"status": "success"})
    pending_response = client.get("/api/analysis/queue", headers=uploader_headers, params={"status": "pending"})

    assert success_response.status_code == 200
    assert len(success_response.json()["data"]) == 1
    assert pending_response.status_code == 200
    assert pending_response.json()["data"] == []


def test_analysis_queue_rejects_illegal_status(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/api/analysis/queue", headers=admin_headers, params={"status": "unknown"})

    assert response.status_code == 400
    assert response.json()["detail"] == "illegal status"
