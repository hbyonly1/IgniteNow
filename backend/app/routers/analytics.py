from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import cast, func, Date
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Drama, Episode, HighlightEvent, UserInteractionLog
from ..schemas import EpisodeTimelineItem, HighlightStatsOut
from .common import ok, require_admin

router = APIRouter(dependencies=[Depends(require_admin)])


def _interaction_counts(db: Session):
    rows = (
        db.query(
            UserInteractionLog.highlight_id,
            UserInteractionLog.action_type,
            func.count(UserInteractionLog.id),
        )
        .group_by(UserInteractionLog.highlight_id, UserInteractionLog.action_type)
        .all()
    )
    counts: dict[int, dict[str, int]] = {}
    for highlight_id, action_type, count in rows:
        counts.setdefault(highlight_id, {"impression": 0, "click": 0, "ignore": 0})
        counts[highlight_id][action_type] = count
    return counts


def _stats_for_highlight(highlight: HighlightEvent, counts: dict[int, dict[str, int]]) -> dict:
    item_counts = counts.get(highlight.id, {"impression": 0, "click": 0, "ignore": 0})
    impression_count = item_counts.get("impression", 0)
    click_count = item_counts.get("click", 0)
    ignore_count = item_counts.get("ignore", 0)
    return {
        "highlight_id": highlight.id,
        "episode_id": highlight.episode_id,
        "start_time": highlight.start_time,
        "end_time": highlight.end_time,
        "highlight_type": highlight.highlight_type,
        "button_text": highlight.button_text,
        "status": highlight.status,
        "impression_count": impression_count,
        "click_count": click_count,
        "ignore_count": ignore_count,
        "click_rate": round(click_count / impression_count, 4) if impression_count else 0,
    }


@router.get("/analytics/overview")
def analytics_overview(db: Session = Depends(get_db)):
    impression_count = db.query(UserInteractionLog).filter(UserInteractionLog.action_type == "impression").count()
    click_count = db.query(UserInteractionLog).filter(UserInteractionLog.action_type == "click").count()
    ignore_count = db.query(UserInteractionLog).filter(UserInteractionLog.action_type == "ignore").count()
    return ok(
        {
            "drama_count": db.query(Drama).count(),
            "episode_count": db.query(Episode).count(),
            "highlight_count": db.query(HighlightEvent).count(),
            "published_highlight_count": db.query(HighlightEvent).filter(HighlightEvent.status == "published").count(),
            "interaction_count": db.query(UserInteractionLog).count(),
            "click_count": click_count,
            "ignore_count": ignore_count,
            "avg_click_rate": round(click_count / impression_count, 4) if impression_count else 0,
        }
    )


@router.get("/analytics/highlight-types")
def highlight_types(db: Session = Depends(get_db)):
    rows = db.query(HighlightEvent.highlight_type, func.count(HighlightEvent.id)).group_by(HighlightEvent.highlight_type).all()
    return ok([{"highlight_type": item[0], "count": item[1]} for item in rows])


@router.get("/analytics/top-actions")
def top_actions(db: Session = Depends(get_db)):
    rows = (
        db.query(UserInteractionLog.action_value, func.count(UserInteractionLog.id))
        .filter(UserInteractionLog.action_type == "click")
        .group_by(UserInteractionLog.action_value)
        .order_by(func.count(UserInteractionLog.id).desc())
        .limit(10)
        .all()
    )
    return ok([{"action_value": item[0] or "unknown", "count": item[1]} for item in rows])


@router.get("/analytics/highlight-ranking")
def highlight_ranking(limit: int = 20, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 100)
    counts = _interaction_counts(db)
    highlights = db.query(HighlightEvent).filter(HighlightEvent.status == "published").all()
    ranked = [_stats_for_highlight(item, counts) for item in highlights]
    ranked.sort(key=lambda item: (item["click_count"], item["impression_count"], item["click_rate"]), reverse=True)
    return ok([HighlightStatsOut(**item).model_dump() for item in ranked[:limit]])


@router.get("/analytics/episodes/{episode_id}/timeline")
def episode_timeline(episode_id: int, db: Session = Depends(get_db)):
    if not db.get(Episode, episode_id):
        raise HTTPException(status_code=404, detail="episode not found")
    counts = _interaction_counts(db)
    highlights = db.query(HighlightEvent).filter(HighlightEvent.episode_id == episode_id).order_by(HighlightEvent.start_time).all()
    return ok([EpisodeTimelineItem(**_stats_for_highlight(item, counts)).model_dump() for item in highlights])


@router.get("/analytics/highlights/{highlight_id}")
def highlight_stats(highlight_id: int, db: Session = Depends(get_db)):
    highlight = db.get(HighlightEvent, highlight_id)
    if not highlight:
        raise HTTPException(status_code=404, detail="highlight not found")
    counts = _interaction_counts(db)
    return ok(HighlightStatsOut(**_stats_for_highlight(highlight, counts)).model_dump())


@router.get("/analytics/trend")
def analytics_trend(
    from_date: str = None,
    to_date: str = None,
    db: Session = Depends(get_db),
):
    """按日期分组返回互动趋势数据。
    - `from_date`: 可选，格式 YYYY-MM-DD，起始日期（含）
    - `to_date`: 可选，格式 YYYY-MM-DD，结束日期（含）
    未传日期时返回最近 30 天数据。
    """
    from datetime import datetime, timedelta

    if from_date:
        try:
            start = datetime.strptime(from_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="from_date 格式应为 YYYY-MM-DD")
    else:
        start = datetime.utcnow() - timedelta(days=30)

    if to_date:
        try:
            # 包含 to_date 当天，取到次日零时
            end = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            raise HTTPException(status_code=400, detail="to_date 格式应为 YYYY-MM-DD")
    else:
        end = datetime.utcnow() + timedelta(days=1)

    if start >= end:
        raise HTTPException(status_code=400, detail="from_date 必须早于 to_date")

    rows = (
        db.query(
            cast(UserInteractionLog.created_at, Date).label("date"),
            UserInteractionLog.action_type,
            func.count(UserInteractionLog.id).label("count"),
        )
        .filter(
            UserInteractionLog.created_at >= start,
            UserInteractionLog.created_at < end,
        )
        .group_by(cast(UserInteractionLog.created_at, Date), UserInteractionLog.action_type)
        .order_by(cast(UserInteractionLog.created_at, Date))
        .all()
    )

    # 按日期聚合为一条记录
    trend: dict[str, dict[str, int]] = {}
    for date, action_type, count in rows:
        date_str = str(date)
        trend.setdefault(date_str, {"date": date_str, "impression": 0, "click": 0, "ignore": 0})
        if action_type in trend[date_str]:
            trend[date_str][action_type] = count

    result = sorted(trend.values(), key=lambda x: x["date"])
    for item in result:
        imp = item["impression"]
        item["click_rate"] = round(item["click"] / imp, 4) if imp else 0

    return ok(result)
