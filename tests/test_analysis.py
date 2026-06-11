import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.jobs import tasks
from backend.app.models import Drama, Episode, HighlightEvent, Job, JobLog, UserAccount


class _SessionProxy:
    def __init__(self, session: Session) -> None:
        self._session = session

    def __getattr__(self, name: str):
        return getattr(self._session, name)

    def close(self) -> None:
        return None


def test_login_required_for_analysis(client: TestClient, demo_episode: Episode) -> None:
    response = client.post(
        "/api/system/jobs",
        json={"type": "ai_analyze", "payload": {"episode_id": demo_episode.id, "force_reanalyze": False}},
    )

    assert response.status_code == 401


def test_sync_analysis_endpoint_is_removed(
    client: TestClient,
    demo_episode: Episode,
    admin_headers: dict[str, str],
) -> None:
    response = client.post(
        f"/api/episodes/{demo_episode.id}/analyze",
        json={"force_reanalyze": False},
        headers=admin_headers,
    )

    assert response.status_code in {404, 405}


def test_analysis_requires_subtitle_or_local_video_and_marks_episode_failed(
    db_session: Session,
    demo_episode: Episode,
    uploader_headers: dict[str, str],
    monkeypatch,
) -> None:
    uploader = db_session.query(UserAccount).filter(UserAccount.username == "uploader-user").one()
    demo_episode.owner_user_id = uploader.id
    job = Job(
        type="ai_analyze",
        status="pending",
        progress=0,
        payload_json=f'{{"episode_id": {demo_episode.id}, "force_reanalyze": false}}',
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    monkeypatch.setattr(tasks, "SessionLocal", lambda: _SessionProxy(db_session))

    with pytest.raises(ValueError, match="episode.video_url must point to a local uploaded video file"):
        tasks.run_ai_analyze_job(job.id)

    db_session.refresh(demo_episode)
    db_session.refresh(job)
    assert demo_episode.analyze_status == "failed"
    assert demo_episode.analyze_error == "episode.video_url must point to a local uploaded video file"
    assert job.status == "failed"
    assert job.error == "episode.video_url must point to a local uploaded video file"


def test_analysis_runs_subtitle_asr_before_highlight_analysis(
    db_session: Session,
    tmp_path,
    monkeypatch,
) -> None:
    video_path = tmp_path / "episode.mp4"
    video_path.write_bytes(b"fake video")
    drama = Drama(title="ASR Before Analysis")
    episode = Episode(
        drama=drama,
        episode_no=1,
        title="E001",
        video_url=str(video_path),
        subtitle_content="",
        duration=10,
        analyze_status="processing",
    )
    db_session.add_all([drama, episode])
    db_session.flush()
    job = Job(
        type="ai_analyze",
        status="pending",
        progress=0,
        payload_json=f'{{"episode_id": {episode.id}, "force_reanalyze": false}}',
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(episode)
    db_session.refresh(job)

    monkeypatch.setattr(tasks, "SessionLocal", lambda: _SessionProxy(db_session))

    def fake_transcribe_episode_subtitles(db: Session, target: Episode, force: bool = False) -> dict:
        target.subtitle_content = "1\n00:00:01,000 --> 00:00:03,000\n先识别字幕，再识别高光。"
        target.subtitle_url = "asr.srt"
        db.commit()
        db.refresh(target)
        return {"episode_id": target.id, "subtitle_count": 1, "subtitle_url": "asr.srt", "skipped": False}

    monkeypatch.setattr(tasks, "transcribe_episode_subtitles", fake_transcribe_episode_subtitles)

    import backend.app.services.analysis_service as _svc
    monkeypatch.setattr(
        _svc,
        "analyze_subtitle_text",
        lambda content, llm_config=None: {
            "highlights": [
                {
                    "start_time": 1.0,
                    "end_time": 3.0,
                    "highlight_type": "satisfying",
                    "emotion": "爽点",
                    "intensity": 0.75,
                    "confidence": 0.8,
                    "trigger_score": 0.85,
                    "reason": content,
                    "button_text": "爽到了",
                    "effect": "boom_effect",
                }
            ]
        },
    )

    tasks.run_ai_analyze_job(job.id)

    db_session.refresh(job)
    db_session.refresh(episode)
    assert job.status == "success"
    assert episode.analyze_status == "success"
    assert episode.subtitle_content
    highlight = db_session.query(HighlightEvent).filter(HighlightEvent.episode_id == episode.id).one()
    assert highlight.status == "draft"
    assert highlight.button_text == "爽到了"


def test_analysis_creates_draft_highlights_without_status_from_ai(
    db_session: Session,
    monkeypatch,
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
    db_session.flush()
    job = Job(
        type="ai_analyze",
        status="pending",
        progress=0,
        payload_json=f'{{"episode_id": {episode.id}, "force_reanalyze": false}}',
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(episode)
    db_session.refresh(job)

    monkeypatch.setattr(tasks, "SessionLocal", lambda: _SessionProxy(db_session))

    # analyze_subtitle_text 现已作为顶层属性导入到 analysis_service，
    # 直接 patch 该模块的绑定即可替换 LLM 调用
    import backend.app.services.analysis_service as _svc
    monkeypatch.setattr(
        _svc,
        "analyze_subtitle_text",
        lambda _content, llm_config=None: {
            "highlights": [
                {
                    "start_time": 1.0,
                    "end_time": 3.0,
                    "highlight_type": "reversal",
                    "emotion": "震惊",
                    "intensity": 0.85,
                    "confidence": 0.85,
                    "trigger_score": 0.85,
                    "reason": "测试高光",
                    "button_text": "反转了",
                    "effect": "screen_flash",
                }
            ]
        },
    )

    tasks.run_ai_analyze_job(job.id)

    db_session.refresh(job)
    assert job.status == "success"
    result_log = db_session.query(JobLog).filter(JobLog.job_id == job.id).order_by(JobLog.id.desc()).first()
    assert result_log is not None
    assert json.loads(result_log.context_json)["highlight_count"] == 1
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
