from ..database import SessionLocal
from ..models import Episode, Job, PublishJob
from ..services.analysis_service import analyze_episode_highlights
from ..services.job_service import (
    job_payload,
    mark_job_failed,
    mark_job_running,
    mark_job_success,
    update_job_progress,
)


def run_ai_analyze_job(job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if not job:
            raise ValueError(f"job not found: {job_id}")
        mark_job_running(db, job, "AI analysis job started")
        payload = job_payload(job)
        episode_id = payload.get("episode_id")
        if not isinstance(episode_id, int):
            raise ValueError("payload.episode_id is required")
        force_reanalyze = bool(payload.get("force_reanalyze", False))

        episode = db.get(Episode, episode_id)
        if not episode:
            raise ValueError("episode not found")

        update_job_progress(db, job, 20, "episode loaded", {"episode_id": episode_id})
        result = analyze_episode_highlights(db, episode, force_reanalyze)
        db.refresh(job)
        mark_job_success(db, job, "AI analysis job completed", result)
    except Exception as exc:
        if "job" in locals() and job:
            mark_job_failed(db, job, str(exc))
        raise
    finally:
        db.close()


def run_scheduled_publish() -> None:
    """扫描到期的定时发布任务并执行。
    由后台定时调用（每分钟），处理 scheduled_at <= now 且 status=pending 的发布单。
    """
    from datetime import datetime

    from ..routers.publish import _execute_publish_job

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        pending_jobs = (
            db.query(PublishJob)
            .filter(
                PublishJob.status == "pending",
                PublishJob.scheduled_at.isnot(None),
                PublishJob.scheduled_at <= now,
            )
            .all()
        )
        for job in pending_jobs:
            try:
                _execute_publish_job(db, job)
                db.commit()
                db.refresh(job)
            except Exception:
                db.rollback()
    finally:
        db.close()
