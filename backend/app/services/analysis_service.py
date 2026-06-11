import sys
from pathlib import Path

from sqlalchemy.orm import Session

from ..models import Episode, HighlightEvent
from .highlight_service import create_highlight
from .settings_service import load_llm_config

# ai_service 与 backend 同属仓库根目录，确保 import 路径可用
_repo_root = str(Path(__file__).resolve().parents[3])
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

from ai_service.highlight_analyzer import analyze_subtitle_text  # noqa: E402


def analyze_episode_highlights(
    db: Session,
    episode: Episode,
    force_reanalyze: bool = False,
    allow_processing: bool = False,
) -> dict:
    if episode.analyze_status == "processing" and not allow_processing:
        raise ValueError("episode is already processing")
    if not (episode.subtitle_content or episode.subtitle_url):
        episode.analyze_status = "failed"
        episode.analyze_error = "subtitle is required"
        db.commit()
        raise ValueError("subtitle is required")

    existing = db.query(HighlightEvent).filter(HighlightEvent.episode_id == episode.id).count()
    if existing and episode.analyze_status == "success" and not force_reanalyze:
        return {"highlight_count": existing, "existing": True}

    episode.analyze_status = "processing"
    episode.analyze_error = ""
    db.commit()

    try:
        from ai_service.subtitle_parser import parse_subtitle_text as _parse_srt

        raw_content = episode.subtitle_content or ""
        try:
            cues = _parse_srt(raw_content)
            subtitle_payload = "\n".join(
                f"[{c.start_time:.2f}s - {c.end_time:.2f}s] {c.text}" for c in cues
            )
        except ValueError:
            # 解析失败时直接把原始内容传给 LLM，保留 fallback 能力
            subtitle_payload = raw_content

        result = analyze_subtitle_text(subtitle_payload, llm_config=load_llm_config(db))
        if force_reanalyze:
            db.query(HighlightEvent).filter(HighlightEvent.episode_id == episode.id).delete()

        created: list[HighlightEvent] = []
        invalid_reasons: list[str] = []
        for item in result["highlights"]:
            try:
                highlight = create_highlight(db, episode, item)
            except ValueError as exc:
                invalid_reasons.append(str(exc))
                continue
            created.append(highlight)

        episode.analyze_status = "success"
        episode.analyze_error = "; ".join(invalid_reasons[:3])
        db.commit()
        return {
            "highlight_count": len(created),
            "invalid_count": len(invalid_reasons),
        }
    except Exception as exc:
        episode.analyze_status = "failed"
        episode.analyze_error = str(exc)
        db.commit()
        raise
