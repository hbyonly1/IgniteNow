from datetime import datetime
import json
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Drama, Episode, HighlightEvent, Job
from ..schemas import (
    ASSET_STATUSES,
    AssetFileOut,
    DramaCreate,
    DramaOut,
    DramaUpdate,
    EpisodeCreate,
    EpisodeOut,
    EpisodeUpdate,
    HighlightBulkStatusUpdate,
    HighlightCreate,
    HighlightOut,
    HighlightUpdate,
)
from ..services.auth_service import ADMIN_ROLE, UPLOADER_ROLE
from ..services.highlight_service import (
    apply_highlight_update,
    assert_no_published_overlap,
    assert_valid_effects,
    create_highlight,
)
from ..services.upload_service import probe_video_metadata, save_image_file, save_subtitle_file, save_video_file
from ..services.video_service import player_video_url
from .common import ok, require_admin, require_roles

router = APIRouter()
require_workspace_user = require_roles(ADMIN_ROLE, UPLOADER_ROLE)


def _can_access_episode(user, episode: Episode) -> bool:
    return user.role == ADMIN_ROLE or episode.owner_user_id == user.id


def _visible_episode_query(db: Session, user):
    query = db.query(Episode)
    if user.role != ADMIN_ROLE:
        query = query.filter(Episode.owner_user_id == user.id)
    return query


def _highlight_status_counts(db: Session, episode_ids: list[int]) -> dict[int, dict[str, int]]:
    counts = {episode_id: {"draft": 0, "published": 0, "rejected": 0, "archived": 0} for episode_id in episode_ids}
    if not episode_ids:
        return counts
    highlights = db.query(HighlightEvent).filter(HighlightEvent.episode_id.in_(episode_ids)).all()
    for highlight in highlights:
        if highlight.status in counts[highlight.episode_id]:
            counts[highlight.episode_id][highlight.status] += 1
    return counts


def _episode_out(db: Session, episode: Episode) -> dict:
    highlight_counts = _highlight_status_counts(db, [episode.id]).get(episode.id, {})
    data = EpisodeOut.model_validate(episode).model_dump()
    data.update(
        {
            "draft_highlight_count": highlight_counts.get("draft", 0),
            "published_highlight_count": highlight_counts.get("published", 0),
            "rejected_highlight_count": highlight_counts.get("rejected", 0),
            "archived_highlight_count": highlight_counts.get("archived", 0),
        }
    )
    return data


def _clean_string_list(values: Optional[list[str]]) -> list[str]:
    if not values:
        return []
    return [str(value).strip() for value in values if str(value).strip()]


def _json_string_list(values: Optional[list[str]]) -> str:
    return json.dumps(_clean_string_list(values), ensure_ascii=False)


def _drama_create_values(payload: DramaCreate) -> dict:
    data = payload.model_dump()
    categories = data.pop("categories", [])
    cast_tags = data.pop("cast_tags", [])
    data["categories_json"] = _json_string_list(categories)
    data["cast_tags_json"] = _json_string_list(cast_tags)
    return data


def _apply_drama_updates(drama: Drama, updates: dict) -> None:
    for key, value in updates.items():
        if key == "status":
            if value not in {"active", "archived"}:
                raise HTTPException(status_code=400, detail="illegal status")
            setattr(drama, key, value)
        elif key == "categories":
            drama.categories_json = _json_string_list(value)
        elif key == "cast_tags":
            drama.cast_tags_json = _json_string_list(value)
        else:
            setattr(drama, key, value or "")
    drama.updated_at = datetime.utcnow()


def _validate_episode_asset_status(value: str) -> None:
    if value not in ASSET_STATUSES:
        raise HTTPException(status_code=400, detail="illegal asset status")


def _asset_file_out(
    asset_type: str,
    path: str,
    file_size: int,
    mime_type: str = "",
    metadata: Optional[dict] = None,
    url: Optional[str] = None,
) -> dict:
    return AssetFileOut(
        asset_type=asset_type,
        url=url or path,
        path=path,
        file_size=file_size,
        mime_type=mime_type,
        metadata=metadata or {},
    ).model_dump()


