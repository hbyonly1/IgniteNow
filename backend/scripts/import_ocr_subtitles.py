from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(BACKEND_ROOT / 'ignitenow.db').as_posix()}")

from app.database import SessionLocal
from app.models import Episode


TIMESTAMP_RE = re.compile(r"^\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]\s*$")
EPISODE_RE = re.compile(r"E(\d{3})", re.IGNORECASE)
HAN_RE = re.compile(r"[\u4e00-\u9fff]")
ASCII_WORD_RE = re.compile(r"[A-Za-z]{3,}")

NOISE_LINES = {
    "m",
    "mt",
    "l",
    "c",
    "n",
    "cn",
    "o",
    "ok",
}


@dataclass
class OcrBlock:
    start: float
    lines: list[str]


def seconds_to_srt_time(value: float) -> str:
    millis = int(round(value * 1000))
    hours, remainder = divmod(millis, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def parse_timestamp(match: re.Match[str]) -> float:
    hours, minutes, seconds, millis = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def normalize_text(value: str) -> str:
    value = value.strip()
    value = re.sub(r"\s+", " ", value)
    return value


def is_noise_line(line: str) -> bool:
    compact = re.sub(r"\s+", "", line).lower()
    if not compact or compact in NOISE_LINES:
        return True
    has_han = bool(HAN_RE.search(line))
    if has_han:
        allowed_single_chars = {"\u597d", "\u55ef", "\u7b49"}
        return len(compact) <= 1 and compact not in allowed_single_chars
    if len(compact) <= 2:
        return True
    words = ASCII_WORD_RE.findall(line)
    if not words:
        return True
    meaningful = {"euthanasia", "appointment", "letter", "mr", "jing"}
    return not any(word.lower() in meaningful for word in words) and len(words) < 2


def parse_ocr_file(path: Path) -> list[OcrBlock]:
    blocks: list[OcrBlock] = []
    current_start: Optional[float] = None
    current_lines: list[str] = []
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        match = TIMESTAMP_RE.match(line)
        if match:
            if current_start is not None:
                blocks.append(OcrBlock(current_start, current_lines))
            current_start = parse_timestamp(match)
            current_lines = []
            continue
        if current_start is None or not line:
            continue
        normalized = normalize_text(line)
        if not is_noise_line(normalized):
            current_lines.append(normalized)
    if current_start is not None:
        blocks.append(OcrBlock(current_start, current_lines))
    return blocks


def clean_blocks(blocks: list[OcrBlock], min_gap: float = 0.35) -> list[OcrBlock]:
    cleaned: list[OcrBlock] = []
    recent_texts: list[str] = []
    for block in blocks:
        unique_lines: list[str] = []
        seen_lines: set[str] = set()
        for line in block.lines:
            key = re.sub(r"\W+", "", line).lower()
            if key and key not in seen_lines:
                seen_lines.add(key)
                unique_lines.append(line)
        if not unique_lines:
            continue
        text_key = re.sub(r"\W+", "", "\n".join(unique_lines)).lower()
        if not text_key:
            continue
        if cleaned and block.start - cleaned[-1].start < min_gap:
            continue
        if text_key in recent_texts[-4:]:
            continue
        cleaned.append(OcrBlock(block.start, unique_lines))
        recent_texts.append(text_key)
    return cleaned


def blocks_to_srt(blocks: list[OcrBlock]) -> str:
    parts: list[str] = []
    for index, block in enumerate(blocks, start=1):
        next_start = blocks[index].start if index < len(blocks) else block.start + 2.0
        end = min(max(block.start + 1.6, next_start - 0.08), block.start + 4.0)
        if end <= block.start:
            end = block.start + 1.2
        parts.append(
            "\n".join(
                [
                    str(index),
                    f"{seconds_to_srt_time(block.start)} --> {seconds_to_srt_time(end)}",
                    *block.lines,
                ]
            )
        )
    return "\n\n".join(parts) + ("\n" if parts else "")


def episode_no_from_name(path: Path) -> Optional[int]:
    match = EPISODE_RE.search(path.stem)
    if not match:
        return None
    return int(match.group(1))


def import_subtitles(directory: Path, drama_id: int, dry_run: bool = False):
    db = SessionLocal()
    try:
        results = []
        for path in sorted(directory.glob("*_ocr.txt")):
            episode_no = episode_no_from_name(path)
            if episode_no is None:
                continue
            episode = (
                db.query(Episode)
                .filter(Episode.drama_id == drama_id, Episode.episode_no == episode_no)
                .first()
            )
            if not episode:
                results.append((path.name, "missing_episode", 0, 0))
                continue
            raw_blocks = parse_ocr_file(path)
            cleaned_blocks = clean_blocks(raw_blocks)
            srt = blocks_to_srt(cleaned_blocks)
            if not dry_run:
                episode.subtitle_url = str(path)
                episode.subtitle_content = srt
                episode.analyze_status = "pending"
                episode.analyze_error = ""
            results.append((path.name, episode.id, len(raw_blocks), len(cleaned_blocks)))
        if not dry_run:
            db.commit()
        return results
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Import timestamped OCR text files into episode.subtitle_content.")
    parser.add_argument("directory", type=Path)
    parser.add_argument("--drama-id", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    for item in import_subtitles(args.directory, args.drama_id, args.dry_run):
        print(item)


if __name__ == "__main__":
    main()
