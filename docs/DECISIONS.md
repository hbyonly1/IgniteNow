# 技术决策记录

## 2026-06-10 后端与 Android 衔接方案确认

- AI 分析列表确定使用 `GET /api/analysis/queue` 聚合接口，后端统一返回 episode、drama、素材状态和最新任务信息；任务创建、重试、详情与日志仍由 `/api/system/jobs` 相关接口负责。
- 管理后台视频上传确定使用 `ffprobe` 自动解析视频元数据，部署环境必须包含 FFmpeg/ffprobe。
- `user_interaction_log` 后续增加 `play_session_id`，Android 每次进入播放页生成 UUID，并在 impression、click、ignore 回传中复用。
- 移动端内容上传链路确定删除，包括 `POST /api/uploads/episodes`、上传页面和入口；Android 只保留播放端 API 与互动回传 API。
- `verify_demo_chain` 从系统任务枚举删除，同名脚本继续作为命令行交付验收工具；`ocr_import` 暂保留为未实现的预留任务类型，不在 UI 暴露。
- AI 分析触发统一收口到异步任务：删除同步 `POST /api/episodes/{episode_id}/analyze`，管理后台和 uploader 只能通过 `POST /api/system/jobs` 创建 `ai_analyze` 任务，worker 负责实际分析、失败落库和任务日志。
- 2026-06-11 已落地 `GET /api/analysis/queue`，管理后台 AI 分析列表与详情页统一使用该聚合接口；任务创建、重跑、日志查看继续复用 `/api/system/jobs`。

## 2026-05-30 内容管理合并与剧集归属

- 将工作台中的“短剧管理”和“剧集配置”合并为一个“内容管理”入口，删除独立 `/workspace/episodes` 路由，避免运营人员在两个高度相关页面之间反复切换。
- 内容管理采用“顶部指标 + 搜索筛选 + 短剧大缩略图网格 + 剧集配置浮窗”的结构。顶部指标随页面滚动自然消失，不做 sticky；短剧卡片承载剧集数、待分析、分析失败、待审核和已发布摘要，便于快速定位需要处理的内容资产。
- 剧集配置不新开详情页，第一版在短剧卡片点击后打开大尺寸 Drawer。Drawer 内展示剧集表格，并在同一 Drawer 中切换新增/编辑表单；高光审核仍跳转到高光审核工作流。
- 为了实现 uploader 权限边界，在 `episode` 增加 `owner_user_id`。后台创建剧集和移动端上传剧集时写入当前账号；`admin` 可查看和操作全部内容，`uploader` 只能查看、配置、分析自己名下剧集。
- 工作台短剧接口为内容管理页返回聚合摘要字段，避免前端为每张短剧卡片逐集拼装高光状态；播放端接口保持不变，仍只下发 published 高光和移动端必要字段。

## 2026-05-30 AI 生产与审核发布页面职责

- 工作台页面按成熟内容运营流水线组织为“内容管理 -> AI 生产 -> 审核发布”。内容管理负责资产配置，AI 生产负责识别任务和失败重跑，审核发布负责按剧情上下文做高光质检。
- `AI 高光识别` 菜单改名为 `AI 生产`。列表页按剧集生产队列展示短剧、剧集、字幕状态、AI 状态、草稿高光、最近任务和失败原因；任务详情使用独立页面 `/workspace/analyze/jobs/:jobId`，避免把任务日志和生成摘要塞进轻量抽屉。
- `高光审核发布` 菜单改名为 `审核发布`。审核入口不再展示全局散高光列表，而是先展示短剧审核队列；短剧详情页 `/workspace/highlights/dramas/:dramaId` 再按“左剧集、中高光、右详情编辑”的质检台结构组织，保证审核人员结合短剧和剧集剧情判断。
- 后台任务页继续保留为系统运维视角，面向原始 RQ 任务和日志；演示主线优先讲 AI 生产页和审核发布页。

## 2026-06-10 发布中心页面职责调整

- 工作台主流程从“审核发布”进一步收敛为“发布中心”，强调发布编排、渠道配置、定时发布、上线状态和数据回流。
- 第一版发布中心先作为运营台 UI 草案展示，不替换现有后端高光审核接口契约；待发布内容、发布配置和最近发布记录先用前端演示数据承载页面验收。
- 后续如果重新接入真实发布链路，应在保留 `published` 高光下发隔离规则的前提下，补充发布单、渠道、定时任务和回流状态的后端模型与 API 契约。
- 前端工作台移除独立“后台任务”页面入口，避免演示主流程在 AI 分析、发布中心之外再暴露运维视角；后端 RQ 任务接口暂保留，继续支撑 AI 分析任务创建和状态查询。
- 工作台不再使用统一外层 Header，各业务页面自行提供页面内标题和操作区，保证内容管理、AI 分析、发布中心、系统设置等页面视觉结构一致。
- 发布中心真实化第一阶段新增 `publish_job` 与 `publish_job_item` 最小发布模型；`channel` 只允许 `android`，立即发布时将剧集 `draft` 高光改为 `published` 并写入发布单状态，未来时间只创建 `pending` 发布单。
- Android 播放端可见性继续只依赖 `drama.status=active` 与 `highlight_event.status=published`，不让播放端接口依赖发布单 join，避免破坏现有移动端字段隔离和播放链路稳定性。

