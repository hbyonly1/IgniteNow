import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Job, JobLog


def job_payload(job: Job) -> dict[str, Any]:
    try:
        value = json.loads(job.payload_json or "{}")
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def add_job_log(db: Session, job: Job, message: str, level: str = "info", context: Optional[dict] = None) -> JobLog:
    log = JobLog(
        job_id=job.id,
        level=level,
        message=message,
        context_json=json.dumps(context or {}, ensure_ascii=False),
    )
    db.add(log)
    db.flush()
    return log


def mark_job_running(db: Session, job: Job, message: str = "job started") -> None:
    job.status = "running"
    job.progress = max(job.progress, 1)
    job.started_at = datetime.utcnow()
    job.error = ""
    add_job_log(db, job, message)
    db.commit()


def update_job_progress(db: Session, job: Job, progress: float, message: str, context: Optional[dict] = None) -> None:
    job.progress = min(99, max(0, progress))
    add_job_log(db, job, message, context=context)
    db.commit()


def mark_job_success(db: Session, job: Job, message: str = "job completed", context: Optional[dict] = None) -> None:
    job.status = "success"
    job.progress = 100
    job.finished_at = datetime.utcnow()
    job.error = ""
    add_job_log(db, job, message, context=context)
    db.commit()


def mark_job_failed(db: Session, job: Job, error: str) -> None:
    job.status = "failed"
    job.finished_at = datetime.utcnow()
    job.error = error
    add_job_log(db, job, error, level="error")
    db.commit()


def create_job_record(db: Session, job_type: str, payload: dict) -> Job:
    job = Job(type=job_type, payload_json=json.dumps(payload, ensure_ascii=False), status="pending", progress=0)
    db.add(job)
    db.flush()
    add_job_log(db, job, "job queued")
    db.commit()
    db.refresh(job)
    return job


def get_queue():
    try:
        from redis import Redis
        from rq import Queue
    except ImportError as exc:
        raise RuntimeError("RQ dependencies are not installed") from exc
    connection = Redis.from_url(settings.redis_url)
    return Queue(settings.rq_queue_name, connection=connection)


def enqueue_job(db: Session, job: Job) -> Job:
    if job.type != "ai_analyze":
        raise ValueError(f"unsupported job type: {job.type}")
    from ..jobs.tasks import run_ai_analyze_job

    queue = get_queue()
    rq_job = queue.enqueue(run_ai_analyze_job, job.id, job_timeout=600)
    job.rq_job_id = rq_job.id
    add_job_log(db, job, "job submitted to RQ", context={"rq_job_id": rq_job.id})
    db.commit()
    db.refresh(job)
    return job


def create_and_enqueue_job(db: Session, job_type: str, payload: dict) -> Job:
    job = create_job_record(db, job_type, payload)
    try:
        return enqueue_job(db, job)
    except Exception as exc:
        mark_job_failed(db, job, str(exc))
        raise


def retry_job(db: Session, job: Job) -> Job:
    if job.status != "failed":
        raise ValueError("only failed jobs can be retried")
    retry = create_job_record(db, job.type, job_payload(job))
    return enqueue_job(db, retry)
