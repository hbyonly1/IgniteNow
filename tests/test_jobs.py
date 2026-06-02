from sqlalchemy.orm import Session

from backend.app.models import Drama, Episode, Job, UserAccount
from backend.app.routers import system


def test_create_ai_analyze_job_requires_existing_episode(client, admin_headers):
    response = client.post(
        "/api/system/jobs",
        headers=admin_headers,
        json={"type": "ai_analyze", "payload": {"episode_id": 999}},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "episode not found"


def test_create_ai_analyze_job_records_status(
    client,
    db_session: Session,
    admin_headers,
    demo_episode,
    monkeypatch,
):
    def fake_create_and_enqueue_job(db: Session, job_type: str, payload: dict) -> Job:
        job = Job(type=job_type, payload_json='{"episode_id": 1}', status="pending", progress=0, rq_job_id="rq-test")
        db.add(job)
        db.commit()
        db.refresh(job)
        return job

    monkeypatch.setattr(system, "create_and_enqueue_job", fake_create_and_enqueue_job)

    response = client.post(
        "/api/system/jobs",
        headers=admin_headers,
        json={"type": "ai_analyze", "payload": {"episode_id": demo_episode.id}},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["type"] == "ai_analyze"
    assert data["status"] == "pending"
    assert data["rq_job_id"] == "rq-test"


def test_uploader_can_read_own_jobs(client, db_session: Session, uploader_headers):
    uploader = db_session.query(UserAccount).filter(UserAccount.username == "uploader-user").one()
    drama = Drama(title="Owned Drama")
    episode = Episode(
        drama=drama,
        owner_user_id=uploader.id,
        episode_no=1,
        title="E001",
        video_url="https://example.com/video.mp4",
    )
    db_session.add_all([drama, episode])
    db_session.flush()
    db_session.add(Job(type="ai_analyze", status="success", progress=100, payload_json=f'{{"episode_id": {episode.id}}}'))
    db_session.commit()

    response = client.get("/api/system/jobs", headers=uploader_headers)

    assert response.status_code == 200
    assert response.json()["data"][0]["type"] == "ai_analyze"
