from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Drama, Episode, HighlightEvent, PublishJob, PublishJobItem, UserInteractionLog
from ..schemas import (
    PUBLISH_CHANNELS,
    PublishConfigUpdate,
    PublishJobCreate,
    PublishJobItemOut,
    PublishJobOut,
    PublishPendingItemOut,
)
from ..services.highlight_service import assert_no_published_overlap
from .common import ok, require_admin

router = APIRouter(prefix="/publish", dependencies=[Depends(require_admin)])


def _highlight_counts(db: Session, episode_ids: list[int]) -> dict[int, dict[str, int]]:
    counts = {episode_id: {"draft": 0, "published": 0} for episode_id in episode_ids}
    if not episode_ids:
        return counts
    rows = (
        db.query(HighlightEvent.episode_id, HighlightEvent.status, func.count(HighlightEvent.id))
        .filter(HighlightEvent.episode_id.in_(episode_ids))
        .group_by(HighlightEvent.episode_id, HighlightEvent.status)
        .all()
    )
    for episode_id, status, count in rows:
        if status in counts[episode_id]:
            counts[episode_id][status] = count
    return counts


def _latest_publish_items(db: Session, episode_ids: list[int]) -> dict[int, PublishJobItem]:
    if not episode_ids:
        return {}
    rows = (
        db.query(PublishJobItem)
        .filter(PublishJobItem.episode_id.in_(episode_ids))
        .order_by(PublishJobItem.episode_id.asc(), PublishJobItem.id.desc())
        .all()
    )
    latest: dict[int, PublishJobItem] = {}
    for item in rows:
        latest.setdefault(item.episode_id, item)
    return latest


def _pending_status(draft_count: int, published_count: int, latest_item: Optional[PublishJobItem]) -> str:
    if latest_item and latest_item.status in {"pending", "publishing"}:
        return "publishing"
    if latest_item and latest_item.status == "failed":
        return "failed"
    if draft_count > 0:
        return "unpublished"
    if published_count > 0:
        return "published"
    return "unpublished"


def _job_item_out(item: PublishJobItem) -> dict:
    return PublishJobItemOut(
        id=item.id,
        publish_job_id=item.publish_job_id,
        episode_id=item.episode_id,
        status=item.status,
        error=item.error,
        published_highlight_count=item.published_highlight_count,
        created_at=item.created_at,
        updated_at=item.updated_at,
    ).model_dump()


def _job_out(db: Session, job: PublishJob, include_items: bool = False) -> dict:
    items = list(job.items)
    episode_ids = [item.episode_id for item in items]
    episodes = db.query(Episode).filter(Episode.id.in_(episode_ids)).all() if episode_ids else []
    episode_by_id = {episode.id: episode for episode in episodes}
    content = "、".join(
        f"{episode_by_id[item.episode_id].title}"
        for item in items[:2]
        if item.episode_id in episode_by_id
    )
    if len(items) > 2:
        content = f"{content} 等 {len(items)} 集" if content else f"{len(items)} 集内容"

    interaction_rows = (
        db.query(UserInteractionLog.action_type, func.count(UserInteractionLog.id))
        .filter(UserInteractionLog.episode_id.in_(episode_ids))
        .group_by(UserInteractionLog.action_type)
        .all()
        if episode_ids
        else []
    )
    interaction_counts = {action_type: count for action_type, count in interaction_rows}
    impressions = interaction_counts.get("impression", 0)
    clicks = interaction_counts.get("click", 0)

    return PublishJobOut(
        id=job.id,
        channel=job.channel,
        status=job.status,
        scheduled_at=job.scheduled_at,
        created_by_user_id=job.created_by_user_id,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
        item_count=len(items),
        success_count=sum(1 for item in items if item.status == "success"),
        failed_count=sum(1 for item in items if item.status == "failed"),
        content=content,
        impressions=impressions,
        clicks=clicks,
        click_rate=round(clicks / impressions, 4) if impressions else 0,
        items=[_job_item_out(item) for item in items] if include_items else [],
    ).model_dump()


