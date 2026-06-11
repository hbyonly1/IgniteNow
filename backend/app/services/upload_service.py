from datetime import datetime
import json
import mimetypes
from pathlib import Path
import subprocess
from uuid import uuid4

from fastapi import HTTPException, UploadFile


REPO_ROOT = Path(__file__).resolve().parents[3]
UPLOAD_ROOT = REPO_ROOT / "backend" / "uploads"
VIDEO_DIR = UPLOAD_ROOT / "videos"
SUBTITLE_DIR = UPLOAD_ROOT / "subtitles"
IMAGE_DIR = UPLOAD_ROOT / "images"
ALLOWED_VIDEO_EXTENSIONS = {".mp4"}
ALLOWED_SUBTITLE_EXTENSIONS = {".srt", ".vtt", ".txt"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def ensure_upload_dirs() -> None:
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    SUBTITLE_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def _safe_suffix(filename: str, allowed: set[str], label: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in allowed:
        allowed_values = ", ".join(sorted(allowed))
        raise HTTPException(status_code=400, detail=f"{label} must be one of: {allowed_values}")
    return suffix


def _safe_filename(suffix: str) -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"{timestamp}_{uuid4().hex}{suffix}"


async def save_video_file(file: UploadFile) -> Path:
    suffix = _safe_suffix(file.filename or "", ALLOWED_VIDEO_EXTENSIONS, "video_file")
    content_type = (file.content_type or "").lower()
    if content_type and content_type not in {"video/mp4", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="video_file must be mp4")
    ensure_upload_dirs()
    path = VIDEO_DIR / _safe_filename(suffix)
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="video_file is empty")
    path.write_bytes(contents)
    return path


async def save_subtitle_file(file: UploadFile) -> tuple[Path, str]:
    suffix = _safe_suffix(file.filename or "", ALLOWED_SUBTITLE_EXTENSIONS, "subtitle_file")
    ensure_upload_dirs()
    path = SUBTITLE_DIR / _safe_filename(suffix)
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="subtitle_file is empty")
    path.write_bytes(contents)
    text = contents.decode("utf-8-sig", errors="replace")
    return path, text


async def save_image_file(file: UploadFile) -> Path:
    suffix = _safe_suffix(file.filename or "", ALLOWED_IMAGE_EXTENSIONS, "image_file")
    content_type = (file.content_type or "").lower()
    if content_type and content_type not in {"image/jpeg", "image/png", "image/webp", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="image_file must be jpg, png or webp")
    ensure_upload_dirs()
    path = IMAGE_DIR / _safe_filename(suffix)
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="image_file is empty")
    path.write_bytes(contents)
    return path


def probe_video_metadata(path: Path, content_type: str = "") -> dict:
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except FileNotFoundError:
        # Fallback for local development without ffprobe
        return {
            "duration": 0.0,
            "width": 0,
            "height": 0,
            "file_size": path.stat().st_size,
            "mime_type": content_type or "video/mp4",
        }
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=400, detail="ffprobe timed out while parsing video") from exc

    if completed.returncode != 0:
        detail = (completed.stderr or "invalid video file").strip()
        raise HTTPException(status_code=400, detail=f"ffprobe failed: {detail}")

    try:
        payload = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="ffprobe returned invalid JSON") from exc

    video_stream = None
    for stream in payload.get("streams", []):
        if stream.get("codec_type") == "video":
            video_stream = stream
            break
    if not video_stream:
        raise HTTPException(status_code=400, detail="video stream not found")

    duration = _float_value(payload.get("format", {}).get("duration"))
    if duration <= 0:
        duration = _float_value(video_stream.get("duration"))
    mime_type = (content_type or mimetypes.guess_type(path.name)[0] or "").lower()

    return {
        "duration": duration,
        "width": int(video_stream.get("width") or 0),
        "height": int(video_stream.get("height") or 0),
        "file_size": path.stat().st_size,
        "mime_type": mime_type,
    }


def _float_value(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
