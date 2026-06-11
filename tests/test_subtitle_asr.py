import sys
from types import SimpleNamespace

from sqlalchemy.orm import Session

from backend.app.models import Drama, Episode
from backend.app.services import subtitle_asr_service
from backend.app.config import settings
from backend.app.services.subtitle_asr_service import TranscriptSegment


def test_transcribe_episode_subtitles_writes_srt(
    db_session: Session,
    tmp_path,
    monkeypatch,
) -> None:
    video_path = tmp_path / "episode.mp4"
    video_path.write_bytes(b"fake video")
    subtitle_dir = tmp_path / "subtitles"

    drama = Drama(title="ASR Drama")
    episode = Episode(
        drama=drama,
        episode_no=1,
        title="E001",
        video_url=str(video_path),
        subtitle_content="",
        asset_status="incomplete",
    )
    db_session.add(episode)
    db_session.commit()
    db_session.refresh(episode)

    def fake_extract_audio(_video_path, audio_path):
        audio_path.write_bytes(b"fake audio")

    def fake_transcribe_audio(_audio_path):
        return [
            TranscriptSegment(start=0.0, end=1.25, text="第一句台词"),
            TranscriptSegment(start=2.0, end=3.0, text="第二句台词"),
        ]

    monkeypatch.setattr(subtitle_asr_service, "SUBTITLE_DIR", subtitle_dir)
    monkeypatch.setattr(subtitle_asr_service, "extract_audio", fake_extract_audio)
    monkeypatch.setattr(subtitle_asr_service, "transcribe_audio", fake_transcribe_audio)

    result = subtitle_asr_service.transcribe_episode_subtitles(db_session, episode)

    assert result["subtitle_count"] == 2
    assert result["skipped"] is False
    assert episode.asset_status == "ready"
    assert "00:00:00,000 --> 00:00:01,250" in episode.subtitle_content
    assert "第一句台词" in episode.subtitle_content
    assert subtitle_dir.exists()
    assert result["subtitle_url"].endswith(".srt")


def test_transcribe_episode_subtitles_skips_existing_without_force(db_session: Session, tmp_path) -> None:
    video_path = tmp_path / "episode.mp4"
    video_path.write_bytes(b"fake video")
    drama = Drama(title="ASR Drama")
    episode = Episode(
        drama=drama,
        episode_no=1,
        title="E001",
        video_url=str(video_path),
        subtitle_content="1\n00:00:00,000 --> 00:00:01,000\n已有字幕\n",
        subtitle_url="existing.srt",
    )
    db_session.add(episode)
    db_session.commit()
    db_session.refresh(episode)

    result = subtitle_asr_service.transcribe_episode_subtitles(db_session, episode)

    assert result == {
        "episode_id": episode.id,
        "subtitle_count": 1,
        "subtitle_url": "existing.srt",
        "skipped": True,
    }


def test_transcribe_audio_uses_configured_download_root(tmp_path, monkeypatch) -> None:
    captured = {}

    class FakeWhisperModel:
        def __init__(self, model_name, **kwargs):
            captured["model_name"] = model_name
            captured["kwargs"] = kwargs

        def transcribe(self, audio_path, **kwargs):
            captured["audio_path"] = audio_path
            captured["transcribe_kwargs"] = kwargs
            return [SimpleNamespace(start=0.0, end=1.0, text="测试字幕")], None

    monkeypatch.setattr(settings, "whisper_model", "tiny")
    monkeypatch.setattr(settings, "whisper_device", "cpu")
    monkeypatch.setattr(settings, "whisper_compute_type", "int8")
    monkeypatch.setattr(settings, "whisper_language", "zh")
    monkeypatch.setattr(settings, "whisper_download_root", str(tmp_path / "model_cache"))
    monkeypatch.setitem(
        sys.modules,
        "faster_whisper",
        SimpleNamespace(WhisperModel=FakeWhisperModel),
    )

    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake")
    segments = subtitle_asr_service.transcribe_audio(audio_path)

    assert segments == [TranscriptSegment(start=0.0, end=1.0, text="测试字幕")]
    assert captured["model_name"] == "tiny"
    assert captured["kwargs"]["download_root"] == str(tmp_path / "model_cache")
    assert captured["transcribe_kwargs"]["language"] == "zh"
