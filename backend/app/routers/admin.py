from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Drama, Episode, HighlightEvent
from ..schemas import (
    AnalyzeRequest,
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
from ..services.analysis_service import analyze_episode_highlights
from ..services.highlight_service import (
    apply_highlight_update,
    assert_no_published_overlap,
    create_highlight,
)
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
    drama = Drama(**payload.model_dump())
    db.add(drama)
    db.commit()
    db.refresh(drama)
    return ok(DramaOut.model_validate(drama).model_dump(), "drama created")


@router.put("/dramas/{drama_id}")
def update_drama(drama_id: int, payload: DramaUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    drama = db.get(Drama, drama_id)
    if not drama:
        raise HTTPException(status_code=404, detail="drama not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "status":
            if value not in {"active", "archived"}:
                raise HTTPException(status_code=400, detail="illegal status")
            setattr(drama, key, value)
        else:
            setattr(drama, key, value or "")
    db.commit()
    db.refresh(drama)
    return ok(DramaOut.model_validate(drama).model_dump(), "drama updated")


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
    episode = Episode(**payload.model_dump(), owner_user_id=user.id)
    db.add(episode)
    db.commit()
    db.refresh(episode)
    return ok(_episode_out(db, episode), "episode created")


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
    for key, value in updates.items():
        setattr(episode, key, value)
    db.commit()
    db.refresh(episode)
    return ok(_episode_out(db, episode), "episode updated")


@router.post("/episodes/{episode_id}/analyze")
def analyze_episode(episode_id: int, payload: Optional[AnalyzeRequest] = None, user=Depends(require_workspace_user), db: Session = Depends(get_db)):
    payload = payload or AnalyzeRequest()
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="episode not found")
    if not _can_access_episode(user, episode):
        raise HTTPException(status_code=403, detail="episode is not owned by current uploader")
    if episode.analyze_status == "processing":
        raise HTTPException(status_code=409, detail="episode is already processing")
    if not (episode.subtitle_content or episode.subtitle_url):
        episode.analyze_status = "failed"
        episode.analyze_error = "subtitle is required"
        db.commit()
        raise HTTPException(status_code=400, detail="subtitle is required")

    existing = db.query(HighlightEvent).filter(HighlightEvent.episode_id == episode_id).count()
    if existing and episode.analyze_status == "success" and not payload.force_reanalyze:
        return ok({"highlight_count": existing}, "existing highlights returned")

    try:
        return ok(analyze_episode_highlights(db, episode, payload.force_reanalyze), "analysis completed")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
        assert_no_published_overlap(db, episode_id, highlights)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ok({"published_count": len(highlights)}, "highlights published")