## 2026-06-10 系统设置持久化范围

- 系统设置第一阶段保留 `system_setting` 通用表与 `/api/system/settings` 读写接口，但不暴露未接入真实运行逻辑的占位配置项。
- 已删除原 `ai`、`review`、`player`、`upload`、`security` 分组中的占位字段；后续新增系统设置前，必须先接入对应业务逻辑，再同步 API 契约、前端表单和表数据。
- 系统设置仅允许 `admin` 访问，`uploader` 不能读取或修改系统级配置，避免上传账号影响全局运行策略。

## 2026-06-11 阶段 2 内容资产字段补齐

- 内容资产真实化第一步先扩展 `drama` 与 `episode` 字段，不立即拆分类、演员等独立字典表，避免阶段 2 初期引入过多管理后台维护面。
- `drama.categories` 与 `drama.cast_tags` 在 API 中以数组暴露，数据库第一版分别用 `categories_json`、`cast_tags_json` 保存；后续如果需要统一分类管理，再升级为独立表和关联表。
- `episode.asset_status` 第一版用于承载后台上传与素材完整度状态，允许 `draft`、`ready`、`incomplete`；AI 分析聚合接口仍会在缺少视频或字幕时保守返回 `incomplete`。
- 后台视频上传第一版直接写入 `episode` 的 `duration`、`video_width`、`video_height`、`video_file_size` 和 `video_mime_type`，不单独新增 asset 表；这样能先满足内容管理和 AI 分析真实素材链路。
- 管理后台通用素材上传使用 `/api/admin/assets/files`，单集视频/字幕入库使用 `/api/dramas/{drama_id}/episodes/upload`；上传素材通过 `/uploads/...` 暴露静态可访问 URL，数据库仍保留服务端本地 path 以便播放代理和后续对象存储迁移；移动端上传接口不复用，后续按已确认方案单独下线。

## 2026-05-28 数据库引擎切换至 PostgreSQL

- 为了更好地支撑极高并发的互动回传（曝光、点击等日志），将项目主推的生产级关系型数据库由 MySQL 变更为 PostgreSQL。
- 考虑到当前项目在 `database.py` 中使用的是同步引擎 `create_engine`，为了保证最小侵入性和最大兼容性，选用 `psycopg2-binary` 同步驱动平替 `pymysql`。
- 采用容器化 PostgreSQL 时，为了解决初始化数据表的并发冲突（`app` 容器和 `worker` 容器同时执行建表脚本），强制收口建表权限：仅在 `docker-entrypoint.sh` 检测到启动命令为 `uvicorn` 时执行 `bootstrap_admin.py`。
- `docker-compose.yml` 引入标准的容器健康检查 (`healthcheck`) 机制解决数据库连接的冷启动时序问题。

## 2026-05-27 移动端单集上传

- 移动端上传采用独立 JWT 登录体系，先服务上传账号注册和登录；后续统一收口到工作台 Bearer JWT 权限模型。
- 上传链路先支持单集上传，不做整剧批量队列；视频文件保存到 `backend/uploads/videos/`，字幕文件保存到 `backend/uploads/subtitles/`。
- 数据库中的 `episode.video_url` 保存服务端本地文件路径，播放端继续复用 `/api/player/episodes/{episode_id}/video` 代理，避免客户端直接访问本地文件路径。
- 上传后只创建短剧和剧集记录，不自动触发 AI 分析；AI 识别、审核和发布仍由管理后台控制。

## 2026-05-26 后端优先级 1 完善

- 后端 API 按职责拆分为管理端、播放端、互动日志、统计分析和演示数据路由，保留 `/api` 统一前缀，避免单个路由文件继续膨胀。
- 高光新增、编辑、发布、批量状态变更统一复用后端高光校验服务；播放端仍只下发 `published` 高光，并继续隐藏 `reason`、`confidence`、`status` 等审核字段。
- 删除高光采用归档语义：`DELETE /api/highlights/{highlight_id}` 将状态置为 `archived`，不物理删除数据，便于保留审核记录和后续追踪。
- 发布高光时校验同一剧集内已发布高光时间段不重叠，避免播放端同一时间点触发多个互动浮层。
- analytics 暂采用实时 SQL 聚合实现，满足 MVP 演示和验收；数据量增长后再升级为定时聚合或缓存。
- 生产化基础能力优先补接口级测试，暂不引入完整权限系统、Alembic 和日志平台；MVP 当前最需要锁定播放端字段隔离、互动幂等、分析异常和审核状态规则。