def _episode_metadata_fields(metadata: dict) -> dict:
    return {
        "duration": float(metadata.get("duration") or 0),
        "video_width": int(metadata.get("width") or 0),
        "video_height": int(metadata.get("height") or 0),
        "video_file_size": int(metadata.get("file_size") or 0),
        "video_mime_type": str(metadata.get("mime_type") or ""),
    }


@router.post("/admin/assets/files")
async def upload_asset_file(
    request: Request,
    asset_type: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(require_admin),
):
    normalized_type = asset_type.strip().lower()
    if normalized_type in {"cover", "wide_cover", "image"}:
        image_path = await save_image_file(file)
        mime_type = (file.content_type or "").lower()
        return ok(
            _asset_file_out(
                normalized_type,
                str(image_path),
                image_path.stat().st_size,
                mime_type,
                url=str(request.url_for("uploads", path=f"images/{image_path.name}")),
            ),
            "asset uploaded",
        )

    if normalized_type == "video":
        content_type = (file.content_type or "").lower()
        video_path = await save_video_file(file)
        metadata = probe_video_metadata(video_path, content_type)
        return ok(
            _asset_file_out(
                normalized_type,
                str(video_path),
                int(metadata.get("file_size") or video_path.stat().st_size),
                str(metadata.get("mime_type") or content_type),
                metadata,
                str(request.url_for("uploads", path=f"videos/{video_path.name}")),
            ),
            "asset uploaded",
        )

    if normalized_type == "subtitle":
        subtitle_path, subtitle_text = await save_subtitle_file(file)
        metadata = {"text_length": len(subtitle_text)}
        return ok(
            _asset_file_out(
                normalized_type,
                str(subtitle_path),
                subtitle_path.stat().st_size,
                (file.content_type or "").lower(),
                metadata,
                str(request.url_for("uploads", path=f"subtitles/{subtitle_path.name}")),
            ),
            "asset uploaded",
        )

    raise HTTPException(status_code=400, detail="asset_type must be cover, wide_cover, image, video or subtitle")


