from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import Request

from ..models import Episode


def is_remote_url(value: str) -> bool:
    scheme = urlparse(value).scheme.lower()
    return scheme in {"http", "https"}


def local_video_path(value: str) -> Optional[Path]:
    if not value:
        return None
    direct_path = Path(value)
    if direct_path.exists():
        return direct_path
    parsed = urlparse(value)
    if parsed.scheme and parsed.scheme.lower() not in {"file"}:
        return None
    path_value = parsed.path if parsed.scheme.lower() == "file" else value
    parsed_path = Path(path_value)
    return parsed_path if parsed_path.exists() else None


def player_video_url(episode: Episode, request: Request) -> str:
    if is_remote_url(episode.video_url):
        return episode.video_url
    if local_video_path(episode.video_url):
        return str(request.url_for("player_episode_video", episode_id=episode.id))
    return episode.video_url
