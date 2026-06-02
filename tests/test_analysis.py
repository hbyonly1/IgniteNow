from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models import Drama, Episode, HighlightEvent, UserAccount


def test_login_required_for_analysis(client: TestClient, demo_episode: Episode) -> None:
    response = client.post(f"/api/episodes/{demo_episode.id}/analyze", json={"force_reanalyze": False})

    assert response.status_code == 401


def test_analysis_requires_subtitle_and_marks_episode_failed(
    client: TestClient,
    db_session: Session,
    demo_episode: Episode,
    uploader_headers: dict[str, str],
) -> None:
    uploader = db_session.query(UserAccount).filter(UserAccount.username == "uploader-user").one()
    demo_episode.owner_user_id = uploader.id
    db_session.commit()

    response = client.post(
        f"/api/episodes/{demo_episode.id}/analyze",
        json={"force_reanalyze": False},
        headers=uploader_headers,
    )

    assert response.status_code == 400
    db_session.refresh(demo_episode)
    assert demo_episode.analyze_status == "failed"
    assert demo_episode.analyze_error == "subtitle is required"


def test_analysis_creates_draft_highlights_without_status_from_ai(
    client: TestClient,
    db_session: Session,
    admin_headers: dict[str, str],
) -> None:
    drama = Drama(title="Analysis Drama")
    episode = Episode(
        drama=drama,
        episode_no=1,
        title="Analysis Episode",
        video_url="https://example.com/video.mp4",
        subtitle_content="1\n00:00:01,000 --> 00:00:03,000\n真相终于曝光，身份反转。",
        duration=10,
    )
    db_session.add_all([drama, episode])
    db_session.commit()
    db_session.refresh(episode)

    response = client.post(
        f"/api/episodes/{episode.id}/analyze",
        json={"force_reanalyze": False},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["data"]["highlight_count"] == 1
    assert response.json()["data"]["invalid_count"] == 0
    highlight = db_session.query(HighlightEvent).filter(HighlightEvent.episode_id == episode.id).one()
    assert highlight.status == "draft"


def test_manual_highlight_rejects_time_after_episode_duration(
    client: TestClient,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    response = client.post(
        f"/api/episodes/{demo_episode.id}/highlights",
        headers=admin_headers,
        json={
            "start_time": 29,
            "end_time": 40,
            "highlight_type": "suspense",
            "button_text": "快更",
            "effect": "countdown",
            "status": "draft",
        },
    )

    assert response.status_code == 400
    assert "duration" in response.json()["detail"]


def test_manual_highlight_rejects_illegal_effect(
    client: TestClient,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    response = client.post(
        f"/api/episodes/{demo_episode.id}/highlights",
        headers=admin_headers,
        json={
            "start_time": 15,
            "end_time": 18,
            "highlight_type": "suspense",
            "button_text": "快更",
            "effect": "unknown",
            "status": "draft",
        },
    )

    assert response.status_code == 400
    assert "effect" in response.json()["detail"]
