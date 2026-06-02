from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Drama(Base):
    __tablename__ = "drama"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    cover_url: Mapped[str] = mapped_column(String(500), default="")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    episodes: Mapped[list["Episode"]] = relationship(back_populates="drama", cascade="all, delete-orphan")


class UserAccount(Base):
    __tablename__ = "user_account"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="uploader", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Episode(Base):
    __tablename__ = "episode"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    drama_id: Mapped[int] = mapped_column(ForeignKey("drama.id"), nullable=False, index=True)
    owner_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user_account.id"), nullable=True, index=True)
    episode_no: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    video_url: Mapped[str] = mapped_column(String(500), nullable=False)
    subtitle_url: Mapped[str] = mapped_column(String(500), default="")
    subtitle_content: Mapped[str] = mapped_column(Text, default="")
    duration: Mapped[float] = mapped_column(Float, default=0)
    analyze_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    analyze_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    drama: Mapped[Drama] = relationship(back_populates="episodes")
    owner: Mapped[Optional[UserAccount]] = relationship()
    highlights: Mapped[list["HighlightEvent"]] = relationship(back_populates="episode", cascade="all, delete-orphan")


class HighlightEvent(Base):
    __tablename__ = "highlight_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("episode.id"), nullable=False, index=True)
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)
    highlight_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    emotion: Mapped[str] = mapped_column(String(64), default="")
    intensity: Mapped[float] = mapped_column(Float, default=0.5)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    trigger_score: Mapped[float] = mapped_column(Float, default=0.5)
    reason: Mapped[str] = mapped_column(Text, default="")
    button_text: Mapped[str] = mapped_column(String(120), default="我有感觉")
    effect: Mapped[str] = mapped_column(String(64), default="screen_flash")
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    episode: Mapped[Episode] = relationship(back_populates="highlights")
    logs: Mapped[list["UserInteractionLog"]] = relationship(back_populates="highlight")


class InteractionTemplate(Base):
    __tablename__ = "interaction_template"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    highlight_type: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    button_text: Mapped[str] = mapped_column(String(120), nullable=False)
    effect: Mapped[str] = mapped_column(String(64), nullable=False)
    position: Mapped[str] = mapped_column(String(32), default="bottom")
    duration_ms: Mapped[int] = mapped_column(Integer, default=4000)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserInteractionLog(Base):
    __tablename__ = "user_interaction_log"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uk_interaction_idempotency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("episode.id"), nullable=False, index=True)
    highlight_id: Mapped[int] = mapped_column(ForeignKey("highlight_event.id"), nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    action_value: Mapped[str] = mapped_column(String(120), default="")
    watch_time: Mapped[float] = mapped_column(Float, default=0)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    highlight: Mapped[HighlightEvent] = relationship(back_populates="logs")


class Job(Base):
    __tablename__ = "job"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    progress: Mapped[float] = mapped_column(Float, default=0)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    rq_job_id: Mapped[str] = mapped_column(String(160), default="", index=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    logs: Mapped[list["JobLog"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class JobLog(Base):
    __tablename__ = "job_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"), nullable=False, index=True)
    level: Mapped[str] = mapped_column(String(32), default="info", index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    job: Mapped[Job] = relationship(back_populates="logs")


class SystemLog(Base):
    __tablename__ = "system_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    user_id: Mapped[str] = mapped_column(String(120), default="", index=True)
    episode_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    job_id: Mapped[str] = mapped_column(String(160), default="", index=True)
    level: Mapped[str] = mapped_column(String(32), default="info", index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    error_stack: Mapped[str] = mapped_column(Text, default="")
    context_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
