from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


HIGHLIGHT_TYPES = {"conflict", "reversal", "sweet", "satisfying", "suspense"}
HIGHLIGHT_STATUSES = {"draft", "published", "rejected", "archived"}
ACTION_TYPES = {"impression", "click", "ignore"}
EFFECTS = {"anger_bar", "screen_flash", "heart_rain", "boom_effect", "countdown"}
JOB_TYPES = {"ai_analyze", "subtitle_asr", "ocr_import"}
JOB_STATUSES = {"pending", "running", "success", "failed", "canceled"}
PUBLISH_CHANNELS = {"android"}
PUBLISH_STATUSES = {"pending", "publishing", "success", "failed", "canceled"}
ASSET_STATUSES = {"draft", "ready", "incomplete"}


class DramaCreate(BaseModel):
    title: str
    description: str = ""
    cover_url: str = ""
    wide_cover_url: str = ""
    categories: list[str] = Field(default_factory=list)
    cast_tags: list[str] = Field(default_factory=list)


class DramaUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    wide_cover_url: Optional[str] = None
    categories: Optional[list[str]] = None
    cast_tags: Optional[list[str]] = None
    status: Optional[str] = None


class DramaOut(DramaCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    created_at: datetime
    updated_at: datetime
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
    video_original_name: str = ""
    subtitle_url: str = ""
    subtitle_original_name: str = ""
    subtitle_content: str = ""
    duration: float = 0
    asset_status: str = "draft"
    video_width: int = 0
    video_height: int = 0
    video_file_size: int = 0
    video_mime_type: str = ""


class EpisodeUpdate(BaseModel):
    drama_id: Optional[int] = None
    episode_no: Optional[int] = None
    title: Optional[str] = None
    video_url: Optional[str] = None
    video_original_name: Optional[str] = None
    subtitle_url: Optional[str] = None
    subtitle_original_name: Optional[str] = None
    subtitle_content: Optional[str] = None
    duration: Optional[float] = None
    asset_status: Optional[str] = None
    video_width: Optional[int] = None
    video_height: Optional[int] = None
    video_file_size: Optional[int] = None
    video_mime_type: Optional[str] = None


class EpisodeOut(EpisodeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    analyze_status: str
    analyze_error: str = ""
    draft_highlight_count: int = 0
    published_highlight_count: int = 0
    rejected_highlight_count: int = 0
    archived_highlight_count: int = 0


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


class AnalysisQueueJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    status: str
    progress: float
    payload_json: str
    error: str
    created_at: datetime
    updated_at: datetime


class AnalysisQueueItemOut(BaseModel):
    id: int
    drama_id: int
    owner_user_id: Optional[int] = None
    episode_no: int
    title: str
    video_url: str
    subtitle_url: str = ""
    subtitle_content: str = ""
    duration: float = 0
    analyze_status: str
    analyze_error: str = ""
    draft_highlight_count: int = 0
    published_highlight_count: int = 0
    rejected_highlight_count: int = 0
    archived_highlight_count: int = 0
    drama_title: str
    cover_url: str = ""
    asset_status: str
    subtitle_ready: bool
    latest_job: Optional[AnalysisQueueJobOut] = None
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


class AssetFileOut(BaseModel):
    asset_type: str
    url: str
    path: str
    file_size: int
    mime_type: str = ""
    metadata: dict = Field(default_factory=dict)


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
    # 每次进入播放页由移动端生成，同一播放会话共享同一值；旧客户端不传时为 None
    play_session_id: Optional[str] = None


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


class PublishConfigUpdate(BaseModel):
    channel: str = "android"
    scheduled_at: Optional[datetime] = None
    strategy_tags: list[str] = Field(default_factory=list)
    cover_checked: bool = True
    summary_checked: bool = True


class PublishJobCreate(BaseModel):
    episode_ids: list[int] = Field(min_length=1)
    channel: str = "android"
    scheduled_at: Optional[datetime] = None


class PublishPendingItemOut(BaseModel):
    episode_id: int
    drama_id: int
    title: str
    drama_title: str
    episode_no: int
    status: str
    updated_at: datetime
    draft_highlight_count: int
    published_highlight_count: int
    last_publish_job_id: Optional[int] = None
    last_publish_status: Optional[str] = None
    last_publish_error: str = ""


class PublishJobItemOut(BaseModel):
    id: int
    publish_job_id: int
    episode_id: int
    status: str
    error: str
    published_highlight_count: int
    created_at: datetime
    updated_at: datetime


class PublishJobOut(BaseModel):
    id: int
    channel: str
    status: str
    scheduled_at: Optional[datetime] = None
    created_by_user_id: Optional[int] = None
    error: str
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    success_count: int = 0
    failed_count: int = 0
    content: str = ""
    impressions: int = 0
    clicks: int = 0
    click_rate: float = 0
    items: list[PublishJobItemOut] = Field(default_factory=list)


class LLMSettingsUpdate(BaseModel):
    enabled: bool = True
    api_key: str = Field(default="", max_length=512)
    clear_api_key: bool = False
    base_url: str = Field(default="", max_length=500)
    model: str = Field(default="", max_length=120)
    timeout_seconds: float = Field(default=90, ge=5, le=300)
    use_response_format: bool = False


class SystemSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    llm: Optional[LLMSettingsUpdate] = None


class PromptTemplateUpdate(BaseModel):
    content: str = Field(min_length=20, max_length=20000)
