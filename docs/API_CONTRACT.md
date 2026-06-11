# IgniteNow API 契约

基础地址：`http://localhost:8000`

需要登录的后台/工作台接口统一携带 JWT：

```http
Authorization: Bearer <access_token>
```

旧 MVP `X-Admin-Token` 固定后台密钥已移除，不再作为接口鉴权方式。

统一响应：

```json
{
  "success": true,
  "message": "ok",
  "data": {}
}
```

## 状态与枚举

- `episode.analyze_status`: `pending`、`processing`、`success`、`failed`
- `highlight_event.status`: `draft`、`published`、`rejected`、`archived`
- `highlight_type`: `conflict`、`reversal`、`sweet`、`satisfying`、`suspense`
- `action_type`: `impression`、`click`、`ignore`
- `episode.asset_status`: `draft`、`ready`、`incomplete`
- 时间单位：秒，字段类型为 number/float

## 账号认证 API

第一版采用 JWT access token，不做 refresh token。默认有效期为 `JWT_EXPIRE_MINUTES=120`，响应中的 `expires_in` 单位为秒。工作台登录复用本节接口：前端根据账号 `role` 决定可访问页面和接口权限。

### `POST /api/auth/register`

注册上传账号，并返回 Bearer token。公开注册只创建 `uploader` 角色。

```json
{
  "username": "uploader",
  "password": "secret123"
}
```

响应 `data`：

```json
{
  "access_token": "jwt-token",
  "token_type": "Bearer",
  "expires_in": 7200,
  "user": {
    "id": 1,
    "username": "uploader",
    "role": "uploader"
  },
  "user_id": 1,
  "username": "uploader",
  "role": "uploader"
}
```



### `POST /api/auth/login`

登录账号，并返回 Bearer token。请求体同注册接口。`admin` 和 `uploader` 都可以登录工作台，但可访问页面与接口不同。

### `GET /api/auth/me`

校验当前 Bearer token，并返回当前账号信息和一个新的 access token。需要：
```http
Authorization: Bearer <access_token>
```

非法、过期或不存在的 token 返回 `401`。

### `POST /api/auth/logout`

退出登录占位接口。第一版没有 refresh token 和服务端 token 黑名单，因此该接口只返回成功，不吊销已签发的 access token；前端应清除本地保存的 token。

响应 `data`：

```json
{
  "revoked": false
}
```

### `POST /api/auth/admin/users`

后台创建账号。需要 `role=admin` 的 Bearer token。请求体：
```json
{
  "username": "admin",
  "password": "secret123",
  "role": "admin"
}
```

`role` 仅允许 `admin` 或 `uploader`。公开注册接口仍只能创建 `uploader`。

首次部署时，如果数据库中还没有任何 `admin` 账号，可在服务端运行：

```bash
python backend/scripts/bootstrap_admin.py
```

该脚本只在不存在管理员时创建第一个 `admin`，并输出一次性随机密码；已有管理员时不会覆盖密码。

### ~~`POST /api/uploads/episodes`~~ ⚠️ 已下线

**此接口已返回 `410 Gone`，不再接受请求。**

移动端上传链路已确定下线。内容上传请使用管理后台接口：
- 通用素材上传：`POST /api/admin/assets/files`
- 单集视频上传：`POST /api/dramas/{drama_id}/episodes/upload`


## 管理后台 API

### `GET /api/dramas`

需要 `admin` 或 `uploader` Bearer token。

返回短剧列表。`admin` 返回全部短剧；`uploader` 只返回包含自己名下剧集的短剧。响应项包含内容管理页需要的摘要字段：

```json
{
  "id": 1,
  "title": "逆光归来",
  "description": "演示短剧",
  "cover_url": "",
  "wide_cover_url": "",
  "categories": ["都市", "逆袭"],
  "cast_tags": ["主演A"],
  "status": "active",
  "created_at": "2026-06-11T10:00:00",
  "updated_at": "2026-06-11T10:00:00",
  "episode_count": 12,
  "pending_episode_count": 3,
  "processing_episode_count": 1,
  "failed_episode_count": 0,
  "draft_highlight_count": 8,
  "published_highlight_count": 24
}
```