## 2026-05-24 P0 闭环实现

- 后端采用 FastAPI + SQLAlchemy，默认 `sqlite:///./ignitenow.db`，同时保留 MySQL `DATABASE_URL` 配置，方便本地快速演示和后续迁移。
- AI 高光识别 MVP 默认走本地关键词 fallback，不依赖 LLM Key；Prompt 模板和 JSON Schema 已保留给后续 LLM 接入。
- 管理后台接口在 MVP 初期采用固定后台密钥做基础鉴权，完整登录权限放到 P2。
- 播放端接口只返回 `published` 高光，并隐藏 `reason`、`confidence`、`status` 等后台审核字段。
- 用户互动日志使用 `idempotency_key` 唯一约束，重复请求返回成功但不重复写入。
- Flutter 目录以当前仓库实际 `mobile/` 为准，不新建 `mobile_flutter/`。

## 2026-05-24 大语言模型 (LLM) 接入

- AI 高光识别采用兼容 OpenAI 规范的泛化调用，配置通过 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_TIMEOUT_SECONDS` 管理。
- 默认模型使用 `gpt-4o-mini`，默认请求地址为 `https://api.openai.com/v1`，优先保证通用性，也可任意指向 DeepSeek 等其他兼容平台。
- 大模型调用必须输出符合 `docs/HIGHLIGHT_SCHEMA.json` 的 JSON；后端仍会进行枚举、时间范围、分数范围校验，不直接信任 LLM 输出。
- 无 key 或大模型调用异常时自动回退到本地关键词规则，避免演示链路被外部服务阻塞。
- API Key 不进入仓库，只通过环境变量或本地未提交配置注入。

## 2026-05-24 播放端内容入口

- 移动端不直接复用后台 `GET /api/dramas` / `GET /api/episodes` 作为入口，新增 `GET /api/player/dramas` 和 `GET /api/player/dramas/{drama_id}/episodes`。
- 播放端入口接口只返回短剧和剧集展示所需字段，不下发字幕正文、AI 分析错误、审核状态等后台字段。
- Flutter 首页从数据库驱动的短剧/剧集列表进入播放页，保留 `GET /api/player/episodes/{episode_id}` 作为播放详情接口。

## 2026-05-24 本地视频播放代理

- 浏览器不能直接播放数据库中的 Windows 本地文件路径，例如 `D:\byte\upload\videos\E007.mp4`，会被 URL safety check 拒绝。
- 播放端详情接口在遇到服务端本机存在的本地视频文件时，返回 `/api/player/episodes/{episode_id}/video`，由 FastAPI 以 HTTP 方式代理 MP4 文件。
- 远程 `http(s)` 视频 URL 保持原样返回；不存在或格式不支持的路径仍由播放端显示错误提示。

## 2026-05-24 OCR 字幕导入

- 视频 OCR 输出统一先清洗为 SRT 格式再写入 `episode.subtitle_content`，避免 AI 分析服务直接依赖 OCR 原始块格式。
- OCR 导入按文件名中的 `E001`、`E002` 等编号匹配 `episode.episode_no`，当前主短剧使用 `drama_id=2`。
- 清洗策略只做保守处理：过滤明显噪声行、去掉同一时间块内重复行、跳过相邻重复块；不尝试自动修正剧情语义，避免误改字幕内容。
- OCR 字幕可能存在识别错误，因此批量 AI 分析结果默认保持 `draft` 状态，必须经管理后台审核后再发布到 Flutter 播放端。

## 2026-05-24 Flutter API 地址

- Flutter 播放端默认后端地址按运行平台区分：Web 使用 `http://localhost:8000`，Android 模拟器使用 `http://10.0.2.2:8000`。
- `API_BASE_URL` 仍作为最高优先级配置，可通过 `flutter run --dart-define=API_BASE_URL=...` 覆盖默认地址，方便真机或局域网演示。
## 2026-05-27 后端权限收口