def _execute_publish_job(db: Session, job: PublishJob) -> None:
    job.status = "publishing"
    for item in job.items:
        item.status = "publishing"
        episode = db.get(Episode, item.episode_id)
        if not episode:
            item.status = "failed"
            item.error = "episode not found"
            continue

        highlights = (
            db.query(HighlightEvent)
            .filter(HighlightEvent.episode_id == episode.id, HighlightEvent.status.in_(["draft", "published"]))
            .order_by(HighlightEvent.start_time)
            .all()
        )
        if not highlights:
            item.status = "failed"
            item.error = "episode has no draft or published highlights"
            continue

        try:
            assert_no_published_overlap(db, episode.id, highlights)
        except ValueError as exc:
            item.status = "failed"
            item.error = str(exc)
            continue

        for highlight in highlights:
            if highlight.status == "draft":
                highlight.status = "published"

        item.status = "success"
        item.error = ""
        item.published_highlight_count = len(highlights)

    failed_items = [item for item in job.items if item.status == "failed"]
    job.status = "failed" if failed_items else "success"
    job.error = "; ".join(item.error for item in failed_items if item.error)


@router.get("/pending-items")
def pending_items(status: str = "all", db: Session = Depends(get_db)):
    if status not in {"all", "publishing", "unpublished", "failed", "published"}:
        raise HTTPException(status_code=400, detail="illegal status")

    rows = db.query(Episode, Drama).join(Drama, Episode.drama_id == Drama.id).order_by(Episode.id.desc()).all()
    episodes = [episode for episode, _ in rows]
    episode_ids = [episode.id for episode in episodes]
    counts = _highlight_counts(db, episode_ids)
    latest_items = _latest_publish_items(db, episode_ids)

    result = []
    for episode, drama in rows:
        item_counts = counts.get(episode.id, {})
        draft_count = item_counts.get("draft", 0)
        published_count = item_counts.get("published", 0)
        latest_item = latest_items.get(episode.id)
        item_status = _pending_status(draft_count, published_count, latest_item)
        if status != "all" and item_status != status:
            continue
        if draft_count == 0 and published_count == 0 and not latest_item:
            continue
        result.append(
            PublishPendingItemOut(
                episode_id=episode.id,
                drama_id=episode.drama_id,
                title=f"{drama.title} - 第 {episode.episode_no} 集",
                drama_title=drama.title,
                episode_no=episode.episode_no,
                status=item_status,
                updated_at=episode.updated_at,
                draft_highlight_count=draft_count,
                published_highlight_count=published_count,
                last_publish_job_id=latest_item.publish_job_id if latest_item else None,
                last_publish_status=latest_item.status if latest_item else None,
                last_publish_error=latest_item.error if latest_item else "",
            ).model_dump()
        )
    return ok(result)


@router.post("/jobs")
def create_publish_job(payload: PublishJobCreate, user=Depends(require_admin), db: Session = Depends(get_db)):
    if payload.channel not in PUBLISH_CHANNELS:
        raise HTTPException(status_code=400, detail="illegal channel")
    episode_ids = list(dict.fromkeys(payload.episode_ids))
    episodes = db.query(Episode).filter(Episode.id.in_(episode_ids)).all()
    if len(episodes) != len(episode_ids):
        raise HTTPException(status_code=404, detail="some episodes not found")

    job = PublishJob(
        channel=payload.channel,
        status="pending",
        scheduled_at=payload.scheduled_at,
        created_by_user_id=user.id,
    )
    job.items = [PublishJobItem(episode_id=episode_id, status="pending") for episode_id in episode_ids]
    db.add(job)
    db.flush()

    if not payload.scheduled_at or payload.scheduled_at <= datetime.utcnow():
        _execute_publish_job(db, job)

    db.commit()
    db.refresh(job)
    return ok(_job_out(db, job, include_items=True), "publish job created")


@router.post("/jobs/one-click")
def one_click_publish(user=Depends(require_admin), db: Session = Depends(get_db)):
    rows = (
        db.query(HighlightEvent.episode_id)
        .filter(HighlightEvent.status == "draft")
        .group_by(HighlightEvent.episode_id)
        .all()
    )
    episode_ids = [row[0] for row in rows]
    if not episode_ids:
        return ok({"created": False, "published_count": 0}, "no pending publish items")
    payload = PublishJobCreate(episode_ids=episode_ids, channel="android")
    return create_publish_job(payload, user=user, db=db)


