from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.models import Episode, UserAccount
from backend.app.services.auth_service import hash_password


def test_workspace_reads_require_login(client: TestClient, demo_episode: Episode) -> None:
    assert client.get("/api/dramas").status_code == 401
    assert client.get("/api/episodes").status_code == 401
    assert client.get(f"/api/episodes/{demo_episode.id}/highlights").status_code == 401


def test_admin_jwt_can_access_admin_reads(
    client: TestClient,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    assert client.get("/api/dramas", headers=admin_headers).status_code == 200
    assert client.get("/api/episodes", headers=admin_headers).status_code == 200
    assert client.get(f"/api/episodes/{demo_episode.id}/highlights", headers=admin_headers).status_code == 200


def test_uploader_jwt_can_access_workspace_reads_and_analysis(
    client: TestClient,
    db_session,
    demo_episode: Episode,
    uploader_headers: dict[str, str],
) -> None:
    uploader = db_session.query(UserAccount).filter(UserAccount.username == "uploader-user").one()
    demo_episode.owner_user_id = uploader.id
    db_session.commit()

    assert client.get("/api/dramas", headers=uploader_headers).status_code == 200
    assert client.get("/api/episodes", headers=uploader_headers).status_code == 200

    response = client.post(
        f"/api/episodes/{demo_episode.id}/analyze",
        headers=uploader_headers,
        json={"force_reanalyze": False},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "subtitle is required"


def test_uploader_only_sees_owned_content(
    client: TestClient,
    demo_episode: Episode,
    uploader_headers: dict[str, str],
) -> None:
    dramas_response = client.get("/api/dramas", headers=uploader_headers)
    episodes_response = client.get("/api/episodes", headers=uploader_headers)
    analyze_response = client.post(
        f"/api/episodes/{demo_episode.id}/analyze",
        headers=uploader_headers,
        json={"force_reanalyze": False},
    )

    assert dramas_response.status_code == 200
    assert episodes_response.status_code == 200
    assert dramas_response.json()["data"] == []
    assert episodes_response.json()["data"] == []
    assert analyze_response.status_code == 403


def test_auth_response_matches_frontend_contract(client: TestClient, db_session) -> None:
    db_session.add(UserAccount(username="contract-admin", password_hash=hash_password("secret123"), role="admin"))
    db_session.commit()

    login_response = client.post("/api/auth/login", json={"username": "contract-admin", "password": "secret123"})
    assert login_response.status_code == 200
    data = login_response.json()["data"]

    assert data["access_token"]
    assert data["token_type"] == "Bearer"
    assert data["expires_in"] == settings.jwt_expire_minutes * 60
    assert data["user"] == {
        "id": data["user_id"],
        "username": "contract-admin",
        "role": "admin",
    }
    assert data["username"] == "contract-admin"
    assert data["role"] == "admin"

    me_response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me_response.status_code == 200
    assert me_response.json()["data"]["user"]["role"] == "admin"

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json()["data"] == {"revoked": False}


def test_uploader_jwt_cannot_access_admin_only_endpoints(
    client: TestClient,
    demo_episode: Episode,
    uploader_headers: dict[str, str],
) -> None:
    highlights_response = client.get(
        f"/api/episodes/{demo_episode.id}/highlights",
        headers=uploader_headers,
    )
    analytics_response = client.get("/api/analytics/overview", headers=uploader_headers)

    assert highlights_response.status_code == 403
    assert analytics_response.status_code == 403
    assert highlights_response.json()["detail"] == "admin role required"
    assert analytics_response.json()["detail"] == "admin role required"


def test_admin_managed_user_rejects_illegal_role(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.post(
        "/api/auth/admin/users",
        headers=admin_headers,
        json={"username": "bad-role", "password": "secret123", "role": "owner"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "illegal role"
