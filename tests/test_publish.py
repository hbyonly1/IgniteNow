from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models import Episode, HighlightEvent, PublishJob, PublishJobItem


def test_publish_endpoints_require_admin(
    client: TestClient,
    demo_episode: Episode,
    uploader_headers: dict[str, str],
) -> None:
    assert client.get("/api/publish/pending-items").status_code == 401

    response = client.post(
        "/api/publish/jobs",
        headers=uploader_headers,
        json={"episode_ids": [demo_episode.id], "channel": "android"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "admin role required"


def test_publish_rejects_non_android_channel(
    client: TestClient,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    response = client.post(
        "/api/publish/jobs",
        headers=admin_headers,
        json={"episode_ids": [demo_episode.id], "channel": "h5"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "illegal channel"


def test_publish_job_publishes_draft_highlights_to_player(
    client: TestClient,
    db_session: Session,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    before = client.get(f"/api/player/episodes/{demo_episode.id}").json()["data"]["highlights"]
    assert len(before) == 1

    response = client.post(
        "/api/publish/jobs",
        headers=admin_headers,
        json={"episode_ids": [demo_episode.id], "channel": "android"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "success"
    assert data["item_count"] == 1
    assert data["success_count"] == 1
    assert data["items"][0]["status"] == "success"

    job = db_session.query(PublishJob).one()
    item = db_session.query(PublishJobItem).one()
    assert job.channel == "android"
    assert item.episode_id == demo_episode.id

    after = client.get(f"/api/player/episodes/{demo_episode.id}").json()["data"]["highlights"]
    assert len(after) == 2
    assert {item["button_text"] for item in after} == {"反转了", "磕到了"}
    assert all("reason" not in item and "confidence" not in item and "status" not in item for item in after)

    rejected = (
        db_session.query(HighlightEvent)
        .filter(HighlightEvent.episode_id == demo_episode.id, HighlightEvent.status == "rejected")
        .one()
    )
    assert rejected.button_text == "替她反击"


def test_failed_publish_keeps_overlapping_drafts_unpublished(
    client: TestClient,
    db_session: Session,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    overlapping_draft = HighlightEvent(
        episode_id=demo_episode.id,
        start_time=4,
        end_time=6,
        highlight_type="conflict",
        emotion="angry",
        intensity=0.7,
        confidence=0.8,
        trigger_score=0.6,
        reason="overlaps published",
        button_text="冲突升级",
        effect="angry",
        status="draft",
    )
    db_session.add(overlapping_draft)
    db_session.commit()

    response = client.post(
        "/api/publish/jobs",
        headers=admin_headers,
        json={"episode_ids": [demo_episode.id], "channel": "android"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "failed"
    assert data["failed_count"] == 1
    assert "overlaps" in data["error"]

    db_session.refresh(overlapping_draft)
    assert overlapping_draft.status == "draft"

    player_highlights = client.get(f"/api/player/episodes/{demo_episode.id}").json()["data"]["highlights"]
    assert len(player_highlights) == 1
    assert player_highlights[0]["button_text"] == "反转了"


def test_failed_publish_keeps_legacy_effect_unpublished(
    client: TestClient,
    db_session: Session,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    legacy_draft = HighlightEvent(
        episode_id=demo_episode.id,
        start_time=18,
        end_time=20,
        highlight_type="satisfying",
        emotion="satisfied",
        intensity=0.7,
        confidence=0.8,
        trigger_score=0.6,
        reason="legacy effect",
        button_text="爽到了",
        effect="boom_effect",
        status="draft",
    )
    db_session.add(legacy_draft)
    db_session.commit()

    response = client.post(
        "/api/publish/jobs",
        headers=admin_headers,
        json={"episode_ids": [demo_episode.id], "channel": "android"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "failed"
    assert "illegal effect" in data["error"]

    db_session.refresh(legacy_draft)
    assert legacy_draft.status == "draft"


def test_publish_pending_items_and_recent_jobs(
    client: TestClient,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    pending_response = client.get("/api/publish/pending-items", headers=admin_headers)
    assert pending_response.status_code == 200
    pending_items = pending_response.json()["data"]
    assert len(pending_items) == 1
    assert pending_items[0]["episode_id"] == demo_episode.id
    assert pending_items[0]["status"] == "unpublished"
    assert pending_items[0]["draft_highlight_count"] == 1

    publish_response = client.post(
        "/api/publish/jobs",
        headers=admin_headers,
        json={"episode_ids": [demo_episode.id], "channel": "android"},
    )
    assert publish_response.status_code == 200

    jobs_response = client.get("/api/publish/jobs", headers=admin_headers)
    assert jobs_response.status_code == 200
    jobs = jobs_response.json()["data"]
    assert len(jobs) == 1
    assert jobs[0]["status"] == "success"
    assert jobs[0]["channel"] == "android"


def test_scheduled_publish_does_not_publish_before_time(
    client: TestClient,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    response = client.post(
        "/api/publish/jobs",
        headers=admin_headers,
        json={
            "episode_ids": [demo_episode.id],
            "channel": "android",
            "scheduled_at": "2999-01-01T00:00:00",
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "pending"
    player_highlights = client.get(f"/api/player/episodes/{demo_episode.id}").json()["data"]["highlights"]
    assert len(player_highlights) == 1