@router.get("/dramas")
def list_dramas(user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    if user.role == ADMIN_ROLE:
        dramas = db.query(Drama).order_by(Drama.id.desc()).all()
        visible_episodes = db.query(Episode).all()
    else:
        visible_episodes = _visible_episode_query(db, user).all()
        drama_ids = sorted({episode.drama_id for episode in visible_episodes}, reverse=True)
        dramas = db.query(Drama).filter(Drama.id.in_(drama_ids)).order_by(Drama.id.desc()).all() if drama_ids else []

    episodes_by_drama: dict[int, list[Episode]] = {}
    for episode in visible_episodes:
        episodes_by_drama.setdefault(episode.drama_id, []).append(episode)
    highlight_counts = _highlight_status_counts(db, [episode.id for episode in visible_episodes])

    result = []
    for drama in dramas:
        episodes = episodes_by_drama.get(drama.id, [])
        data = DramaOut.model_validate(drama).model_dump()
        data.update(
            {
                "episode_count": len(episodes),
                "pending_episode_count": sum(1 for item in episodes if item.analyze_status == "pending"),
                "processing_episode_count": sum(1 for item in episodes if item.analyze_status == "processing"),
                "failed_episode_count": sum(1 for item in episodes if item.analyze_status == "failed"),
                "draft_highlight_count": sum(highlight_counts.get(item.id, {}).get("draft", 0) for item in episodes),
                "published_highlight_count": sum(highlight_counts.get(item.id, {}).get("published", 0) for item in episodes),
            }
        )
        result.append(data)
    return ok(result)


@router.post("/dramas")
def create_drama(payload: DramaCreate, user=Depends(require_admin), db: Session = Depends(get_db)):
    drama = Drama(**_drama_create_values(payload))
    db.add(drama)
    db.commit()
    db.refresh(drama)
    return ok(DramaOut.model_validate(drama).model_dump(), "drama created")


@router.put("/dramas/{drama_id}")
def update_drama(drama_id: int, payload: DramaUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    drama = db.get(Drama, drama_id)
    if not drama:
        raise HTTPException(status_code=404, detail="drama not found")
    _apply_drama_updates(drama, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(drama)
    return ok(DramaOut.model_validate(drama).model_dump(), "drama updated")


@router.delete("/dramas/{drama_id}", dependencies=[Depends(require_admin)])
def delete_drama(drama_id: int, db: Session = Depends(get_db)):
    """删除短剧及其所有剧集、高光点（管理员）。"""
    drama = db.get(Drama, drama_id)
    if not drama:
        raise HTTPException(status_code=404, detail="drama not found")
    episodes = db.query(Episode).filter(Episode.drama_id == drama_id).all()
    episode_ids = [ep.id for ep in episodes]
    if episode_ids:
        db.query(HighlightEvent).filter(HighlightEvent.episode_id.in_(episode_ids)).delete(synchronize_session=False)
        db.query(Episode).filter(Episode.drama_id == drama_id).delete(synchronize_session=False)
    db.delete(drama)
    db.commit()
    return ok({"id": drama_id}, "drama deleted")


@router.get("/episodes")
def list_episodes(drama_id: Optional[int] = None, user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    query = _visible_episode_query(db, user)
    if drama_id:
        query = query.filter(Episode.drama_id == drama_id)
    episodes = query.order_by(Episode.id.desc()).all()
    highlight_counts = _highlight_status_counts(db, [item.id for item in episodes])
    result = []
    for item in episodes:
        data = EpisodeOut.model_validate(item).model_dump()
        data.update(
            {
                "draft_highlight_count": highlight_counts.get(item.id, {}).get("draft", 0),
                "published_highlight_count": highlight_counts.get(item.id, {}).get("published", 0),
                "rejected_highlight_count": highlight_counts.get(item.id, {}).get("rejected", 0),
                "archived_highlight_count": highlight_counts.get(item.id, {}).get("archived", 0),
            }
        )
        result.append(data)
    return ok(result)


@router.post("/episodes")
def create_episode(payload: EpisodeCreate, user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    if not db.get(Drama, payload.drama_id):
        raise HTTPException(status_code=404, detail="drama not found")
    _validate_episode_asset_status(payload.asset_status)
    episode = Episode(**payload.model_dump(), owner_user_id=user.id)
    db.add(episode)
    db.commit()
    db.refresh(episode)
    return ok(_episode_out(db, episode), "episode created")


@router.post("/dramas/{drama_id}/episodes/upload")
async def upload_drama_episode(
    drama_id: int,
    request: Request,
    episode_no: int = Form(...),
    episode_title: str = Form(...),
    subtitle_content: str = Form(default=""),
    video_file: UploadFile = File(...),
    subtitle_file: Optional[UploadFile] = File(default=None),
    user=Depends(require_workspace_user),
    db: Session = Depends(get_db),
):
    drama = db.get(Drama, drama_id)
    if not drama:
        raise HTTPException(status_code=404, detail="drama not found")
    if episode_no < 1:
        raise HTTPException(status_code=400, detail="episode_no must be greater than 0")
    if not episode_title.strip():
        raise HTTPException(status_code=400, detail="episode_title is required")

    content_type = (video_file.content_type or "").lower()
    video_path = await save_video_file(video_file)
    metadata = probe_video_metadata(video_path, content_type)

    subtitle_text = subtitle_content.strip()
    subtitle_url = ""
    if subtitle_file:
        subtitle_path, subtitle_text = await save_subtitle_file(subtitle_file)
        subtitle_url = str(subtitle_path)

    metadata_fields = _episode_metadata_fields(metadata)
    episode = Episode(
        drama_id=drama.id,
        episode_no=episode_no,
        title=episode_title.strip(),
        owner_user_id=user.id,
        video_url=str(video_path),
        video_original_name=video_file.filename or "",
        subtitle_url=subtitle_url,
        subtitle_original_name=subtitle_file.filename if subtitle_file else "",
        subtitle_content=subtitle_text,
        asset_status="ready" if subtitle_text or subtitle_url else "incomplete",
        **metadata_fields,
    )
    db.add(episode)
    drama.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(episode)
    data = _episode_out(db, episode)
    data["video_url"] = player_video_url(episode, request)
    return ok(data, "episode uploaded")


@router.put("/episodes/{episode_id}")
def update_episode(episode_id: int, payload: EpisodeUpdate, user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="episode not found")
    if not _can_access_episode(user, episode):
        raise HTTPException(status_code=403, detail="episode is not owned by current uploader")
    updates = payload.model_dump(exclude_unset=True)
    if "drama_id" in updates and not db.get(Drama, updates["drama_id"]):
        raise HTTPException(status_code=404, detail="drama not found")
    if "asset_status" in updates:
        if updates["asset_status"] is None:
            raise HTTPException(status_code=400, detail="illegal asset status")
        _validate_episode_asset_status(updates["asset_status"])
    for key, value in updates.items():
        setattr(episode, key, value)
    episode.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(episode)
    return ok(_episode_out(db, episode), "episode updated")


@router.delete("/episodes/{episode_id}", dependencies=[Depends(require_admin)])
def delete_episode(episode_id: int, db: Session = Depends(get_db)):
    """删除剧集及其所有高光点（管理员）。"""
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="episode not found")
    db.query(HighlightEvent).filter(HighlightEvent.episode_id == episode_id).delete(synchronize_session=False)
    db.delete(episode)
    db.commit()
    return ok({"id": episode_id}, "episode deleted")


@router.get("/episodes/{episode_id}/highlights", dependencies=[Depends(require_admin)])
def list_highlights(episode_id: int, db: Session = Depends(get_db)):
    highlights = db.query(HighlightEvent).filter(HighlightEvent.episode_id == episode_id).order_by(HighlightEvent.start_time).all()
    return ok([HighlightOut.model_validate(item).model_dump() for item in highlights])


@router.post("/episodes/{episode_id}/highlights", dependencies=[Depends(require_admin)])
def add_highlight(episode_id: int, payload: HighlightCreate, db: Session = Depends(get_db)):
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="episode not found")
    try:
        highlight = create_highlight(db, episode, payload)
        db.flush()
        if highlight.status == "published":
            assert_valid_effects([highlight])
            assert_no_published_overlap(db, episode_id, [highlight])
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.refresh(highlight)
    return ok(HighlightOut.model_validate(highlight).model_dump(), "highlight created")


@router.put("/highlights/{highlight_id}", dependencies=[Depends(require_admin)])
def update_highlight(highlight_id: int, payload: HighlightUpdate, db: Session = Depends(get_db)):
    highlight = db.get(HighlightEvent, highlight_id)
    if not highlight:
        raise HTTPException(status_code=404, detail="highlight not found")
    try:
        apply_highlight_update(highlight, payload, highlight.episode)
        if highlight.status == "published":
            assert_valid_effects([highlight])
            assert_no_published_overlap(db, highlight.episode_id, [highlight])
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.refresh(highlight)
    return ok(HighlightOut.model_validate(highlight).model_dump(), "highlight updated")


@router.delete("/highlights/{highlight_id}", dependencies=[Depends(require_admin)])
def archive_highlight(highlight_id: int, db: Session = Depends(get_db)):
    highlight = db.get(HighlightEvent, highlight_id)
    if not highlight:
        raise HTTPException(status_code=404, detail="highlight not found")
    highlight.status = "archived"
    db.commit()
    db.refresh(highlight)
    return ok(HighlightOut.model_validate(highlight).model_dump(), "highlight archived")


@router.post("/episodes/{episode_id}/highlights/bulk-status", dependencies=[Depends(require_admin)])
def bulk_update_highlight_status(episode_id: int, payload: HighlightBulkStatusUpdate, db: Session = Depends(get_db)):
    if payload.status not in {"draft", "published", "rejected", "archived"}:
        raise HTTPException(status_code=400, detail="illegal status")
    query = db.query(HighlightEvent).filter(HighlightEvent.episode_id == episode_id)
    if payload.highlight_ids is not None:
        query = query.filter(HighlightEvent.id.in_(payload.highlight_ids))
    highlights = query.all()
    if payload.highlight_ids is not None and len(highlights) != len(set(payload.highlight_ids)):
        raise HTTPException(status_code=404, detail="some highlights not found for episode")
    for item in highlights:
        item.status = payload.status
    try:
        if payload.status == "published":
            assert_valid_effects(highlights)
            assert_no_published_overlap(db, episode_id, highlights)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ok({"updated_count": len(highlights), "status": payload.status}, "highlight status updated")


@router.post("/episodes/{episode_id}/highlights/publish", dependencies=[Depends(require_admin)])
def publish_highlights(episode_id: int, db: Session = Depends(get_db)):
    highlights = db.query(HighlightEvent).filter(HighlightEvent.episode_id == episode_id, HighlightEvent.status == "draft").all()
    for item in highlights:
        item.status = "published"
    try:
        assert_valid_effects(highlights)
        assert_no_published_overlap(db, episode_id, highlights)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ok({"published_count": len(highlights)}, "highlights published")


class _EpisodeBatchItem(BaseModel):
    """批量创建剧集时每条记录的字段。"""
    episode_no: int
    title: str
    video_url: str = ""
    subtitle_url: str = ""
    subtitle_content: str = ""
    duration: float = 0
    asset_status: str = "draft"


class _EpisodeBatchBody(BaseModel):
    episodes: list[_EpisodeBatchItem] = Field(min_length=1, max_length=100)


@router.post("/dramas/{drama_id}/episodes/batch", dependencies=[Depends(require_admin)])
def batch_create_episodes(drama_id: int, body: _EpisodeBatchBody, db: Session = Depends(get_db)):
    """批量创建剧集配置（不含文件上传）。每条记录传入 video_url、字幕等基础字段。"""
    drama = db.get(Drama, drama_id)
    if not drama:
        raise HTTPException(status_code=404, detail="drama not found")

    # 校验 episode_no 不重复
    episode_nos = [item.episode_no for item in body.episodes]
    if len(episode_nos) != len(set(episode_nos)):
        raise HTTPException(status_code=400, detail="duplicate episode_no in batch")
    if any(no < 1 for no in episode_nos):
        raise HTTPException(status_code=400, detail="episode_no must be >= 1")

    created = []
    for item in body.episodes:
        if item.asset_status not in ASSET_STATUSES:
            raise HTTPException(status_code=400, detail=f"illegal asset_status: {item.asset_status}")
        episode = Episode(
            drama_id=drama_id,
            episode_no=item.episode_no,
            title=item.title.strip() or f"第 {item.episode_no} 集",
            video_url=item.video_url,
            subtitle_url=item.subtitle_url,
            subtitle_content=item.subtitle_content,
            duration=item.duration,
            asset_status=item.asset_status,
        )
        db.add(episode)
        created.append(episode)

    drama.updated_at = datetime.utcnow()
    db.commit()
    for episode in created:
        db.refresh(episode)

    return ok(
        {"created_count": len(created), "episode_ids": [e.id for e in created]},
        "episodes created",
    )


@router.post("/dramas/{drama_id}/enqueue-analysis", dependencies=[Depends(require_admin)])
def enqueue_drama_analysis(drama_id: int, db: Session = Depends(get_db)):
    """按短剧批量提交 AI 分析任务。
    对该短剧下所有 analyze_status=pending 或 failed 的剧集提交 ai_analyze 任务。
    已经在 processing/success 状态的剧集跳过，避免重复计算。
    """
    from ..services.job_service import create_and_enqueue_job

    drama = db.get(Drama, drama_id)
    if not drama:
        raise HTTPException(status_code=404, detail="drama not found")

    episodes = (
        db.query(Episode)
        .filter(
            Episode.drama_id == drama_id,
            Episode.analyze_status.in_(["pending", "failed"]),
        )
        .all()
    )
    if not episodes:
        return ok({"queued_count": 0, "job_ids": []}, "no episodes to analyze")

    queued_jobs: list[Job] = []
    errors: list[str] = []
    for episode in episodes:
        try:
            job = create_and_enqueue_job(db, "ai_analyze", {"episode_id": episode.id})
            queued_jobs.append(job)
        except Exception as exc:
            errors.append(f"episode {episode.id}: {exc}")

    return ok(
        {
            "queued_count": len(queued_jobs),
            "job_ids": [j.id for j in queued_jobs],
            "errors": errors,
        },
        f"{len(queued_jobs)} analysis jobs queued",
    )
