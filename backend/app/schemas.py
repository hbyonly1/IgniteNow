from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


HIGHLIGHT_TYPES = {"conflict", "reversal", "sweet", "satisfying", "suspense"}
HIGHLIGHT_STATUSES = {"draft", "published", "rejected", "archived"}
ACTION_TYPES = {"impression", "click", "ignore"}
EFFECTS = {"anger_bar", "screen_flash", "heart_rain", "boom_effect", "countdown"}
JOB_TYPES = {"ai_analyze", "ocr_import", "verify_demo_chain"}
JOB_STATUSES = {"pending", "running", "success", "failed", "canceled"}


class DramaCreate(BaseModel):
    title: str
    description: str = ""
    cover_url: str = ""


class DramaUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    status: Optional[str] = None


class DramaOut(DramaCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    episode_count: int = 0
    pending_episode_count: int = 0
    processing_episode_count: int = 0
    failed_episode_count: int = 0
    draft_highlight_count: int = 0
    published_highlight_count: int = 0


class EpisodeCreate(BaseModel):
    drama_id: int
    episode_no: int = 1
    title: str
    video_url: str
    subtitle_url: str = ""
    subtitle_content: str = ""
    duration: float = 0


class EpisodeUpdate(BaseModel):
    drama_id: Optional[int] = None
    episode_no: Optional[int] = None
    title: Optional[str] = None
    video_url: Optional[str] = None
    subtitle_url: Optional[str] = None
    subtitle_content: Optional[str] = None
    duration: Optional[float] = None


class EpisodeOut(EpisodeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_user_id: Optional[int] = None
    analyze_status: str
    analyze_error: str = ""
    draft_highlight_count: int = 0
    published_highlight_count: int = 0
    rejected_highlight_count: int = 0
    archived_highlight_count: int = 0


class AnalyzeRequest(BaseModel):
    force_reanalyze: bool = False


class JobCreate(BaseModel):
    type: str
    payload: dict = Field(default_factory=dict)


class JobRetryRequest(BaseModel):
    force: bool = False


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    status: str
    progress: float
    payload_json: str
    rq_job_id: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: str
    created_at: datetime
    updated_at: datetime


class JobLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    level: str
    message: str
    context_json: str
    created_at: datetime


class AuthRegister(BaseModel):
    username: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=128)


class AuthUserCreate(AuthRegister):
    role: str = "uploader"


class AuthLogin(BaseModel):
    username: str
    password: str


class AuthUserOut(BaseModel):
    id: int
    username: str
    role: str


class AuthTokenOut(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    user: AuthUserOut
    # Keep the original flat fields so existing mobile upload code can
    # continue reading the response during the admin auth transition.
    user_id: int
    username: str
    role: str


class UploadEpisodeOut(BaseModel):
    drama_id: int
    episode_id: int
    video_url: str
    has_subtitle: bool


class HighlightUpdate(BaseModel):
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    highlight_type: Optional[str] = None
    emotion: Optional[str] = None
    intensity: Optional[float] = Field(default=None, ge=0, le=1)
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    trigger_score: Optional[float] = Field(default=None, ge=0, le=1)
    reason: Optional[str] = None
    button_text: Optional[str] = None
    effect: Optional[str] = None
    status: Optional[str] = None


class HighlightCreate(BaseModel):
    start_time: float
    end_time: float
    highlight_type: str
    emotion: str = ""
    intensity: float = Field(default=0.5, ge=0, le=1)
    confidence: float = Field(default=0.5, ge=0, le=1)
    trigger_score: float = Field(default=0.5, ge=0, le=1)
    reason: str = ""
    button_text: str = ""
    effect: str = ""
    status: str = "draft"


class HighlightBulkStatusUpdate(BaseModel):
    highlight_ids: Optional[list[int]] = None
    status: str


class HighlightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    episode_id: int
    start_time: float
    end_time: float
    highlight_type: str
    emotion: str
    intensity: float
    confidence: float
    trigger_score: float
    reason: str
    button_text: str
    effect: str
    status: str


class PlayerHighlight(BaseModel):
    highlight_id: int
    start_time: float
    end_time: float
    highlight_type: str
    emotion: str
    intensity: float
    trigger_score: float
    button_text: str
    effect: str


class PlayerDrama(BaseModel):
    drama_id: int
    title: str
    description: str
    cover_url: str


class PlayerEpisodeSummary(BaseModel):
    episode_id: int
    drama_id: int
    episode_no: int
    title: str
    duration: float
    published_highlight_count: int


class PlayerEpisode(BaseModel):
    episode_id: int
    title: str
    video_url: str
    duration: float
    highlights: list[PlayerHighlight]


class InteractionCreate(BaseModel):
    user_id: str
    episode_id: int
    highlight_id: int
    action_type: str
    action_value: str = ""
    watch_time: float = 0
    idempotency_key: str


class HighlightStatsOut(BaseModel):
    highlight_id: int
    episode_id: int
    start_time: float
    end_time: float
    highlight_type: str
    button_text: str
    status: str
    impression_count: int
    click_count: int
    ignore_count: int
    click_rate: float


class EpisodeTimelineItem(BaseModel):
    highlight_id: int
    start_time: float
    end_time: float
    highlight_type: str
    button_text: str
    status: str
    impression_count: int
    click_count: int
    ignore_count: int
    click_rate: float
