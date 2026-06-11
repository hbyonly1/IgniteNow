import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Drama, Episode, HighlightEvent, Job
from ..schemas import AnalysisQueueItemOut, AnalysisQueueJobOut
from ..services.auth_service import ADMIN_ROLE, UPLOADER_ROLE
from .common import ok, require_roles

router = APIRouter(prefix="/analysis")
require_workspace_user = require_roles(ADMIN_ROLE, UPLOADER_ROLE)


def _job_episode_id(job: Job) -> Optional[int]:
    try:
        payload = json.loads(job.payload_json or "{}")
    except json.JSONDecodeError:
        return None
    episode_id = payload.get("episode_id")
    return episode_id if isinstance(episode_id, int) else None


def _highlight_status_counts(db: Session, episode_ids: list[int]) -> dict[int, dict[str, int]]:
    counts = {episode_id: {"draft": 0, "published": 0, "rejected": 0, "archived": 0} for episode_id in episode_ids}
    if not episode_ids:
        return counts
    rows = (
        db.query(HighlightEvent.episode_id, HighlightEvent.status, HighlightEvent.id)
        .filter(HighlightEvent.episode_id.in_(episode_ids))
        .all()
    )
    for episode_id, status, _ in rows:
        if status in counts[episode_id]:
            counts[episode_id][status] += 1
    return counts


def _latest_jobs_by_episode(db: Session, episode_ids: list[int]) -> dict[int, Job]:
    if not episode_ids:
        return {}
    jobs = db.query(Job).filter(Job.type == "ai_analyze").order_by(Job.id.desc()).limit(500).all()
    latest: dict[int, Job] = {}
    episode_set = set(episode_ids)
    for job in jobs:
        episode_id = _job_episode_id(job)
        if episode_id in episode_set and episode_id not in latest:
            latest[episode_id] = job
    return latest


def _asset_status(episode: Episode, draft_count: int, published_count: int) -> str:
    if not episode.video_url or not (episode.subtitle_content or episode.subtitle_url):
        return "incomplete"
    if episode.asset_status in {"ready", "incomplete"}:
        return episode.asset_status
    if draft_count or published_count or episode.analyze_status == "success":
        return "ready"
    return "draft"


@router.get("/queue")
def analysis_queue(
    status: str = "all",
    drama_id: Optional[int] = None,
    limit: int = 200,
    user=Depends(require_workspace_user),
    db: Session = Depends(get_db),
):
    if status not in {"all", "pending", "processing", "success", "failed"}:
        raise HTTPException(status_code=400, detail="illegal status")
    limit = min(max(limit, 1), 500)

    query = db.query(Episode, Drama).join(Drama, Episode.drama_id == Drama.id)
    if user.role != ADMIN_ROLE:
        query = query.filter(Episode.owner_user_id == user.id)
    if drama_id is not None:
        query = query.filter(Episode.drama_id == drama_id)
    if status != "all":
        query = query.filter(Episode.analyze_status == status)

    rows = query.order_by(Episode.id.desc()).limit(limit).all()
    episode_ids = [episode.id for episode, _ in rows]
    highlight_counts = _highlight_status_counts(db, episode_ids)
    latest_jobs = _latest_jobs_by_episode(db, episode_ids)

    result = []
    for episode, drama in rows:
        counts = highlight_counts.get(episode.id, {})
        latest_job = latest_jobs.get(episode.id)
        updated_at = latest_job.updated_at if latest_job else episode.updated_at
        result.append(
            AnalysisQueueItemOut(
                id=episode.id,
                drama_id=episode.drama_id,
                owner_user_id=episode.owner_user_id,
                episode_no=episode.episode_no,
                title=episode.title,
                video_url=episode.video_url,
                subtitle_url=episode.subtitle_url,
                subtitle_content=episode.subtitle_content,
                duration=episode.duration,
                analyze_status=episode.analyze_status,
                analyze_error=episode.analyze_error,
                draft_highlight_count=counts.get("draft", 0),
                published_highlight_count=counts.get("published", 0),
                rejected_highlight_count=counts.get("rejected", 0),
                archived_highlight_count=counts.get("archived", 0),
                drama_title=drama.title,
                cover_url=drama.cover_url,
                asset_status=_asset_status(episode, counts.get("draft", 0), counts.get("published", 0)),
                subtitle_ready=bool(episode.subtitle_content or episode.subtitle_url),
                latest_job=AnalysisQueueJobOut.model_validate(latest_job).model_dump() if latest_job else None,
                created_at=episode.created_at,
                updated_at=updated_at,
            ).model_dump()
        )
    return ok(result)