### `POST /api/dramas`

创建短剧。需要 `admin` Bearer token。`uploader` 可通过移动端上传接口在未传 `drama_id` 时创建自己的上传短剧，但不能在工作台直接管理全局短剧资产。

请求体：

```json
{
  "title": "逆光归来",
  "description": "演示短剧",
  "cover_url": "",
  "wide_cover_url": "",
  "categories": ["都市", "逆袭"],
  "cast_tags": ["主演A"]
}
```

### `PUT /api/dramas/{drama_id}`

更新短剧。需要 `admin` Bearer token。

```json
{
  "title": "逆光归来",
  "description": "演示短剧",
  "cover_url": "",
  "wide_cover_url": "",
  "categories": ["都市", "逆袭"],
  "cast_tags": ["主演A"],
  "status": "active"
}
```

`status` 仅允许 `active` 或 `archived`。

### `GET /api/episodes?drama_id=1`

需要 `admin` 或 `uploader` Bearer token。

返回剧集列表。`drama_id` 可选。`admin` 返回全部剧集；`uploader` 只返回 `owner_user_id` 等于当前账号 ID 的剧集。响应项包含：

```json
{
  "id": 1,
  "drama_id": 1,
  "owner_user_id": 2,
  "episode_no": 1,
  "title": "第 1 集",
  "video_url": "https://example.com/demo.mp4",
  "subtitle_url": "",
  "subtitle_content": "",
  "duration": 30,
  "asset_status": "draft",
  "video_width": 1080,
  "video_height": 1920,
  "video_file_size": 10485760,
  "video_mime_type": "video/mp4",
  "analyze_status": "pending",
  "analyze_error": "",
  "created_at": "2026-06-11T10:00:00",
  "updated_at": "2026-06-11T10:00:00",
  "draft_highlight_count": 0,
  "published_highlight_count": 0,
  "rejected_highlight_count": 0,
  "archived_highlight_count": 0
}
```

### `POST /api/episodes`

创建剧集。需要 `admin` 或 `uploader` Bearer token。新建剧集会写入当前账号为 `owner_user_id`。

```json
{
  "drama_id": 1,
  "episode_no": 1,
  "title": "第 1 集",
  "video_url": "https://example.com/demo.mp4",
  "subtitle_url": "",
  "subtitle_content": "1\n00:00:02,000 --> 00:00:05,000\n真相终于曝光。",
  "duration": 30,
  "asset_status": "draft",
  "video_width": 1080,
  "video_height": 1920,
  "video_file_size": 10485760,
  "video_mime_type": "video/mp4"
}
```

### `PUT /api/episodes/{episode_id}`

更新剧集配置。需要 `admin` 或 `uploader` Bearer token。`admin` 可更新任意剧集；`uploader` 只能更新自己名下剧集。

```json
{
  "drama_id": 1,
  "episode_no": 1,
  "title": "第 1 集",
  "video_url": "https://example.com/demo.mp4",
  "subtitle_url": "",
  "subtitle_content": "1\n00:00:02,000 --> 00:00:05,000\n真相终于曝光。",
  "duration": 30,
  "asset_status": "ready",
  "video_width": 1080,
  "video_height": 1920,
  "video_file_size": 10485760,
  "video_mime_type": "video/mp4"
}
```

`asset_status` 仅允许 `draft`、`ready`、`incomplete`。后台真实上传视频/字幕后应同步更新该字段；AI 分析聚合接口仍会在缺少视频或字幕时返回 `incomplete`。`video_width`、`video_height`、`video_file_size`、`video_mime_type` 由后台上传接口通过 ffprobe 自动解析，手动创建/编辑接口保留这些字段用于兼容已有配置流。

### `POST /api/admin/assets/files`

后台通用素材上传接口。需要 `admin` Bearer token。

```http
Content-Type: multipart/form-data
```

表单字段：

- `asset_type`: `cover`、`wide_cover`、`image`、`video`、`subtitle`
- `file`: 上传文件；图片支持 `.jpg`、`.jpeg`、`.png`、`.webp`，视频支持 `.mp4`，字幕支持 `.srt`、`.vtt`、`.txt`