- 后台管理接口从固定后台密钥扩展为 Bearer JWT 鉴权，允许 `role=admin` 的账号访问管理能力。
- 管理后台账号密码登录复用现有 `/api/auth/login`、`/api/auth/me` 和 `/api/auth/logout`，不另起一套 `/api/admin/auth/*`，避免移动端上传账号与后台账号出现两套重复认证服务。
- JWT access token 第一版不做 refresh token；默认有效期调整为 120 分钟，并在登录响应中返回 `expires_in` 和嵌套 `user`，同时保留原有扁平字段兼容当前移动端上传代码。
- `POST /api/auth/logout` 作为前端接入占位接口，不维护服务端 token 黑名单；退出登录的实际动作是前端清除本地保存的 access token。
- 公开注册接口只创建 `uploader` 账号；管理员账号或其他后台托管账号只能通过已鉴权的 `POST /api/auth/admin/users` 创建，防止用户自助注册成管理员。
- 后台审核读取接口 `GET /api/dramas`、`GET /api/episodes`、`GET /api/episodes/{episode_id}/highlights` 统一纳入后台鉴权，避免审核字段在未授权状态下暴露。
- 播放端仍保持匿名观看和匿名互动，不强制登录；后端新增 `idempotency_key` 与 `user_id/highlight_id/action_type` 的一致性校验，非匿名 `user_id` 必须携带匹配的 Bearer token。

## 2026-05-27 dev/frontend 合并

- 将远端 `feature/frontend` 合入 `dev` 时，保留 `dev` 现有后端、AI 服务、移动端、数据库和测试实现，仅替换管理后台前端为新的 Vite + React + Ant Design + React Router 工作台结构。
- 管理后台前端入口统一为 JSX 版本：`frontend/admin_web/src/main.jsx`、`src/App.jsx` 和 `vite.config.js`；旧的 TypeScript 单文件管理台入口与 `X-Admin-Token` API client 已移除，避免两套前端入口并存。
- `/login` 不再写入开发占位 token，改为调用后端现有 `POST /api/auth/login`。
- 前端统一 Axios client 放在 `frontend/admin_web/src/services/apiClient.js`，请求自动携带 `Authorization: Bearer <access_token>`，收到 `401/403` 时清理本地登录态并跳转 `/login`。

## 2026-05-27 工作台权限与路由收口

- 旧 MVP 固定后台密钥方案移除，后台和工作台接口统一使用 `Authorization: Bearer <access_token>`。
- 后端权限从单一 `require_admin` 扩展为基于角色的依赖：`admin` 和 `uploader` 都可登录工作台，接口按能力授权。
- `admin` 可访问全部内容管理、AI 分析、高光审核发布、analytics 和账号托管；`uploader` 只能访问自己名下剧集的内容管理、上传接口和 AI 分析，不能审核发布或查看综合数据。
- 前端路由从 `/admin/*` 改为中性的 `/workspace/*`；旧 `/admin/*` 仅保留重定向到 `/workspace`，避免 uploader “进入 admin 后台”的语义错位。
- 工作台侧边栏按登录用户 `role` 过滤菜单，手动输入无权限路由时重定向到该角色默认页面。
- 删除固定后台密钥后，首次管理员通过 `python backend/scripts/bootstrap_admin.py` 创建；脚本仅在不存在管理员时生成一次随机密码，不会覆盖已有管理员。

## 2026-05-28 RQ 后台任务

- 后台任务采用 RQ + Redis，不在 FastAPI 请求线程里执行耗时任务；`REDIS_URL` 和 `RQ_QUEUE_NAME` 通过环境变量配置。
- 数据库新增 `job` 和 `job_log` 作为业务状态镜像，后台页面只读数据库状态和日志，不直接依赖 Redis 队列内部结构。
- 第一版先接入 `ai_analyze` 任务；原同步 `POST /api/episodes/{episode_id}/analyze` 已在 2026-06-10 后续决策中删除，后台任务页通过 `POST /api/system/jobs` 创建异步任务。
- 当时将 `ocr_import` 和 `verify_demo_chain` 作为任务类型预留，未实现执行器；`verify_demo_chain` 已在 2026-06-10 后续决策中从系统任务枚举删除，命令行验收脚本仍保留。
- `bootstrap_admin.py` 仍保留 CLI 冷启动方式，因为创建第一个管理员发生在无法登录后台之前，不适合作为需要登录的后台任务。

## 2026-05-28 结构化系统日志

- 引入 `structlog` 替换标准 `logging`，提供企业级全局 JSON 结构化日志。
- 为了保证高并发下数据库的 I/O 性能，确立“分级落盘机制”：所有请求流水（INFO）仅写入 Docker 标准输出和本地文件映射；只有发生客户端错误（WARNING）或系统异常崩溃（ERROR）时，才会将包含完整 JSON Context 和异常堆栈的记录同步写入 PostgreSQL 的 `system_log` 表。
- 每个请求在中间件中分配全局唯一 `request_id`，打通 HTTP 请求、报错日志和数据库之间的可观测链路。
