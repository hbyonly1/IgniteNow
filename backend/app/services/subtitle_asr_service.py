from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import unquote, urlparse
import subprocess

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Episode
from .upload_service import SUBTITLE_DIR, UPLOAD_ROOT, ensure_upload_dirs


REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class TranscriptSegment:
    start: float
    end: float
    text: str


def transcribe_episode_subtitles(db: Session, episode: Episode, force: bool = False) -> dict:
    if episode.subtitle_content.strip() and not force:
        return {
            "episode_id": episode.id,
            "subtitle_count": _count_srt_cues(episode.subtitle_content),
            "subtitle_url": episode.subtitle_url,
            "skipped": True,
        }

    video_path = resolve_local_video_path(episode.video_url)
    if not video_path:
        raise ValueError("episode.video_url must point to a local uploaded video file")

    with TemporaryDirectory(prefix="ignitenow_asr_") as tmp_dir:
        audio_path = Path(tmp_dir) / f"episode_{episode.id}.wav"
        extract_audio(video_path, audio_path)
        segments = transcribe_audio(audio_path)

    if not segments:
        raise ValueError("ASR returned no subtitle segments")

    srt_content = segments_to_srt(segments)
    ensure_upload_dirs()
    SUBTITLE_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    subtitle_path = SUBTITLE_DIR / f"episode_{episode.id}_asr_{timestamp}.srt"
    subtitle_path.write_text(srt_content, encoding="utf-8")

    episode.subtitle_content = srt_content
    episode.subtitle_url = str(subtitle_path)
    episode.subtitle_original_name = subtitle_path.name
    episode.asset_status = "ready" if episode.video_url else episode.asset_status
    if episode.analyze_status == "failed" and episode.analyze_error:
        episode.analyze_status = "pending"
        episode.analyze_error = ""
    db.commit()
    db.refresh(episode)

    return {
        "episode_id": episode.id,
        "subtitle_count": len(segments),
        "subtitle_url": episode.subtitle_url,
        "skipped": False,
    }


def resolve_local_video_path(video_url: str) -> Path | None:
    value = (video_url or "").strip()
    if not value:
        return None

    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"}:
        path_value = unquote(parsed.path)
        if not path_value.startswith("/uploads/"):
            return None
        candidate = UPLOAD_ROOT / path_value.removeprefix("/uploads/")
        return candidate if candidate.exists() else None

    if value.startswith("/uploads/"):
        candidate = UPLOAD_ROOT / value.removeprefix("/uploads/")
        return candidate if candidate.exists() else None

    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    candidate = candidate.resolve()
    return candidate if candidate.exists() else None


def extract_audio(video_path: Path, audio_path: Path) -> None:
    try:
        completed = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "wav",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg is required for local subtitle ASR") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("ffmpeg timed out while extracting audio") from exc

    if completed.returncode != 0:
        detail = (completed.stderr or "audio extraction failed").strip()
        raise RuntimeError(f"ffmpeg failed: {detail}")


def transcribe_audio(audio_path: Path) -> list[TranscriptSegment]:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError("faster-whisper is not installed") from exc

    model = WhisperModel(
        settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )
    kwargs = {"vad_filter": True}
    if settings.whisper_language:
        kwargs["language"] = settings.whisper_language
    raw_segments, _info = model.transcribe(str(audio_path), **kwargs)

    segments: list[TranscriptSegment] = []
    for segment in raw_segments:
        text = str(getattr(segment, "text", "")).strip()
        if not text:
            continue
        segments.append(
            TranscriptSegment(
                start=max(0.0, float(getattr(segment, "start", 0.0) or 0.0)),
                end=max(0.0, float(getattr(segment, "end", 0.0) or 0.0)),
                text=text,
            )
        )
    return segments


def segments_to_srt(segments: list[TranscriptSegment]) -> str:
    blocks = []
    for index, segment in enumerate(segments, start=1):
        start = _format_srt_time(segment.start)
        end = _format_srt_time(max(segment.end, segment.start + 0.2))
        blocks.append(f"{index}\n{start} --> {end}\n{segment.text}")
    return "\n\n".join(blocks) + "\n"


def _format_srt_time(seconds: float) -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def _count_srt_cues(content: str) -> int:
    return sum(1 for line in content.splitlines() if "-->" in line)