响应 `data`：

```json
{
  "asset_type": "video",
  "url": "/server/local/path/episode.mp4",
  "path": "/server/local/path/episode.mp4",
  "file_size": 10485760,
  "mime_type": "video/mp4",
  "metadata": {
    "duration": 30,
    "width": 1080,
    "height": 1920,
    "file_size": 10485760,
    "mime_type": "video/mp4"
  }
}
```

`url` 返回 `/uploads/...` 静态可访问地址，`path` 返回服务端本地保存路径；封面等前端展示字段应保存 `url`。视频上传会调用 `ffprobe` 解析元数据；部署环境必须包含 FFmpeg/ffprobe。解析失败、超时或文件不含视频流时返回 `400`。

### `POST /api/dramas/{drama_id}/episodes/upload`

管理后台为指定短剧上传单集视频并创建 episode。需要 `admin` 或 `uploader` Bearer token；新剧集会写入当前账号为 `owner_user_id`。

```http
Content-Type: multipart/form-data
```

表单字段：

- `episode_no`: 必填，整数，大于 0
- `episode_title`: 必填
- `video_file`: 必填，`.mp4`
- `subtitle_file`: 可选，`.srt`、`.vtt`、`.txt`
- `subtitle_content`: 可选，字幕文本；存在字幕文件时以文件内容为准

响应 `data` 同 `EpisodeOut`，并包含 ffprobe 写入的 `duration`、`video_width`、`video_height`、`video_file_size`、`video_mime_type`。有字幕时 `asset_status=ready`，无字幕时 `asset_status=incomplete`。

### `POST /api/dramas/{drama_id}/episodes/batch`

批量创建剧集配置（不含文件上传）。需要 `admin` Bearer token。
每条记录传入 `video_url`、字幕等基础字段；适合已有视频地址时批量导入剧集列表。

```json
{
  "episodes": [
    {
      "episode_no": 1,
      "title": "第 1 集",
      "video_url": "https://example.com/ep1.mp4",
      "duration": 120,
      "asset_status": "draft"
    },
    {
      "episode_no": 2,
      "title": "第 2 集",
      "video_url": "https://example.com/ep2.mp4",
      "duration": 130,
      "asset_status": "draft"
    }
  ]
}
```

规则：`episode_no` 不允许重复，最多 100 条/次。响应 `data`：

```json
{
  "created_count": 2,
  "episode_ids": [11, 12]
}
```

### `POST /api/dramas/{drama_id}/enqueue-analysis`

按短剧批量提交 AI 分析任务。需要 `admin` Bearer token。

对该短剧下所有 `analyze_status=pending` 或 `failed` 的剧集提交 `ai_analyze` 任务；已在 `processing` 或 `success` 状态的剧集跳过，避免重复计算。

响应 `data`：

```json
{
  "queued_count": 3,
  "job_ids": [20, 21, 22],
  "errors": []
}
```

`errors` 非空表示部分剧集提交失败（如 Redis 不可用），其余成功提交的不受影响。

### AI 分析触发方式

AI 高光识别只允许通过系统任务异步触发，不再提供同步 HTTP 分析接口。旧 `POST /api/episodes/{episode_id}/analyze` 已删除，管理后台和 uploader 都必须使用 `POST /api/system/jobs` 创建 `ai_analyze` 任务。

