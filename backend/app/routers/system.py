import json
from copy import deepcopy
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Episode, Job, JobLog, SystemLog, SystemSetting
from ..schemas import JOB_TYPES, JobCreate, JobLogOut, JobOut, PromptTemplateUpdate, SystemSettingsUpdate
from ..services.auth_service import ADMIN_ROLE, UPLOADER_ROLE
from ..services.job_service import create_and_enqueue_job, retry_job
from .common import ok, require_admin, require_roles

router = APIRouter(prefix="/system")
settings_router = APIRouter(prefix="/settings")
require_workspace_user = require_roles(ADMIN_ROLE, UPLOADER_ROLE)

DEFAULT_SYSTEM_SETTINGS = {}
PROMPT_TEMPLATE_PATH = Path(__file__).resolve().parents[3] / "ai_service" / "prompt_template.md"


def _load_settings(db: Session) -> dict:
    settings = deepcopy(DEFAULT_SYSTEM_SETTINGS)
    rows = db.query(SystemSetting).all()
    updated_at = None
    updated_by_user_id = None
    for row in rows:
        if row.key not in settings:
            continue
        try:
            value = json.loads(row.value_json or "{}")
        except json.JSONDecodeError:
            value = {}
        if isinstance(value, dict):
            settings[row.key].update(value)
        if not updated_at or row.updated_at > updated_at:
            updated_at = row.updated_at
            updated_by_user_id = row.updated_by_user_id
    return {
        "settings": settings,
        "updated_at": updated_at.isoformat() if updated_at else None,
        "updated_by_user_id": updated_by_user_id,
    }


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


@router.get("/settings")
def get_system_settings(user=Depends(require_admin), db: Session = Depends(get_db)):
    return ok(_load_settings(db))


@router.put("/settings")
def update_system_settings(
    payload: SystemSettingsUpdate,
    user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    payload.model_dump()
    db.query(SystemSetting).delete()
    db.commit()
    return ok(_load_settings(db), "settings saved")


@settings_router.get("/prompt-template")
def get_prompt_template(user=Depends(require_admin)):
    return ok({"content": PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")})


@settings_router.put("/prompt-template")
def update_prompt_template(payload: PromptTemplateUpdate, user=Depends(require_admin)):
    content = payload.content.strip()
    if "highlights" not in content or "highlight_type" not in content:
        raise HTTPException(status_code=400, detail="prompt template must mention highlights and highlight_type")
    PROMPT_TEMPLATE_PATH.write_text(f"{content}\n", encoding="utf-8")
    return ok({"content": content}, "prompt template saved")


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


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: int, user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    """取消等待中的任务。
    只允许取消 pending 状态的任务；running 状态的任务已交给 RQ worker 执行，
    无法从 HTTP 层安全终止，应等待其完成后重试或人工干预。
    """
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if not _can_access_job(db, user, job):
        raise HTTPException(status_code=403, detail="job is not owned by current uploader")
    if job.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"only pending jobs can be canceled (current status: {job.status})",
        )
    job.status = "canceled"
    db.commit()
    db.refresh(job)
    return ok(_job_out(job), "job canceled")



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
