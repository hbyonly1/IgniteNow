import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Episode, Job, JobLog, SystemLog
from ..schemas import JOB_TYPES, JobCreate, JobLogOut, JobOut
from ..services.auth_service import ADMIN_ROLE, UPLOADER_ROLE
from ..services.job_service import create_and_enqueue_job, retry_job
from .common import ok, require_roles

router = APIRouter(prefix="/system")
require_workspace_user = require_roles(ADMIN_ROLE, UPLOADER_ROLE)


def _can_access_episode(user, episode: Episode) -> bool:
    return user.role == ADMIN_ROLE or episode.owner_user_id == user.id


def _job_episode_id(job: Job) -> Optional[int]:
    try:
        payload = json.loads(job.payload_json or "{}")
    except json.JSONDecodeError:
        return None
    episode_id = payload.get("episode_id")
    return episode_id if isinstance(episode_id, int) else None


def _can_access_job(db: Session, user, job: Job) -> bool:
    if user.role == ADMIN_ROLE:
        return True
    episode_id = _job_episode_id(job)
    if episode_id is None:
        return False
    episode = db.get(Episode, episode_id)
    return bool(episode and _can_access_episode(user, episode))


def _job_out(job: Job) -> dict:
    return JobOut.model_validate(job).model_dump()


@router.get("/jobs")
def list_jobs(
    status: Optional[str] = None,
    type: Optional[str] = None,
    limit: int = 50,
    user=Depends(require_workspace_user),
    db: Session = Depends(get_db),
):
    query = db.query(Job)
    if status:
        query = query.filter(Job.status == status)
    if type:
        query = query.filter(Job.type == type)
    jobs = query.order_by(Job.id.desc()).limit(min(max(limit, 1), 200)).all()
    jobs = [job for job in jobs if _can_access_job(db, user, job)]
    return ok([_job_out(item) for item in jobs])


@router.post("/jobs")
def create_job(payload: JobCreate, user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    if payload.type not in JOB_TYPES:
        raise HTTPException(status_code=400, detail="unsupported job type")
    if payload.type != "ai_analyze":
        raise HTTPException(status_code=400, detail="job type is not implemented yet")
    episode_id = payload.payload.get("episode_id")
    if not isinstance(episode_id, int):
        raise HTTPException(status_code=400, detail="payload.episode_id is required")
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="episode not found")
    if not _can_access_episode(user, episode):
        raise HTTPException(status_code=403, detail="episode is not owned by current uploader")
    try:
        job = create_and_enqueue_job(db, payload.type, payload.payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"failed to enqueue job: {exc}") from exc
    return ok(_job_out(job), "job queued")


@router.get("/jobs/{job_id}")
def get_job(job_id: int, user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if not _can_access_job(db, user, job):
        raise HTTPException(status_code=403, detail="job is not owned by current uploader")
    return ok(_job_out(job))


@router.get("/jobs/{job_id}/logs")
def list_job_logs(job_id: int, user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if not _can_access_job(db, user, job):
        raise HTTPException(status_code=403, detail="job is not owned by current uploader")
    logs = db.query(JobLog).filter(JobLog.job_id == job_id).order_by(JobLog.id.asc()).all()
    return ok([JobLogOut.model_validate(item).model_dump() for item in logs])


@router.post("/jobs/{job_id}/retry")
def retry_failed_job(job_id: int, user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if not _can_access_job(db, user, job):
        raise HTTPException(status_code=403, detail="job is not owned by current uploader")
    try:
        retry = retry_job(db, job)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"failed to enqueue job: {exc}") from exc
    return ok(_job_out(retry), "job retried")


@router.get("/logs", dependencies=[Depends(require_workspace_user)])
def list_system_logs(
    level: Optional[str] = None,
    request_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(SystemLog)
    if level:
        query = query.filter(SystemLog.level == level)
    if request_id:
        query = query.filter(SystemLog.request_id == request_id)
    if user_id:
        query = query.filter(SystemLog.user_id == user_id)
    
    logs = query.order_by(SystemLog.id.desc()).limit(min(max(limit, 1), 200)).all()
    return ok([
        {
            "id": item.id,
            "request_id": item.request_id,
            "user_id": item.user_id,
            "episode_id": item.episode_id,
            "job_id": item.job_id,
            "level": item.level,
            "message": item.message,
            "error_stack": item.error_stack,
            "context_json": item.context_json,
            "created_at": item.created_at.isoformat()
        } for item in logs
    ])
