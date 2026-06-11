from fastapi.testclient import TestClient

from backend.app.services import upload_service


def test_drama_asset_fields_round_trip(client: TestClient, admin_headers: dict[str, str]) -> None:
    create_response = client.post(
        "/api/dramas",
        headers=admin_headers,
        json={
            "title": "Asset Drama",
            "description": "phase2",
            "cover_url": "https://example.com/cover.jpg",
            "wide_cover_url": "https://example.com/wide.jpg",
            "categories": ["都市", "逆袭", ""],
            "cast_tags": ["主演A", "主演B"],
        },
    )

    assert create_response.status_code == 200
    drama = create_response.json()["data"]
    assert drama["wide_cover_url"] == "https://example.com/wide.jpg"
    assert drama["categories"] == ["都市", "逆袭"]
    assert drama["cast_tags"] == ["主演A", "主演B"]
    assert drama["created_at"]
    assert drama["updated_at"]

    update_response = client.put(
        f"/api/dramas/{drama['id']}",
        headers=admin_headers,
        json={
            "categories": ["甜宠"],
            "cast_tags": [],
            "wide_cover_url": "https://example.com/new-wide.jpg",
        },
    )

    assert update_response.status_code == 200
    updated = update_response.json()["data"]
    assert updated["wide_cover_url"] == "https://example.com/new-wide.jpg"
    assert updated["categories"] == ["甜宠"]
    assert updated["cast_tags"] == []

    list_response = client.get("/api/dramas", headers=admin_headers)
    assert list_response.status_code == 200
    listed = list_response.json()["data"][0]
    assert listed["categories"] == ["甜宠"]
    assert listed["cast_tags"] == []


def test_episode_asset_status_contract(client: TestClient, admin_headers: dict[str, str]) -> None:
    drama_response = client.post(
        "/api/dramas",
        headers=admin_headers,
        json={"title": "Episode Asset Drama"},
    )
    drama_id = drama_response.json()["data"]["id"]

    create_response = client.post(
        "/api/episodes",
        headers=admin_headers,
        json={
            "drama_id": drama_id,
            "episode_no": 1,
            "title": "E001",
            "video_url": "https://example.com/video.mp4",
            "subtitle_content": "1\n00:00:01,000 --> 00:00:02,000\nhello",
            "duration": 2,
            "asset_status": "ready",
        },
    )

    assert create_response.status_code == 200
    episode = create_response.json()["data"]
    assert episode["asset_status"] == "ready"
    assert episode["created_at"]
    assert episode["updated_at"]

    update_response = client.put(
        f"/api/episodes/{episode['id']}",
        headers=admin_headers,
        json={"asset_status": "incomplete"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["asset_status"] == "incomplete"

    illegal_response = client.put(
        f"/api/episodes/{episode['id']}",
        headers=admin_headers,
        json={"asset_status": "unknown"},
    )
    assert illegal_response.status_code == 400
    assert illegal_response.json()["detail"] == "illegal asset status"

    null_response = client.put(
        f"/api/episodes/{episode['id']}",
        headers=admin_headers,
        json={"asset_status": None},
    )
    assert null_response.status_code == 400
    assert null_response.json()["detail"] == "illegal asset status"


def test_admin_asset_file_upload_cover(
    client: TestClient,
    admin_headers: dict[str, str],
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(upload_service, "VIDEO_DIR", tmp_path / "videos")
    monkeypatch.setattr(upload_service, "SUBTITLE_DIR", tmp_path / "subtitles")
    monkeypatch.setattr(upload_service, "IMAGE_DIR", tmp_path / "images")

    response = client.post(
        "/api/admin/assets/files",
        headers=admin_headers,
        data={"asset_type": "cover"},
        files={"file": ("cover.png", b"png-bytes", "image/png")},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["asset_type"] == "cover"
    assert data["file_size"] == len(b"png-bytes")
    assert data["mime_type"] == "image/png"
    assert data["path"].endswith(".png")
    assert (tmp_path / "images").exists()


def test_admin_episode_upload_creates_episode_with_video_metadata(
    client: TestClient,
    admin_headers: dict[str, str],
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(upload_service, "VIDEO_DIR", tmp_path / "videos")
    monkeypatch.setattr(upload_service, "SUBTITLE_DIR", tmp_path / "subtitles")
    monkeypatch.setattr(upload_service, "IMAGE_DIR", tmp_path / "images")

    def fake_probe(path, content_type=""):
        return {
            "duration": 12.5,
            "width": 1080,
            "height": 1920,
            "file_size": path.stat().st_size,
            "mime_type": content_type,
        }

    monkeypatch.setattr("backend.app.routers.admin.probe_video_metadata", fake_probe)

    drama_response = client.post(
        "/api/dramas",
        headers=admin_headers,
        json={"title": "Upload Drama"},
    )
    drama_id = drama_response.json()["data"]["id"]

    response = client.post(
        f"/api/dramas/{drama_id}/episodes/upload",
        headers=admin_headers,
        data={
            "episode_no": "3",
            "episode_title": "Upload Episode",
            "subtitle_content": "1\n00:00:01,000 --> 00:00:02,000\nhello",
        },
        files={"video_file": ("episode.mp4", b"video-bytes", "video/mp4")},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["drama_id"] == drama_id
    assert data["episode_no"] == 3
    assert data["title"] == "Upload Episode"
    assert data["duration"] == 12.5
    assert data["asset_status"] == "ready"
    assert data["video_width"] == 1080
    assert data["video_height"] == 1920
    assert data["video_file_size"] == len(b"video-bytes")
    assert data["video_mime_type"] == "video/mp4"
