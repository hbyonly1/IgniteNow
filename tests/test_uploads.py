"""移动端上传接口已下线测试。

按 BACKEND_MOBILE_INTEGRATION_PLAN.md §5 决定，POST /api/uploads/episodes 返回 410 Gone。
"""

from fastapi.testclient import TestClient


def test_upload_episode_returns_gone(client: TestClient) -> None:
    """旧移动端上传接口应返回 410 Gone。"""
    response = client.post(
        "/api/uploads/episodes",
        data={"drama_title": "Upload Drama", "episode_no": "1", "episode_title": "E001"},
        files={"video_file": ("demo.mp4", b"mp4-bytes", "video/mp4")},
    )
    assert response.status_code == 410
    body = response.json()
    assert body["ok"] is False
    assert "下线" in body["detail"]
