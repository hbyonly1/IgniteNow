from fastapi.testclient import TestClient

from backend.app.models import Episode


def test_player_episode_only_returns_published_highlights(client: TestClient, demo_episode: Episode) -> None:
    response = client.get(f"/api/player/episodes/{demo_episode.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    highlights = body["data"]["highlights"]
    assert len(highlights) == 1
    assert highlights[0]["button_text"] == "反转了"
    assert highlights[0]["effect"] == "shocked"
    assert "reason" not in highlights[0]
    assert "confidence" not in highlights[0]
    assert "status" not in highlights[0]


def test_player_episode_summary_counts_only_published(client: TestClient, demo_episode: Episode) -> None:
    response = client.get(f"/api/player/dramas/{demo_episode.drama_id}/episodes")

    assert response.status_code == 200
    episodes = response.json()["data"]
    assert len(episodes) == 1
    assert episodes[0]["published_highlight_count"] == 1
