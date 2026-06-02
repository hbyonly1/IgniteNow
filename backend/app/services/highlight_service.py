from typing import Optional, Union

from sqlalchemy.orm import Session

from ..models import Episode, HighlightEvent
from ..schemas import EFFECTS, HIGHLIGHT_STATUSES, HIGHLIGHT_TYPES, HighlightCreate, HighlightUpdate


def default_template(highlight_type: str) -> tuple[str, str]:
    templates = {
        "conflict": ("替她反击", "anger_bar"),
        "reversal": ("反转了", "screen_flash"),
        "sweet": ("磕到了", "heart_rain"),
        "satisfying": ("爽", "boom_effect"),
        "suspense": ("快更", "countdown"),
    }
    return templates.get(highlight_type, ("我有感觉", "screen_flash"))


def validate_highlight_payload(item: dict, episode: Optional[Episode] = None) -> None:
    highlight_type = item.get("highlight_type")
    if highlight_type not in HIGHLIGHT_TYPES:
        raise ValueError(f"illegal highlight_type: {highlight_type}")

    start_time = float(item.get("start_time", -1))
    end_time = float(item.get("end_time", -1))
    if start_time < 0:
        raise ValueError("start_time must be greater than or equal to 0")
    if start_time >= end_time:
        raise ValueError("start_time must be less than end_time")
    if episode and episode.duration and end_time > float(episode.duration) + 1:
        raise ValueError("end_time must not exceed episode duration")

    for field in ("intensity", "confidence", "trigger_score"):
        value = float(item.get(field, 0.5))
        if value < 0 or value > 1:
            raise ValueError(f"{field} must be between 0 and 1")

    effect = item.get("effect")
    if effect and effect not in EFFECTS:
        raise ValueError(f"illegal effect: {effect}")


def normalize_highlight_data(data: dict, episode: Optional[Episode] = None) -> dict:
    validate_highlight_payload(data, episode)
    result = dict(data)
    button_text = result.get("button_text")
    effect = result.get("effect")
    if not button_text or not effect:
        button_text, effect = default_template(result["highlight_type"])
    result["button_text"] = button_text
    result["effect"] = effect
    result["intensity"] = float(result.get("intensity", 0.5))
    result["confidence"] = float(result.get("confidence", 0.5))
    result["trigger_score"] = float(result.get("trigger_score", result.get("confidence", 0.5)))
    result["start_time"] = float(result["start_time"])
    result["end_time"] = float(result["end_time"])
    return result


def create_highlight(db: Session, episode: Episode, payload: Union[HighlightCreate, dict]) -> HighlightEvent:
    data = payload.model_dump() if isinstance(payload, HighlightCreate) else dict(payload)
    data["status"] = data.get("status") or "draft"
    if data.get("status") not in HIGHLIGHT_STATUSES:
        raise ValueError("illegal status")
    data = normalize_highlight_data(data, episode)
    highlight = HighlightEvent(episode_id=episode.id, **data)
    db.add(highlight)
    return highlight


def apply_highlight_update(highlight: HighlightEvent, payload: HighlightUpdate, episode: Optional[Episode] = None) -> None:
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in HIGHLIGHT_STATUSES:
        raise ValueError("illegal status")
    merged = {
        "start_time": highlight.start_time,
        "end_time": highlight.end_time,
        "highlight_type": highlight.highlight_type,
        "emotion": highlight.emotion,
        "intensity": highlight.intensity,
        "confidence": highlight.confidence,
        "trigger_score": highlight.trigger_score,
        "reason": highlight.reason,
        "button_text": highlight.button_text,
        "effect": highlight.effect,
        "status": highlight.status,
    }
    merged.update({key: value for key, value in data.items() if value is not None})
    normalized = normalize_highlight_data(merged, episode)
    normalized["status"] = merged["status"]
    for key, value in normalized.items():
        setattr(highlight, key, value)


def assert_no_published_overlap(db: Session, episode_id: int, highlights: list[HighlightEvent]) -> None:
    sorted_highlights = sorted(highlights, key=lambda item: (item.start_time, item.end_time, item.id or 0))
    for previous, current in zip(sorted_highlights, sorted_highlights[1:]):
        if previous.end_time > current.start_time:
            raise ValueError(f"highlight {previous.id} overlaps highlight {current.id}")

    for highlight in highlights:
        overlaps = (
            db.query(HighlightEvent)
            .filter(
                HighlightEvent.episode_id == episode_id,
                HighlightEvent.status == "published",
                HighlightEvent.id != highlight.id,
                HighlightEvent.start_time < highlight.end_time,
                HighlightEvent.end_time > highlight.start_time,
            )
            .first()
        )
        if overlaps:
            raise ValueError(f"highlight {highlight.id} overlaps published highlight {overlaps.id}")
