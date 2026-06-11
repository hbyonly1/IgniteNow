from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models import Episode, HighlightEvent, UserInteractionLog


def _published_highlight(db_session: Session, episode: Episode) -> HighlightEvent:
    return (
        db_session.query(HighlightEvent)
        .filter(HighlightEvent.episode_id == episode.id, HighlightEvent.status == "published")
        .one()
    )


def _interaction_key(user_id: str, highlight_id: int, action_type: str, bucket: int = 1) -> str:
    return f"{user_id}_{highlight_id}_{action_type}_{bucket}"


def test_duplicate_idempotency_key_does_not_write_twice(
    client: TestClient,
    db_session: Session,
    demo_episode: Episode,
) -> None:
    highlight = _published_highlight(db_session, demo_episode)
    user_id = "anonymous_user_1"
    payload = {
        "user_id": user_id,
        "episode_id": demo_episode.id,
        "highlight_id": highlight.id,
        "action_type": "click",
        "action_value": "clicked",
        "watch_time": 3.2,
        "idempotency_key": _interaction_key(user_id, highlight.id, "click"),
    }

    first = client.post("/api/interactions", json=payload)
    second = client.post("/api/interactions", json=payload)

    assert first.status_code == 200
    assert first.json()["message"] == "interaction recorded"
    assert second.status_code == 200
    assert second.json()["message"] == "duplicate interaction ignored"
    assert db_session.query(UserInteractionLog).count() == 1


def test_interaction_rejects_illegal_action_type(client: TestClient, demo_episode: Episode, db_session: Session) -> None:
    highlight = _published_highlight(db_session, demo_episode)
    user_id = "anonymous_user_1"
    response = client.post(
        "/api/interactions",
        json={
            "user_id": user_id,
            "episode_id": demo_episode.id,
            "highlight_id": highlight.id,
            "action_type": "share",
            "idempotency_key": _interaction_key(user_id, highlight.id, "share"),
        },
    )

    assert response.status_code == 400


def test_interaction_rejects_mismatched_idempotency_key(
    client: TestClient,
    demo_episode: Episode,
    db_session: Session,
) -> None:
    highlight = _published_highlight(db_session, demo_episode)
    response = client.post(
        "/api/interactions",
        json={
            "user_id": "anonymous_user_1",
            "episode_id": demo_episode.id,
            "highlight_id": highlight.id,
            "action_type": "click",
            "idempotency_key": _interaction_key("anonymous_user_2", highlight.id, "click"),
        },
    )

    assert response.status_code == 400
    assert "idempotency_key" in response.json()["detail"]


def test_interaction_rejects_non_anonymous_without_token(
    client: TestClient,
    demo_episode: Episode,
    db_session: Session,
) -> None:
    highlight = _published_highlight(db_session, demo_episode)
    response = client.post(
        "/api/interactions",
        json={
            "user_id": "user_1",
            "episode_id": demo_episode.id,
            "highlight_id": highlight.id,
            "action_type": "click",
            "idempotency_key": _interaction_key("user_1", highlight.id, "click"),
        },
    )

    assert response.status_code == 401


def test_interaction_accepts_token_bound_user_id(
    client: TestClient,
    demo_episode: Episode,
    db_session: Session,
) -> None:
    highlight = _published_highlight(db_session, demo_episode)
    register = client.post("/api/auth/register", json={"username": "player-user", "password": "secret123"})
    assert register.status_code == 200
    user_id = f"user_{register.json()['data']['user']['id']}"
    token = register.json()["data"]["access_token"]

    response = client.post(
        "/api/interactions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "user_id": user_id,
            "episode_id": demo_episode.id,
            "highlight_id": highlight.id,
            "action_type": "click",
            "idempotency_key": _interaction_key(user_id, highlight.id, "click"),
        },
    )

    assert response.status_code == 200