AI 高光识别调用 LLM 进行识别，优先读取系统设置中的 LLM 配置，其次读取环境变量 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_TIMEOUT_SECONDS`、`LLM_USE_RESPONSE_FORMAT`。创建 `ai_analyze` 任务并成功入队后，后端会立即把对应 `episode.analyze_status` 置为 `processing`，让分析列表马上进入“分析中”。worker 执行时如果剧集已有 `subtitle_content` / `subtitle_url`，直接进行高光识别；如果没有字幕但视频是服务端本地可访问文件或 `/uploads/...` 视频，会先执行本地字幕识别并写回字幕，再继续 AI 高光识别；如果既没有字幕又不能进行本地字幕识别，任务标记为 `failed`。未配置 API Key、字幕识别失败、AI 调用失败或结果校验失败时，`job.error` 和 `episode.analyze_error` 中会记录失败原因；不存在降级到关键词规则的 fallback 路径。任务执行成功后会写入 `draft` 高光供审核发布。`use_response_format=false` 时不会向模型接口发送 `response_format`，用于兼容豆包等不支持 JSON response mode 的 OpenAI-compatible 接口。

### `GET /api/analysis/queue`

AI 分析列表聚合接口。需要 `admin` 或 `uploader` Bearer token。`admin` 返回全部剧集，`uploader` 只返回自己名下剧集。前端 AI 分析列表必须优先使用该接口，不再自行拼接 `/api/dramas`、`/api/episodes` 和 `/api/system/jobs`。

查询参数：

- `status`: 可选，`all`、`pending`、`processing`、`success`、`failed`，默认 `all`
- `drama_id`: 可选，按短剧过滤
- `limit`: 可选，默认 200，最大 500

响应项：

```json
{
  "id": 1,
  "drama_id": 1,
  "owner_user_id": 2,
  "episode_no": 1,
  "title": "第 1 集",
  "video_url": "https://example.com/demo.mp4",
  "subtitle_url": "",
  "subtitle_content": "",
  "duration": 30,
  "analyze_status": "pending",
  "analyze_error": "",
  "draft_highlight_count": 1,
  "published_highlight_count": 0,
  "rejected_highlight_count": 0,
  "archived_highlight_count": 0,
  "drama_title": "逆光归来",
  "cover_url": "",
  "asset_status": "incomplete",
  "subtitle_ready": false,
  "latest_job": {
    "id": 10,
    "type": "ai_analyze",
    "status": "running",
    "progress": 42,
    "payload_json": "{\"episode_id\":1}",
    "error": "",
    "created_at": "2026-06-11T10:00:00",
    "updated_at": "2026-06-11T10:01:00"
  },
  "created_at": "2026-06-11T09:00:00",
  "updated_at": "2026-06-11T10:01:00"
}
```

## 系统任务 API

系统任务使用 RQ + Redis 执行，`job` / `job_log` 表保存后台可查询的业务状态与任务日志。当前已接入 `subtitle_asr` 和 `ai_analyze`：前者使用本地 faster-whisper 从视频音频识别字幕并写回剧集，后者基于字幕生成高光。`ocr_import` 作为后续任务类型预留。`verify_demo_chain` 不属于业务任务类型，演示链路验收继续通过 `backend/scripts/verify_demo_chain.py` 命令行脚本执行。

### `GET /api/system/jobs`

查询任务列表。需要 `admin` 或 `uploader` Bearer token。
`admin` 可查看全部任务；`uploader` 只查看 payload 中 `episode_id` 属于自己的任务。

查询参数：

- `status`: 可选，`pending`、`running`、`success`、`failed`、`canceled`
- `type`: 可选，当前可用 `subtitle_asr`、`ai_analyze`
- `limit`: 可选，默认 50，最大 200

响应 `data`：

```json
[
  {
    "id": 1,
    "type": "ai_analyze",
    "status": "running",
    "progress": 20,
    "payload_json": "{\"episode_id\":1,\"force_reanalyze\":false}",
    "rq_job_id": "rq-id",
    "started_at": "2026-05-28T10:00:00",
    "finished_at": null,
    "error": "",
    "created_at": "2026-05-28T09:59:58",
    "updated_at": "2026-05-28T10:00:00"
  }
]
```

### `POST /api/system/jobs`

创建并提交 RQ 任务。需要 `admin` 或 `uploader` Bearer token。
创建 `subtitle_asr` 或 `ai_analyze` 任务时，`admin` 可提交任意剧集，`uploader` 只能提交自己名下剧集。

```json
{
  "type": "ai_analyze",
  "payload": {
    "episode_id": 1,
    "force_reanalyze": false
  }
}
```

本地字幕识别任务：

```json
{
  "type": "subtitle_asr",
  "payload": {
    "episode_id": 1,
    "force": false
  }
}
```

规则：

- `episode_id` 必须存在。
- 创建任务只负责入队，不在请求线程内执行 AI 分析或字幕识别；创建 `ai_analyze` 成功后会立即把剧集 `analyze_status` 置为 `processing`。
- `subtitle_asr` 只支持服务端本地可访问的视频文件路径或 `/uploads/...` 视频；worker 使用 `ffmpeg` 抽取 16kHz 单声道音频，再用 faster-whisper 转写，生成 SRT 并写入 `episode.subtitle_content`、`episode.subtitle_url`、`episode.subtitle_original_name`，同时把 `asset_status` 更新为 `ready`。
- `subtitle_asr.payload.force=false` 时，如果剧集已有 `subtitle_content`，任务会直接成功并跳过覆盖；`force=true` 时会重新识别并覆盖字幕。
- `ai_analyze` worker 执行时会先检查字幕；缺字幕时尝试复用本地字幕识别链路，成功后继续高光识别，失败时把原始失败原因写入 `job.error` 和 `episode.analyze_error`。后续还会处理重复分析、AI 调用失败、非法 JSON、非法高光类型和时间范围错误。
- Redis/RQ 不可用时返回 `503`，并在 `job` 中记录失败状态。
- 当前仅实现 `subtitle_asr` 与 `ai_analyze`；其他任务类型返回 `400`。

### `GET /api/system/jobs/{job_id}`

查询单个任务。需要 `admin` 或 `uploader` Bearer token。

### `GET /api/system/jobs/{job_id}/logs`

查询任务日志。需要 `admin` 或 `uploader` Bearer token。

响应 `data`：

```json
[
  {
    "id": 1,
    "job_id": 1,
    "level": "info",
    "message": "AI analysis job started",
    "context_json": "{}",
    "created_at": "2026-05-28T10:00:00"
  }
]
```

### `POST /api/system/jobs/{job_id}/retry`

重试已结束任务。需要 `admin` 或 `uploader` Bearer token。

仅允许重试 `failed` 状态的任务；接口会创建新的 `job` 记录，不覆盖原任务。

### `POST /api/system/jobs/{job_id}/cancel`

取消等待中的任务。需要 `admin` 或 `uploader` Bearer token。

**只允许取消 `pending` 状态的任务。** `running` 状态的任务已交给 RQ worker 执行，无法从 HTTP 层安全终止，应等待其完成后重试或人工干预。

响应 `data` 为更新后的 `JobOut`。

### `GET /api/system/logs`

查询全局结构化异常日志（来自于 `system_log` 表，主要包含 `WARNING` 和 `ERROR` 记录）。需要 `admin` 或 `uploader` Bearer token。

查询参数：

- `level`: 可选，按日志级别过滤（如 `warning`, `error`）
- `request_id`: 可选，按请求 ID 追踪
- `user_id`: 可选，按用户追踪
- `limit`: 可选，默认 50，最大 200

响应 `data`：

```json
[
  {
    "id": 1,
    "request_id": "8409337d-5c15-4d18-9e48-360cdd1fb1f1",
    "user_id": "",
    "episode_id": "",
    "job_id": "",
    "level": "warning",
    "message": "HTTP Request Client Error",
    "error_stack": "",
    "context_json": "{\"event\": \"HTTP Request Client Error\", \"status_code\": 422}",
    "created_at": "2026-05-28T10:00:00"
  }
]
```

### `GET /api/system/settings`

读取系统设置。需要 `role=admin` 的 Bearer token。当前已接入 LLM 配置，后续 AI 分析任务会优先使用这里保存的配置。接口不会回显 `api_key` 明文，只返回 `api_key_configured`。

响应 `data`：

```json
{
  "settings": {
    "llm": {
      "enabled": true,
      "base_url": "https://api.openai.com/v1",
      "model": "gpt-4o-mini",
      "timeout_seconds": 90,
      "use_response_format": false,
      "api_key_configured": true
    }
  },
  "updated_at": null,
  "updated_by_user_id": null
}
```

### `PUT /api/system/settings`

保存系统设置。需要 `role=admin` 的 Bearer token。请求体：

```json
{
  "llm": {
    "enabled": true,
    "api_key": "sk-...",
    "clear_api_key": false,
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "timeout_seconds": 90,
    "use_response_format": false
  }
}
```

`api_key` 为空且 `clear_api_key=false` 时保留已保存密钥；`clear_api_key=true` 时清除已保存密钥。`use_response_format=true` 时后端会在 LLM 请求体中发送 `response_format={"type":"json_object"}`；不支持该参数的模型应设为 `false`。接口响应仍不回显密钥明文。旧的占位配置字段会返回 `422`。

### `GET /api/settings/prompt-template`

读取 AI 高光识别 Prompt 模板。需要 `role=admin` 的 Bearer token。该接口直接读取 `ai_service/prompt_template.md`，因此保存后会影响后续 LLM 分析任务。

响应 `data`：

```json
{
  "content": "# IgniteNow 高光识别 Prompt 模板\n..."
}
```

### `PUT /api/settings/prompt-template`

保存 AI 高光识别 Prompt 模板。需要 `role=admin` 的 Bearer token。请求体：

```json
{
  "content": "请输出 highlights，并包含 highlight_type 字段..."
}
```

`content` 长度为 20-20000 字符，并且必须包含 `highlights` 与 `highlight_type` 约束词，避免误保存完全不可用的模板。

### `GET /api/episodes/{episode_id}/highlights`

需要 `role=admin` 的 Bearer token。

返回后台审核用高光列表，包含 `reason`、`confidence`、`status`。

### `POST /api/episodes/{episode_id}/highlights`

手动新增高光点。需要 `role=admin` 的 Bearer token。

```json
{
  "start_time": 8,
  "end_time": 12,
  "highlight_type": "reversal",
  "emotion": "震惊",
  "intensity": 0.86,
  "confidence": 0.8,
  "trigger_score": 0.78,
  "reason": "剧情发生反转",
  "button_text": "反转了",
  "effect": "screen_flash",
  "status": "draft"
}
```

规则：时间必须合法，`highlight_type`、`effect`、`status` 必须符合枚举；新增 `published` 高光时不得与该集已发布高光时间段重叠。

### `PUT /api/highlights/{highlight_id}`

编辑高光点。需要 `role=admin` 的 Bearer token。

可编辑字段：`start_time`、`end_time`、`highlight_type`、`emotion`、`intensity`、`confidence`、`trigger_score`、`reason`、`button_text`、`effect`、`status`。

规则：编辑为 `published` 时不得与该集其他已发布高光时间段重叠。

### `DELETE /api/highlights/{highlight_id}`

归档高光点。需要 `role=admin` 的 Bearer token。该接口不物理删除数据，而是将 `status` 置为 `archived`，用于保留审核痕迹并避免播放端继续下发。

### `POST /api/episodes/{episode_id}/highlights/bulk-status`

批量更新该集高光状态。需要 `role=admin` 的 Bearer token。

```json
{
  "highlight_ids": [1, 2, 3],
  "status": "published"
}
```

`highlight_ids` 为 `null` 或缺省时更新该集全部高光。批量发布时会校验发布后时间段不重叠。

### `POST /api/episodes/{episode_id}/highlights/publish`

发布该集所有 `draft` 高光。需要 `role=admin` 的 Bearer token。

### `GET /api/analytics/overview`

基础看板。需要 `role=admin` 的 Bearer token。

返回字段：`drama_count`、`episode_count`、`highlight_count`、`published_highlight_count`、`interaction_count`、`click_count`、`ignore_count`、`avg_click_rate`。

### `GET /api/analytics/highlight-types`

高光类型分布。需要 `role=admin` 的 Bearer token。

### `GET /api/analytics/top-actions`

热门按钮点击排行。需要 `role=admin` 的 Bearer token。

### `GET /api/analytics/highlight-ranking?limit=20`

按点击数、曝光数和点击率返回已发布高光排行。需要 `role=admin` 的 Bearer token。

返回字段：`highlight_id`、`episode_id`、`start_time`、`end_time`、`highlight_type`、`button_text`、`status`、`impression_count`、`click_count`、`ignore_count`、`click_rate`。

### `GET /api/analytics/episodes/{episode_id}/timeline`

返回某集高光时间线及每条高光的曝光、点击、忽略和点击率。需要 `role=admin` 的 Bearer token。

### `GET /api/analytics/highlights/{highlight_id}`

返回单条高光的互动统计。需要 `role=admin` 的 Bearer token。

### `GET /api/analytics/trend`

按日期分组返回互动趋势数据。需要 `role=admin` 的 Bearer token。

查询参数：

- `from_date`: 可选，格式 `YYYY-MM-DD`，起始日期（含）；未传时默认最近 30 天
- `to_date`: 可选，格式 `YYYY-MM-DD`，结束日期（含）

响应 `data` 为数组，每项代表一天：

```json
[
  {
    "date": "2026-06-10",
    "impression": 120,
    "click": 45,
    "ignore": 30,
    "click_rate": 0.375
  }
]
```

## 发布中心 API

发布中心接口均需要 `role=admin` 的 Bearer token。第一版只支持 Android 渠道，播放端可见性仍由 `highlight_event.status=published` 控制，播放端接口不 join 发布单，也不下发发布单、审核人、失败原因等后台字段。

### `GET /api/publish/pending-items?status=all`

返回发布中心待发布内容列表。`status` 可选：`all`、`publishing`、`unpublished`、`failed`、`published`。

响应项：

```json
{
  "episode_id": 1,
  "drama_id": 1,
  "title": "她的逆袭人生 - 第 1 集",
  "drama_title": "她的逆袭人生",
  "episode_no": 1,
  "status": "unpublished",
  "updated_at": "2026-06-10T14:30:00",
  "draft_highlight_count": 2,
  "published_highlight_count": 1,
  "last_publish_job_id": 10,
  "last_publish_status": "failed",
  "last_publish_error": ""
}
```

### `POST /api/publish/jobs`

创建发布任务。第一版 `channel` 仅允许 `android`。`scheduled_at` 为空或小于等于当前时间时立即执行；未来时间只创建 `pending` 发布单，不提前发布给播放端。

```json
{
  "episode_ids": [1, 2],
  "channel": "android",
  "scheduled_at": null
}
```

立即执行逻辑：

1. 校验剧集存在。
2. 校验剧集至少有 `draft` 或 `published` 高光。
3. 将该剧集 `draft` 高光改为 `published`。
4. 复用已发布高光重叠校验。
5. 写入 `publish_job` 与 `publish_job_item` 状态。

响应 `data` 包含发布单摘要与条目：

```json
{
  "id": 1,
  "channel": "android",
  "status": "success",
  "scheduled_at": null,
  "created_by_user_id": 1,
  "error": "",
  "created_at": "2026-06-10T14:30:00",
  "updated_at": "2026-06-10T14:30:01",
  "item_count": 1,
  "success_count": 1,
  "failed_count": 0,
  "content": "第 1 集",
  "impressions": 0,
  "clicks": 0,
  "click_rate": 0,
  "items": [
    {
      "id": 1,
      "publish_job_id": 1,
      "episode_id": 1,
      "status": "success",
      "error": "",
      "published_highlight_count": 3,
      "created_at": "2026-06-10T14:30:00",
      "updated_at": "2026-06-10T14:30:01"
    }
  ]
}
```

### `POST /api/publish/jobs/one-click`

一键发布当前所有存在 `draft` 高光的剧集，等价于创建一个 Android 发布单。

### `GET /api/publish/jobs?limit=20`

返回最近发布记录与基础回流统计。响应项同 `POST /api/publish/jobs`，但 `items` 默认为空数组。

### `GET /api/publish/jobs/{job_id}`

返回单个发布单详情，包含 `items`。

### `POST /api/publish/jobs/{job_id}/retry`

重试失败发布单中的失败条目。

### `GET /api/publish/jobs/{job_id}/analytics`

发布单维度回流统计。需要 `role=admin` 的 Bearer token。

返回该发布单涵盖剧集的汇总及分集曝光、点击、忽略和点击率。时间范围为发布单创建时间之后的所有互动日志，隔离不同发布批次的回流数据。

响应 `data`：

```json
{
  "job_id": 1,
  "total": {
    "impressions": 200,
    "clicks": 80,
    "ignores": 40,
    "click_rate": 0.4
  },
  "by_episode": [
    {
      "episode_id": 1,
      "title": "第 1 集",
      "impressions": 120,
      "clicks": 50,
      "ignores": 25,
      "click_rate": 0.4167
    }
  ]
}
```

### `POST /api/publish/items/{episode_id}/config`

保存单集发布配置。第一版先作为配置接入点返回保存结果，后续可持久化定时、策略挂载、封面与简介检查。

```json
{
  "channel": "android",
  "scheduled_at": null,
  "strategy_tags": ["高光弹幕"],
  "cover_checked": true,
  "summary_checked": true
}
```

### `POST /api/demo/seed`

写入演示短剧、剧集和互动模板。需要 `role=admin` 的 Bearer token。

## Flutter 播放端 API

### `GET /api/player/dramas`

返回播放端可展示的短剧列表，只包含移动端入口页必要字段。

```json
{
  "success": true,
  "data": [
    {
      "drama_id": 1,
      "title": "逆光归来",
      "description": "演示短剧",
      "cover_url": ""
    }
  ]
}
```

### `GET /api/player/dramas/{drama_id}/episodes`

返回某部短剧下的剧集入口列表，不暴露字幕内容、AI 分析错误、后台审核字段。

```json
{
  "success": true,
  "data": [
    {
      "episode_id": 1,
      "drama_id": 1,
      "episode_no": 1,
      "title": "第 1 集 真相浮出水面",
      "duration": 30,
      "published_highlight_count": 3
    }
  ]
}
```

### `GET /api/player/episodes/{episode_id}`

播放端只返回已发布高光，不暴露 `reason`、`confidence`、`status`。

如果后台保存的 `episode.video_url` 是 `http(s)` 地址，则原样返回；如果是服务端本机存在的本地 MP4 路径，例如 `D:\byte\upload\videos\E007.mp4`，后端会转换为 `GET /api/player/episodes/{episode_id}/video`，避免浏览器直接加载本地路径被安全策略拒绝。

```json
{
  "success": true,
  "data": {
    "episode_id": 1,
    "title": "第 1 集",
    "video_url": "https://example.com/demo.mp4",
    "duration": 30,
    "highlights": [
      {
        "highlight_id": 1,
        "start_time": 8,
        "end_time": 12,
        "highlight_type": "reversal",
        "emotion": "震惊",
        "intensity": 0.86,
        "trigger_score": 0.78,
        "button_text": "反转了",
        "effect": "screen_flash"
      }
    ]
  }
}
```

### `GET /api/player/episodes/{episode_id}/video`

播放端本地视频代理接口。当 `episode.video_url` 指向服务端本机存在的 MP4 文件时，此接口以 `video/mp4` 返回文件内容。该接口不暴露原始本地文件路径。

### `POST /api/interactions`

匿名播放端继续使用 `anonymous_` 前缀的 `user_id`。`idempotency_key` 必须以 `{user_id}_{highlight_id}_{action_type}_` 开头，防止日志身份和幂等键不一致。非匿名 `user_id` 需要 Bearer token，且格式为 `user_{user_id}`。

记录播放端互动行为。重复 `idempotency_key` 直接返回成功，不重复写入。

```json
{
  "user_id": "anonymous_550e8400",
  "episode_id": 1,
  "highlight_id": 1,
  "action_type": "click",
  "action_value": "反转了",
  "watch_time": 9.5,
  "idempotency_key": "anonymous_550e8400_1_click_202605241230",
  "play_session_id": "session_1718027800000000"
}
```

`play_session_id` 为可选字段，由 Flutter 播放端每次进入播放页生成（`session_{microsecondsSinceEpoch}`），同一播放过程的所有 `impression`、`click`、`ignore` 共享同一值，用于会话级行为聚合分析。旧版客户端不传时后端自动置 `null`，不影响幂等校验。
