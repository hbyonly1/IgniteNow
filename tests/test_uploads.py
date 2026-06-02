from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models import Drama, Episode, UserAccount
from backend.app.services import upload_service


def _auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post("/api/auth/register", json={"username": "uploader", "password": "secret123"})
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_upload_requires_login(client: TestClient) -> None:
    response = client.post(
        "/api/uploads/episodes",
        data={"drama_title": "Upload Drama", "episode_no": "1", "episode_title": "E001"},
        files={"video_file": ("demo.mp4", b"mp4-bytes", "video/mp4")},
    )

    assert response.status_code == 401


def test_upload_episode_creates_drama_episode_and_player_entry(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(upload_service, "VIDEO_DIR", tmp_path / "videos")
    monkeypatch.setattr(upload_service, "SUBTITLE_DIR", tmp_path / "subtitles")
    headers = _auth_headers(client)

    response = client.post(
        "/api/uploads/episodes",
        headers=headers,
        data={
            "drama_title": "Upload Drama",
            "drama_description": "from mobile",
            "episode_no": "1",
            "episode_title": "E001",
            "duration": "12",
        },
        files={
            "video_file": ("demo.mp4", b"mp4-bytes", "video/mp4"),
            "subtitle_file": ("demo.srt", "1\n00:00:01,000 --> 00:00:02,000\n你好".encode("utf-8"), "text/plain"),
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["has_subtitle"] is True
    drama = db_session.get(Drama, data["drama_id"])
    episode = db_session.get(Episode, data["episode_id"])
    assert drama is not None
    assert drama.title == "Upload Drama"
    assert episode is not None
    assert episode.subtitle_content.endswith("你好")
    uploader = db_session.query(UserAccount).filter(UserAccount.username == "uploader").one()
    assert episode.owner_user_id == uploader.id
    assert Path(episode.video_url).exists()

    dramas = client.get("/api/player/dramas").json()["data"]
    assert any(item["drama_id"] == drama.id for item in dramas)
    episodes = client.get(f"/api/player/dramas/{drama.id}/episodes").json()["data"]
    assert episodes[0]["episode_id"] == episode.id
    player = client.get(f"/api/player/episodes/{episode.id}").json()["data"]
    assert player["video_url"].endswith(f"/api/player/episodes/{episode.id}/video")


def test_upload_rejects_non_mp4_video(client: TestClient, tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(upload_service, "VIDEO_DIR", tmp_path / "videos")
    monkeypatch.setattr(upload_service, "SUBTITLE_DIR", tmp_path / "subtitles")
    headers = _auth_headers(client)

    response = client.post(
        "/api/uploads/episodes",
        headers=headers,
        data={"drama_title": "Upload Drama", "episode_no": "1", "episode_title": "E001"},
        files={"video_file": ("demo.mov", b"mov-bytes", "video/quicktime")},
    )

    assert response.status_code == 400
    assert "video_file" in response.json()["detail"]


def test_upload_accepts_subtitle_content_without_file(
    client: TestClient,
    db_session: Session,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(upload_service, "VIDEO_DIR", tmp_path / "videos")
    monkeypatch.setattr(upload_service, "SUBTITLE_DIR", tmp_path / "subtitles")
    headers = _auth_headers(client)

    response = client.post(
        "/api/uploads/episodes",
        headers=headers,
        data={
            "drama_title": "Text Subtitle Drama",
            "episode_no": "1",
            "episode_title": "E001",
            "subtitle_content": "plain subtitle",
        },
        files={"video_file": ("demo.mp4", b"mp4-bytes", "video/mp4")},
    )

    assert response.status_code == 200
    episode = db_session.get(Episode, response.json()["data"]["episode_id"])
    assert episode is not None
    assert episode.subtitle_content == "plain subtitle"