@router.get("/jobs")
def list_publish_jobs(limit: int = 20, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 100)
    jobs = db.query(PublishJob).order_by(PublishJob.id.desc()).limit(limit).all()
    return ok([_job_out(db, job) for job in jobs])


@router.get("/jobs/{job_id}")
def publish_job_detail(job_id: int, db: Session = Depends(get_db)):
    job = db.get(PublishJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="publish job not found")
    return ok(_job_out(db, job, include_items=True))


@router.post("/jobs/{job_id}/retry")
def retry_publish_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(PublishJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="publish job not found")
    for item in job.items:
        if item.status == "failed":
            item.status = "pending"
            item.error = ""
    _execute_publish_job(db, job)
    db.commit()
    db.refresh(job)
    return ok(_job_out(db, job, include_items=True), "publish job retried")


@router.post("/items/{episode_id}/config")
def save_publish_config(episode_id: int, payload: PublishConfigUpdate, db: Session = Depends(get_db)):
    if payload.channel not in PUBLISH_CHANNELS:
        raise HTTPException(status_code=400, detail="illegal channel")
    if not db.get(Episode, episode_id):
        raise HTTPException(status_code=404, detail="episode not found")
    return ok(
        {
            "episode_id": episode_id,
            "channel": payload.channel,
            "scheduled_at": payload.scheduled_at,
            "strategy_tags": payload.strategy_tags,
            "cover_checked": payload.cover_checked,
            "summary_checked": payload.summary_checked,
        },
        "publish config saved",
    )


@router.get("/jobs/{job_id}/analytics")
def publish_job_analytics(job_id: int, db: Session = Depends(get_db)):
    """发布单维度回流统计。
    按该发布单涵盖的剧集，聚合各集及全局的曝光、点击、忽略和点击率数据。
    时间范围为发布单 created_at 之后的所有互动日志。
    """
    job = db.get(PublishJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="publish job not found")

    items = list(job.items)
    episode_ids = [item.episode_id for item in items]
    if not episode_ids:
        return ok({"job_id": job_id, "total": _empty_stats(), "by_episode": []})

    # 发布单涉及剧集的所有互动，从发布时间点开始计算
    base_query = (
        db.query(UserInteractionLog)
        .filter(
            UserInteractionLog.episode_id.in_(episode_ids),
            UserInteractionLog.created_at >= job.created_at,
        )
    )

    # 全局汇总
    rows = (
        base_query
        .with_entities(UserInteractionLog.action_type, func.count(UserInteractionLog.id))
        .group_by(UserInteractionLog.action_type)
        .all()
    )
    total_counts = {action_type: count for action_type, count in rows}
    total = _make_stats(total_counts)

    # 按剧集汇总
    episode_rows = (
        base_query
        .with_entities(
            UserInteractionLog.episode_id,
            UserInteractionLog.action_type,
            func.count(UserInteractionLog.id),
        )
        .group_by(UserInteractionLog.episode_id, UserInteractionLog.action_type)
        .all()
    )
    episode_data: dict[int, dict[str, int]] = {}
    for episode_id, action_type, count in episode_rows:
        episode_data.setdefault(episode_id, {"impression": 0, "click": 0, "ignore": 0})
        if action_type in episode_data[episode_id]:
            episode_data[episode_id][action_type] = count

    episodes = db.query(Episode).filter(Episode.id.in_(episode_ids)).all()
    episode_titles = {ep.id: ep.title for ep in episodes}

    by_episode = [
        {
            "episode_id": episode_id,
            "title": episode_titles.get(episode_id, f"episode_{episode_id}"),
            **_make_stats(episode_data.get(episode_id, {})),
        }
        for episode_id in episode_ids
    ]

    return ok({"job_id": job_id, "total": total, "by_episode": by_episode})


def _empty_stats() -> dict:
    return {"impressions": 0, "clicks": 0, "ignores": 0, "click_rate": 0.0}


def _make_stats(counts: dict[str, int]) -> dict:
    impressions = counts.get("impression", 0)
    clicks = counts.get("click", 0)
    ignores = counts.get("ignore", 0)
    return {
        "impressions": impressions,
        "clicks": clicks,
        "ignores": ignores,
        "click_rate": round(clicks / impressions, 4) if impressions else 0.0,
    }
