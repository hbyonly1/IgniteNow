# 开发进度

## 2026-06-11 AI 分析功能完善计划执行

### 已完成
- 后端接入本地字幕识别任务 `subtitle_asr`：复用现有 `/api/system/jobs` + RQ worker 机制，worker 通过 `ffmpeg` 从本地视频抽取 16kHz 单声道音频，再调用 faster-whisper 转写字幕。
- 新增 `backend/app/services/subtitle_asr_service.py`，支持把识别段落转换为 SRT，写入 `episode.subtitle_content`、生成字幕文件路径并更新 `subtitle_url`、`subtitle_original_name` 和 `asset_status=ready`；已有字幕时默认跳过，`payload.force=true` 可强制覆盖。
- 新增 Whisper 运行配置环境变量 `WHISPER_MODEL`、`WHISPER_DEVICE`、`WHISPER_COMPUTE_TYPE`、`WHISPER_LANGUAGE`，Docker 运行镜像补充 faster-whisper 依赖和 `libgomp1`。
- 修复 Docker Compose 容器内数据库连接地址：`app` 和 `worker` 在 compose 层显式覆盖 `DATABASE_URL` 为 `postgres` 服务名，避免 `.env` 使用 `localhost` 时容器错误连接自身；同步校正 `.env.example` 的 Docker Compose 示例地址。
- 对照 `docs/implementation_plan.md` 确认复选框级联问题已修复：AI 分析表格 `rowSelection.checkStrictly=true`，短剧父行与子剧集勾选互不级联。
- 确认字幕预处理已接入：AI 分析前先使用 `ai_service.subtitle_parser.parse_subtitle_text` 将 SRT 字幕解析为结构化时间段，再格式化为 `[start - end] text` 形式传给分析器，解析失败时保留原始文本兜底。
- AI 分析页新增高光审核详情弹窗：点击剧集行“高光审核”后加载 `GET /api/episodes/{id}/highlights`，展示顶部剧集信息、左侧视频占位与时间轴高光点、选中高光编辑区、右侧高光列表筛选和底部统计。
- 高光审核弹窗支持通过、拒绝与批量提交待审核结果；底部“保存所有修改”会一次性提交所有已编辑高光，保存使用 `PUT /api/highlights/{id}`，批量提交使用 `POST /api/episodes/{id}/highlights/bulk-status`。
- 高光审核弹窗移除旧“新增模式/取消新增”流程，编辑区右侧改为蓝色 `+` 按钮；点击后按当前视频播放时间直接创建 1 秒人工高光，并立即加入右侧列表、时间轴和选中编辑状态。
- 高光审核弹窗不再进入时默认选中第一条高光；用户需要点击时间轴/列表项后才进入编辑状态，置信度改为可编辑字段，并跟随底部“保存所有修改”统一提交。
- 高光审核弹窗布局改为第一行“视频预览 + 编辑高光”，第二行整行展示高光列表，避免右侧列表纵向空间不足导致内容显示不全。
- 高光审核弹窗继续收紧列表区域：列表表格使用固定布局与独立纵向滚动，操作列改为“修改、通过、拒绝”，通过/拒绝使用绿色对勾和红色叉号 icon 按钮，避免按钮文字把操作列撑出容器。
- AI 分析主表格操作列增加固定宽度和按钮组收纳约束，避免“重新分析 / 高光审核 / 一键分析全剧”在右侧被裁切。
- 编辑高光空状态提示改为在编辑面板中部展示，避免提示贴在顶部造成误读。
- 高光审核弹窗重构为剪辑台式布局：左侧为视频播放和多轨道高光时间轴，右侧上方为区间编辑，右侧下方为区间列表。
- 多轨道时间轴按冲突、反转、心动、爆点、人工添加分轨展示区间，带竖向播放进度线、时间刻度、颜色区分和高光强度波形。
- 高光区间支持前端草稿编辑：从当前时间创建 1 秒区间、拖动整体移动、拖左右边缘调整始末、拆分、合并相邻同轨道区间、删除、撤销和重做；保存前不直接落库，底部“保存所有修改”统一提交新增、编辑和归档删除。
- 高光审核弹窗改为真正全屏模式，覆盖 Ant Modal 默认居中宽度、圆角和高度限制；视频区域限制最大高度，轨道编辑器占用左侧剩余空间，避免轨道被挤到不可见区域。
- 高光审核弹窗标题改为“高光播放编辑器”，说明文案与标题同行展示；内容区域恢复纵向滚动，避免全屏后小视口下底部内容不可达。
- 高光审核简介卡移动到左侧视频模块上方，并压缩封面、字号、间距和整体高度，减少对剪辑区域的挤占。
- 高光多轨道编辑器删除底部模拟音量波形，仅保留轨道、播放线、刻度和图例，给轨道编辑区域释放纵向空间。
- 高光多轨道编辑器已抽离到 `frontend/admin_web/src/components/HighlightTimelineEditor.jsx`，轨道分类工具抽离到 `frontend/admin_web/src/components/highlightTimelineUtils.js`，后续如引入第三方时间线库可在组件内部替换。
- 高光多轨道编辑器新增横向时间尺度缩放、轨道区域横向滚动和点击轨道定位播放时间；弹窗底部统计与保存按钮改为随内容自然滚动到底部，避免打开时贴在视窗底部造成误判。
- 高光审核简介卡继续压缩列间距和完成时间区域，允许分析完成时间自动换行，避免长日期在右侧溢出。
- 高光多轨道编辑器修正首尾刻度文本溢出；区间编辑区固定为紧凑高度，右下区间列表获得稳定滚动区域，避免选中高光后面板高度抖动并挤压列表。
- 高光审核右侧面板继续修复滚动细节：区间编辑卡片支持内部纵向滚动，区间列表表格 body 取消固定高度并填满容器剩余空间。
- 高光审核区间编辑恢复单条保存按钮；区间列表改为与 AI 分析主表格一致的多选表格形态，批量通过/拒绝操作移到列表标题行右侧，行内操作列已移除，筛选控件高度统一。
- AI 分析剧集行在“高光审核”右侧新增“字幕识别”入口；新增字幕识别结果弹窗，接入 `subtitle_asr` 异步任务，可提交识别、覆盖已有字幕、查看任务状态/日志，并展示写回后的 SRT 字幕内容；弹窗结构已调整为内容管理编辑信息同款 header/body/footer 样式。
- 已联网检索 React 多轨时间线编辑器方向，当前未引入第三方依赖：现有公开包未确认能稳定覆盖本项目 React 19 + Ant Design + 高光审核草稿保存链路，先保留可控的本地组件实现。
- 高光审核弹窗的右上角关闭、遮罩关闭和底部取消统一接入未保存修改提醒，存在已编辑未保存高光时会先确认是否放弃修改。
- 修复上传/审核 Modal 的按钮基础样式根因：移除 `.upload-drama-modal` 通用控件选择器里对 `.ant-btn` 的白底强制覆盖，避免 primary 按钮未悬停时被刷成白色。
- 系统设置页新增 AI 识别 Prompt 编辑器；后端新增 `GET/PUT /api/settings/prompt-template`，直接读写 `ai_service/prompt_template.md`，保存后影响后续 LLM 分析任务。
- 系统设置页新增 LLM 运行配置：支持保存启用状态、API Key、Base URL、模型和超时时间；后端 AI 分析任务优先读取 `system_setting.llm`，再回退到环境变量，API Key 不会通过读取接口明文回显。
- LLM 请求体新增可配置 JSON 响应模式开关 `use_response_format`，默认关闭；系统设置页在 AI 识别 Prompt 上方提供开关，关闭时不再发送 `response_format={"type":"json_object"}`，兼容豆包 Seed 等不支持该参数的模型。
- 修复发布任务失败状态处理：发布中心现在会读取发布单返回的 `status`、`failed_count`、`error` 和失败条目错误并直接提示业务失败原因；后端发布执行改为先校验高光时间段重叠，再把 `draft` 高光改为 `published`，避免失败发布单污染高光状态。
- 高光特效字段完成跨端收口：后端、AI 服务、管理后台、种子数据和 App 播放端统一使用 Android 已有 20 个 2D 特效资源 key；旧 `anger_bar`、`screen_flash`、`heart_rain`、`boom_effect`、`countdown` 不再兼容。
- 管理后台高光审核编辑区新增“触发特效”选择，新增、拆分、保存单条和保存全部都会显式提交 App effect key；发布后播放端接口仍只返回 `published` 高光，App 使用返回的 `effect` 直接触发本地 GIF/WAV 资源。
- 修复 `mobile/lib/pages/player_page.dart` 中的 merge conflict，保留进入播放页生成 `play_session_id` 并随互动日志回传的逻辑。
- 修复本地字幕识别模型缓存权限问题：Docker app/worker 显式设置 `HOME=/app`、`XDG_CACHE_HOME`、`HF_HOME` 和 `WHISPER_DOWNLOAD_ROOT` 到可写的 `backend/model_cache`，并让 `WhisperModel` 使用配置化下载目录，避免 faster-whisper 在 `HOME=/nonexistent` 环境下报权限错误。
- 将本地字幕识别默认模型从 `small` 调整为最小的 `tiny`，优先降低首次模型下载体积和 CPU 识别耗时；需要更高准确率时仍可通过 `WHISPER_MODEL` 环境变量改回 `small` 或更大模型。
- AI 分析任务升级为完整流水线：创建 `ai_analyze` 成功入队后立即把剧集状态置为 `processing`；worker 执行时如果缺字幕，会先调用本地字幕识别写回 SRT，再继续 LLM 高光识别，失败原因同步写入 `job.error` 与 `episode.analyze_error`。
- AI 分析页批量分析、批量重试、一键分析全剧改为逐项提交并收集结果；前端失败提示直接弹出后端返回的原始错误，不再包装成“批量提交失败”等泛化文案，失败状态标签悬停可查看 `analyze_error` / `latest_job.error`。

### 已验证
- `python -m pytest tests/test_subtitle_asr.py tests/test_jobs.py --basetemp .codex-pytest-tmp` 覆盖字幕识别服务写回 SRT、已有字幕跳过和 `subtitle_asr` 任务创建。
- `docker compose config` 渲染通过，确认 `app` 与 `worker` 的 `DATABASE_URL` 均为 `postgresql://...@postgres:5432/ignitenow`。
- `LOG_DIR=backend/logs python -m pytest tests/test_system_settings.py tests/test_analysis.py --basetemp .codex-pytest-tmp` 通过，覆盖 LLM 设置保存、密钥不回显和 AI 分析配置透传。
- `python -m pytest tests/test_llm_client.py tests/test_system_settings.py --basetemp .codex-pytest-tmp-llm` 通过，覆盖 `response_format` 默认不发送、开关开启后发送，以及系统设置保存。
- `npm exec eslint .` 在 `frontend/admin_web` 下通过。
- `npm run build` 在 `frontend/admin_web` 下通过；Vite 仍提示 Ant Design 单个 chunk 超过 500k，为既有体积提示。
- `git diff --check` 通过。
- `LOG_DIR=backend/logs .venv312/bin/python -m pytest tests/test_publish.py --basetemp .codex-pytest-tmp-publish` 通过，覆盖发布成功、失败、待发布列表与定时发布；新增用例确认重叠高光导致发布失败时草稿仍保持未发布。
- `LOG_DIR=backend/logs .venv312/bin/python -m pytest tests/test_subtitle_asr.py tests/test_jobs.py --basetemp .codex-pytest-tmp-asr` 通过，覆盖字幕识别任务创建、已有字幕跳过、SRT 写回和 Whisper 模型下载目录传参。
- `docker compose config` 通过，确认 app 与 worker 均注入可写模型缓存环境变量并挂载 `backend/model_cache`。
- `PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache .venv312/bin/python -m compileall backend/app` 通过。
- `LOG_DIR=backend/logs .venv312/bin/python -m pytest tests/test_analysis.py tests/test_jobs.py tests/test_analysis_queue.py --basetemp .codex-pytest-tmp-analysis-pipeline` 通过，覆盖任务入队置为分析中、缺字幕自动 ASR 后继续高光识别、失败原因写回和分析列表聚合。
- `.venv312/bin/python -m pytest tests/test_analysis.py tests/test_jobs.py tests/test_player_api.py tests/test_publish.py tests/test_llm_client.py --basetemp .codex-pytest-tmp-effect` 通过，覆盖 App effect key 校验、旧 effect 发布失败回滚、播放端 published 高光 effect 下发和 LLM 输出归一。
- `PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache .venv312/bin/python -m compileall backend/app ai_service` 通过。
- `npm exec eslint .` 与 `npm run build` 在 `frontend/admin_web` 下通过；Vite 仍提示 Ant Design 单个 chunk 超过 500k，为既有体积提示。
- `git diff --check` 与 `git diff --cached --check` 通过；`mobile/lib/pages/player_page.dart` 的 merge conflict 已解决并标记为 resolved。
- 当前环境未提供 `dart` / `flutter` 命令，无法执行 `dart format` 或 `flutter analyze`；已通过源码扫描确认移动端 conflict marker 与旧 effect 映射残留已清除。

## 2026-06-11 内容管理批量上传功能

### 已完成
- 将内容管理页面的「上传短剧」与「新增剧集」素材上传区重构，抽象并集成了全新的 `EpisodeBatchUploader` 组件，实现多视频和多字幕的拖拽批量上传、智能基于文件名提取集数序号配对。
- 完善前端多文件批量预览表格，支持用户手动从下拉列表中给无法识别序号的视频分配字幕，并提供删除配对项的行操作。
- 升级批量提交逻辑：`submitDrama` 与 `submitEpisodeAsset` 现支持循环上传解析出的多组有效素材。循环时如遇到单集失败，会记录异常并跳过，继续后续集数的上传；并在所有任务完成后显示“成功 X 集，失败 Y 集”的汇总通知。
- 配合批量提交，增加了直观的文字加进度条的精确提示控件 (`uploadProgress`)，告知目前正处于全部上传队列的进度情况。
- 修复了短剧与剧集删除功能，补充了缺失的 `Popconfirm` 删除按键与完整的重新加载动作调用。并在列表最右侧对齐调整了删除按钮的样式，使其拥有标准的红色边框和红色图标。
- 移除了上传界面“剧集”数量输入框不合理的默认值（不再默认为24），并与其它组件统一样式加上了灰色文字占位。
- 优化了新增剧集弹窗内部的布局逻辑，移除了多余的“剧集信息”和两列布局结构，让批量上传控件铺满整个水平空间，并将说明文案提至最上方标题下，AI 分析设置顺延排布于下方。
- 优化了 `EpisodeBatchUploader` 的拖拽交互：将之前分离的视频与字幕上传区合并成了一个宽大的、带有灰色虚线引导框的统一入口，大大增加了可识别的拖拽区域。用户现在可以把视频和字幕一揽子全选拖入，系统会自动根据扩展名和文件名进行分类和集数配对。
- 重构了短剧封面的交互与视觉（包括竖版与横版）：移除了生硬的底层附件列表，采用无缝的「沉浸式图片内嵌预览」结合「悬浮半透明遮罩与删除操作」。现在无论是在上传新封面还是打开已有的短剧信息，都会直接在框内全屏显示封面缩略图，大幅提升了 SaaS 界面的优雅感。
- 修复了因为 Ant Design 表单 Modal 开启 `destroyOnHidden` 带来的生命周期数据抹除 Bug：通过补全 `useEffect` 在组件完整挂载后再进行 `setFieldsValue` 回填，彻底解决了点击「编辑短剧」时由于挂载时机错位导致所有旧数据无法加载的严重问题。
- 统一了数据列表操作栏按钮的大小和视觉层级：放大并加粗了「编辑信息」与「管理剧集」的字号，去掉了删除按钮不统一的内联高度设置，现在所有按钮强制对齐为高度 32px 的标准组件尺寸，删除按钮采用标准的浅红底色、红框与大号红色 Icon。

### 已验证
- `npm run build` 在 `frontend/admin_web` 重新编译通过。
- `git diff --check` 语法检查通过。

### 遗留问题
- 后台上传采用逐一顺序执行循环，批量量过大时可能会导致请求时间极长，甚至受限于前端连接或超时策略；在长远规划中可考虑移入真实并发上传与后端离线上传处理中心。

## 2026-06-11 阶段 3：强化发布与移动端回流

### 已完成
- 删除移动端上传页面 `upload_episode_page.dart`、上传入口按钮（`main.dart`）和 `api_client.dart` 中的 `uploadEpisode` / `register` / `login` / `_multipartFile` 方法；播放端只保留播放和互动回传接口。
- 移动端新增 `play_session_id` 支持：`InteractionPayload` 增加可选 `playSessionId` 字段并序列化到 JSON；`AnonymousUserService` 新增 `generateSessionId()` 方法；`PlayerPage` 进入播放页时调用 `generateSessionId`，并随每次 `impression`/`click`/`ignore` 携带同一会话 ID 上报。
- 移动端新建 `interaction_queue.dart`：内存重试队列，互动日志网络失败时自动入队，每 10 秒重试一轮，最多重试 5 次，页面销毁时释放资源。`InteractionLogger` 改用队列发送；`PlayerPage.dispose` 同步释放 logger。
- 后端 `backend/app/jobs/tasks.py` 新增 `run_scheduled_publish()`：扫描 `publish_job.scheduled_at <= now` 且 `status=pending` 的定时发布单并执行，调用已有 `_execute_publish_job` 逻辑，每条发布单独立事务，失败不阻塞其他单。
- 后端 `main.py` 引入 FastAPI `lifespan` + asyncio 后台任务，每 60 秒通过 `asyncio.to_thread` 调用 `run_scheduled_publish`，服务关闭时取消任务。
- 发布中心前端增强：待发布表格新增「草稿高光」和「已发布高光」计数列（橙/绿高亮，零值灰色）；最近发布记录拆分「曝光」「点击」「点击率」三列展示真实数字；失败发布单新增「重试」按钮（调用 `/api/publish/jobs/{id}/retry`）。
- 修复创建短剧表单中的剧集数量 InputNumber 占位符问题：增加 "请输入剧集数量" placeholder，与邻近输入组件的灰色提示文字风格保持一致。

### 已验证
- `LOG_DIR=backend/logs .venv312/bin/python -m pytest tests --basetemp .codex-pytest-tmp` 通过，共 46 个测试。
- `PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache .venv312/bin/python -m compileall backend/app` 通过。
- `npm exec eslint .` 在 `frontend/admin_web` 下通过。
- `npm run build` 在 `frontend/admin_web` 下通过；Vite 仍提示 Ant Design 单个 chunk 超过 500k，为既有体积提示。
- `git diff --check` 通过。
- Flutter `analyze` 命令在当前环境不可用（flutter 未加入 PATH），Dart 源码改动为类型安全的可选字段新增和方法删除，无语法风险。

### 遗留问题
- `play_session_id` 目前已随互动日志上报至后端，后端 `user_interaction_log` 表尚无该字段存储；如需按会话聚合统计，应在后续阶段为表新增 `play_session_id` 列并同步 API 契约。
- 定时发布 worker 每分钟由 uvicorn 主进程 asyncio 调度，多实例部署场景下可能重复执行；生产环境建议迁移到独立 cron 或数据库锁机制。

## 2026-06-11 阶段 1 真实数据收口


### 已完成
- AI 分析页删除无真实任务时的 mock 行和 mock 任务详情数据；任务列表改为真实空状态，提供“新建分析任务”和“去内容管理”入口，任务详情页只加载 `/api/system/jobs/{job_id}` 真实数据。
- 新增 `GET /api/analysis/queue` 聚合接口，后端统一返回剧集、短剧、素材状态、高光计数和最新 AI 分析任务信息；`admin` 可查看全部，`uploader` 只查看自己名下剧集。
- AI 分析页列表、指标、素材选择弹窗和任务详情页改为读取 `/api/analysis/queue`，不再由前端自行拼接 `/api/dramas`、`/api/episodes` 与 `/api/system/jobs`。

### 已验证
- `python -m pytest tests/test_analysis_queue.py tests/test_analysis.py tests/test_auth_permissions.py --basetemp .codex-pytest-tmp` 通过，覆盖分析队列聚合、分析服务和权限边界。
- `npm exec eslint .` 在 `frontend/admin_web` 下通过。
- `npm run build` 在 `frontend/admin_web` 下通过；Vite 仍提示 Ant Design 单个 chunk 超过 500k，为既有体积提示。
- `git diff --check` 通过。

### 遗留问题
- `/api/analysis/queue` 当前通过解析 `job.payload_json.episode_id` 获取最新任务；后续如任务量增长，应考虑在 `job` 表增加结构化 `episode_id` 索引字段。

## 2026-06-10 内容管理列表样式调整

### 已完成
- 从系统 `JOB_TYPES` 删除 `verify_demo_chain`，保留 `backend/scripts/verify_demo_chain.py` 作为命令行验收脚本；同步确认分析聚合接口、ffprobe、`play_session_id` 和下线移动端上传链路的后续实施方案。
- 将管理后台内容管理页从顶部指标卡 + 短剧卡片网格调整为白底表格列表，保留并融合原有搜索、筛选、刷新和新建入口。
- 列表按截图方向展示封面、剧集名称、集数、状态、最后更新时间和操作按钮；点击行或更多按钮仍打开剧集配置 Drawer，管理员仍可编辑短剧。
- 移除内容管理页上方指标卡，并将工作台主背景、页头、侧栏和内容管理列表容器背景统一调整为白色。
- 修复内容管理页高度链路：`content-management`、`drama-list-panel` 和 Ant Table wrapper 均接入父级剩余高度，列表面板撑满 `workspace-content-plain`。
- 内容管理表格复用 AI 分析页的固定表格布局思路，补齐 Ant Table 全链路 100% 宽度；操作列从图标编辑按钮改为文字按钮“编辑信息”，并新增“管理剧集”入口。
- “管理剧集”入口接入内容管理二级工作台，按参考图生成短剧摘要、剧集表格和右侧选中剧集信息面板；剧集表格复用 AI 分析页同款固定宽度表格骨架，仅展示当前后端已有字段可支撑的状态。
- 按最新参考图继续收敛内容管理页：隐藏该页工作台顶部栏，改为页面内大标题；右侧只保留搜索框和“上传短剧”主按钮；状态与分页统一为矩形圆角，不使用胶囊样式。
- 将“上传短剧”弹窗从简单短剧表单升级为参考图方向的分区式创建面板，包含封面设置、基础信息、素材上传和 AI 分析设置；底部主操作改为“完成”，并统一主按钮 hover 强调色为蓝色。
- 继续统一上传短剧弹窗的白底表单风格：移除 Modal body 默认内边距，输入控件统一白底圆角矩形；基础信息和 AI 设置改为左标题右控件布局，修正剧集数量单位、默认发布状态选择框、上传框描述换行和开关圆点位置。
- 统一上传短剧弹窗中“所属分类”和“主演”标签输入控件的高度、内边距和 tag 间距，使两个自定义控件视觉一致。
- 删除上传短剧弹窗中的“默认发布状态”占位控件及其无用样式。
- 将管理后台 Ant Design 全局主题从黑色大圆角调整为蓝色主色、白底、矩形圆角风格；通过 `ConfigProvider` token 和 `base.css` 全局覆盖统一 Button、Input、InputNumber、Select、Upload、Tag 等基础组件，减少后续局部手动修补。
- 删除内容管理列表中的“更多”操作和对应剧集配置侧拉 Drawer 代码，列表操作区仅保留编辑短剧按钮；同步移除已无引用的 Drawer/剧集表单样式。
- 将 AI 分析页顶部改为与内容管理一致的页面内大标题、搜索框和主操作按钮；重做指标卡、状态筛选条、可选择任务表格、底部横向批量操作区，并将新建分析任务弹窗调整为与上传短剧弹窗一致的白底圆角矩形风格。
- AI 分析页删除底部“批量操作”说明栏，将“批量提交 / 批量取消 / 批量重试”放到表格上方右侧并置于刷新按钮左侧；状态分类收敛为“全部、未分析、分析中、已完成、失败”，同时移除旧底部栏占用的 52px 空白行，让表格延伸到页面底部。
- 优化新建分析任务弹窗的内容资产选择：删除“剧集选择与同步内容”演示控件，改为基于现有短剧/剧集接口的资产选择器，支持搜索、短剧筛选和“只看可分析”过滤；提交任务仍复用现有 `POST /api/system/jobs` 契约。
- 修复 AI 分析页任务表格布局：关闭 Ant Table 内置分页，改为与内容管理一致的底部固定分页栏；表格链路宽度改为 100%，任务列按百分比分配并启用固定表格布局，操作列右对齐，避免内容挤在左侧导致横向空间未填满。
- AI 分析页无真实任务数据时的 mock 行“查看详情”按钮改为可点击，并可进入 mock 任务详情页测试详情布局、生成摘要和任务日志。
- 将 AI 分析任务详情页重做为运营验收视图：顶部展示任务详情标题和操作按钮，下方依次展示内容信息、执行日志和识别结果预览；mock 任务详情提供完整演示数据用于页面测试。
- 删除 AI 分析表格筛选栏中的排序下拉功能；列表操作列新增独立圆形箭头重新分析按钮，并下调“查看详情”按钮字号。
- 将工作台“审核发布”入口调整为“发布中心”，页面改为发布运营台草案：顶部状态卡片复用 AI 分析页样式；待发布内容改为可多选表格，仅展示内容名称和修改配置入口；发布配置改为点击“修改配置”后弹出的配置面板；下方展示最近发布记录与回流。
- 删除工作台外层 Header 结构和对应样式，所有工作台页面统一使用页面内标题。
- 发布中心状态卡片删除“已定时”，待发布内容表格新增最后更新时间，操作区增加蓝色“发布”按钮。
- 发布中心发布配置只保留 Android 播放端渠道，发布时间从文本输入改为可选日期时间控件；待发布内容表格复用 AI 分析页的筛选条、表格骨架和分页样式，并按全部、发布中、未发布、失败分类筛选。
- 发布中心待发布内容表格在最后更新时间前新增状态列，筛选条左对齐且右侧保留刷新按钮和蓝色“一键发布”按钮；待发布内容区域固定为 500px，高度不随内容变化，内容增多时在表格内部上下滚动。
- 删除前端后台任务页面、路由和菜单入口；保留后端系统任务接口供 AI 分析等流程继续使用。
- 删除后端同步 AI 分析接口 `POST /api/episodes/{episode_id}/analyze` 和 `AnalyzeRequest` schema；AI 分析触发统一通过 `/api/system/jobs` 创建 `ai_analyze` 异步任务，测试同步改为覆盖任务创建和 worker 执行路径。
- 系统设置页补页面内标题，并将设置容器、表单行、按钮和输入控件调整为白底、8px 圆角、蓝色主色风格。
- 内容管理的剧集管理页删除标题说明；短剧摘要改为标题下方展示总集数、已发布、待分析、分析完成，并按黑/绿/黄区分数字；剧集表格删除视频状态、时长和操作列，保留“字幕状态/AI分析状态/发布状态”表头；右侧详情面板移除当前选中、取消选择和素材完整度里的视频素材项，并将快速操作移到右侧栏最上方。
- 继续收敛表格细节：压缩剧集表格表头上下内边距，修正短剧列表文字按钮尺寸。
- 修复发布中心待发布表格行宽持续增大的布局问题：取消百分比列宽，移除复用的 AI 表格 class，改为标题列自适应、状态/更新时间/操作固定宽度，并对 Ant Table 根 wrapper、内部 table 和单元格做宽度收缩约束，操作按钮组固定收纳在操作列内。
- 按 `BACKEND_MOBILE_INTEGRATION_PLAN.md` 阶段 1 开始推进真实数据接入：仪表盘替换占位页，接入 `/api/analytics/overview`、`/api/analytics/highlight-types`、`/api/analytics/top-actions` 和 `/api/analytics/highlight-ranking`，展示核心指标、类型分布、热门按钮和高光排行。
- 发布中心真实化第一阶段落地：新增 `publish_job`、`publish_job_item` 模型与 SQL 表，新增 `/api/publish/pending-items`、`/api/publish/jobs`、`/api/publish/jobs/one-click`、发布单详情、重试和配置保存接口；管理后台发布中心替换静态 mock 数据，单行发布、一键发布、最近发布记录均接真实接口。
- 系统设置真实读写第一阶段落地：新增 `system_setting` 模型与 SQL 表，新增 `/api/system/settings` 读写接口；系统设置页删除“接口未接入”占位提示，改为启动读取、保存落库、重新加载和恢复默认值。
- 删除系统设置中未接入真实运行逻辑的占位选项：后端默认设置与请求 schema 清空，`PUT /api/system/settings` 仅接受空对象，前端系统设置页改为“暂无已接入设置项”的空状态。
- 继续收敛前端运营页细节：仪表盘、AI 分析和发布中心指标卡删除灰色说明行；AI 分析空状态删除二次入口按钮；系统设置页保留原设置样式骨架，单个占位分类下提供底部右对齐“恢复默认 / 应用设置”操作；新建分析任务的资产搜索框修复内部边框断开问题。
- 阶段 2 内容资产真实化启动：补齐 `drama.wide_cover_url`、`drama.categories_json`、`drama.cast_tags_json`、`drama.updated_at`、`episode.asset_status` 和 `episode.updated_at`；`GET/POST/PUT /api/dramas` 以数组形式读写分类和主演标签，`GET/POST/PUT /api/episodes` 暴露并校验素材状态；内容管理上传短剧表单提交真实 `categories` / `cast_tags`，不再使用静态默认标签。
- 阶段 2 后台素材上传继续落地：新增 `episode.video_width`、`episode.video_height`、`episode.video_file_size`、`episode.video_mime_type`；新增 `/api/admin/assets/files` 支持封面/横版封面/图片/视频/字幕上传，视频通过 ffprobe 解析元数据，并通过 `/uploads` 静态路径返回可访问素材 URL；新增 `/api/dramas/{drama_id}/episodes/upload` 为指定短剧上传单集视频/字幕并创建真实 episode。
- 内容管理“上传短剧”弹窗接入真实上传链路：选择封面/横版封面后先上传素材并写入 `cover_url` / `wide_cover_url`，选择 MP4 后创建短剧并上传第 1 集，选择字幕则随视频创建 episode；开启“上传后立即开始分析”时会继续创建 `ai_analyze` 异步任务。原静态假文件 chip 已替换为真实已选择文件状态。
- 内容管理“剧集管理”页继续接真实操作：顶部“新增剧集”可上传 MP4/字幕创建新 episode 并可提交 AI 分析；右侧“替换视频”会上传新 MP4、解析元数据并更新当前 episode；“管理字幕”会上传字幕文件并写回 `subtitle_content` / `subtitle_url`。
- 真正删除后端同步分析路由处理函数，AI 分析继续只允许通过 `/api/system/jobs` 创建 `ai_analyze` 异步任务。
- 新增 `docs/BACKEND_MOBILE_INTEGRATION_PLAN.md`，基于当前前端页面、后端接口和 Flutter 播放端，整理后端后续开发、Android 衔接、前端增删改和测试补齐方案。

### 已验证
- `git diff --check` 通过。
- 使用系统 Python 配合 `PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache` 完成 `backend/app/routers/admin.py`、`backend/app/schemas.py`、`tests/test_analysis.py`、`tests/test_auth_permissions.py` 和 `tests/test_jobs.py` 语法编译。
- 尝试执行 `python3 -m pytest tests/test_analysis.py tests/test_auth_permissions.py tests/test_jobs.py`，当前系统 Python 缺少 `structlog`，测试在加载 `backend.app.main` 时中止，未进入用例执行。
- `npm exec eslint .` 在 `frontend/admin_web` 下通过。
- `npm run build` 在 `frontend/admin_web` 下通过；Vite 仍提示 Ant Design 单个 chunk 超过 500k，为既有体积提示。
- 本次仪表盘真实数据接入后，`npm exec eslint .`、`npm run build` 和 `git diff --check` 均通过。
- 本次发布中心真实化后，`LOG_DIR=backend/logs python -m pytest tests --basetemp .codex-pytest-tmp` 通过，共 35 个测试；`npm exec eslint .` 与 `npm run build` 在 `frontend/admin_web` 下通过。
- 本次系统设置真实读写接入后，`LOG_DIR=backend/logs python -m pytest tests --basetemp .codex-pytest-tmp` 通过，共 37 个测试；`python -m compileall backend/app`、`npm exec eslint .` 与 `npm run build` 在 `frontend/admin_web` 下通过。
- 本次系统设置占位项清理后，`PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache python3 -m compileall backend/app`、`npm exec eslint .`、`npm run build` 和 `git diff --check` 均通过；尝试执行 `LOG_DIR=backend/logs python3 -m pytest tests/test_system_settings.py --basetemp .codex-pytest-tmp` 时，当前系统 Python 缺少 `structlog`，测试在加载 `backend.app.main` 时中止，未进入用例执行。
- 本次前端运营页细节修复后，`npm exec eslint .`、`npm run build` 和 `git diff --check` 均通过。
- 本次阶段 2 内容资产字段补齐后，`PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache python3 -m compileall backend/app backend/scripts`、`npm exec eslint .`、`npm run build` 和 `git diff --check` 均通过；尝试执行 `LOG_DIR=backend/logs python3 -m pytest tests/test_content_assets.py tests/test_analysis_queue.py --basetemp .codex-pytest-tmp` 时，当前系统 Python 缺少 `structlog`，测试在加载 `backend.app.main` 时中止，未进入用例执行。
- 按用户要求创建 `.venv312` 并执行 `.venv312/bin/python -m pip install -r backend/requirements.txt` 后，后端依赖已补齐；`LOG_DIR=backend/logs .venv312/bin/python -m pytest tests --basetemp .codex-pytest-tmp` 通过，共 46 个测试；`PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache .venv312/bin/python -m compileall backend/app backend/scripts` 和 `git diff --check` 通过。
- 本次内容管理真实上传接入后，`LOG_DIR=backend/logs .venv312/bin/python -m pytest tests --basetemp .codex-pytest-tmp` 通过，共 46 个测试；`npm exec eslint .`、`npm run build` 和 `PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache .venv312/bin/python -m compileall backend/app backend/scripts` 均通过。
- 本次剧集管理操作接入后，`npm exec eslint .` 与 `npm run build` 在 `frontend/admin_web` 下通过。
- 本次 AI 分析页批量操作区调整后，`npm exec eslint .`、`npm run build` 和 `git diff --check` 均通过。
- 本次内容管理页高度修复后，`npm exec eslint .`、`npm run build` 和 `git diff --check` 均通过。
- 本次内容管理表格宽度和操作列调整后，`npm exec eslint .`、`npm run build` 和 `git diff --check` 均通过。
- 本次管理剧集二级工作台接入后，`npm exec eslint .`、`npm run build` 和 `git diff --check` 均通过。

### 遗留问题
- 已基于用户提供的 `http://127.0.0.1:5174` 截图继续定位表格未铺满问题；当前 Browser 插件未返回可用 `iab` 实例，未能直接完成浏览器截图复验。

## 2026-05-30 内容管理页面合并

### 已完成
- 删除独立 `/workspace/episodes` 前端路由和菜单入口，将“短剧管理”升级为对 `admin` 与 `uploader` 都开放的“内容管理”。
- 内容管理页面改为顶部指标、搜索筛选、短剧大缩略图网格；点击短剧卡片打开大尺寸 Drawer 管理该短剧下的剧集配置。
- 剧集 Drawer 支持新增/编辑剧集、查看视频/字幕/AI/高光状态、提交 AI 分析任务和强制重跑；`admin` 额外显示短剧创建/编辑和高光审核入口。
- 后端新增 `episode.owner_user_id`，移动端上传和工作台创建剧集都会记录当前账号；`admin` 可查看和操作全部剧集，`uploader` 只能查看、配置、分析自己名下剧集。
- `GET /api/dramas` 与 `GET /api/episodes` 返回内容管理所需的聚合摘要字段；`POST /api/system/jobs`、任务列表和任务日志对 uploader 按剧集归属过滤。
- 同步 `datebase/schema.sql`、`datebase/seed.sql`、`docs/API_CONTRACT.md` 和 `docs/DECISIONS.md`。

### 已验证
- `python -m compileall backend ai_service` 通过；本地 `backend/uploads/pytest-tmp` 目录因权限无法列出，但不影响代码编译。
- `npm run build` 在 `frontend/admin_web` 下通过；Vite 仍提示 Ant Design 单个 chunk 超过 500k，为既有体积提示。
- 使用 `LOG_DIR=backend/logs` 和 `--basetemp .codex-pytest-tmp/run` 执行 `python -m pytest tests` 通过，共 28 个测试。

### 遗留问题
- 当前仍未引入 Alembic 等正式迁移体系；开发阶段以更新后的 `datebase/schema.sql` 为准，旧本地数据库如缺少 `owner_user_id` 可删除重建或重新初始化。

## 2026-05-30 AI 生产与审核发布工作流

### 已完成
- 将工作台菜单中的 `AI 高光识别` 改为 `AI 生产`，页面从占位页升级为剧集生产队列，支持按短剧、AI 状态、字幕状态筛选。
- AI 生产页展示待识别、识别中、识别失败和草稿高光概览；剧集行展示字幕状态、AI 状态、草稿高光数、最近任务和失败原因，并支持单集识别、强制重跑和批量提交。
- 新增 AI 任务详情路由 `/workspace/analyze/jobs/:jobId`，展示任务状态、进度、关联短剧/剧集、任务 payload、生成摘要和任务日志。
- 将 `高光审核发布` 改为 `审核发布`，入口页按短剧审核队列组织，不再展示全局散高光。
- 新增短剧审核详情路由 `/workspace/highlights/dramas/:dramaId`，采用左侧剧集列表、中间高光列表、右侧高光详情编辑的质检台布局，支持保存、发布、驳回、归档和当前剧集批量发布/驳回。
- 内容管理中的“去审核”入口改为跳转到对应短剧审核详情，并携带当前剧集 ID。

### 已验证
- `npm run build` 在 `frontend/admin_web` 下通过；Vite 仍提示 Ant Design 单个 chunk 超过 500k，为既有体积提示。

### 遗留问题
- AI 任务详情页的生成摘要目前复用现有 `job.payload_json`、剧集高光计数和任务日志；如果后续要展示 provider、invalid_count、LLM 原始错误等更精细结果，应在 job 或独立 analysis_run 表中持久化分析结果摘要。

## 2026-05-30 系统设置 UI 草案

### 已完成
- 将 `/workspace/settings` 从空占位页改为系统设置 UI 草案，面向 `admin` 展示可讨论的配置项和交互形态。
- 设置页按 `AI 配置`、`审核规则`、`播放端`、`上传限制`、`安全` 五组组织，使用 Switch、Input、InputNumber 和 Select 表达真实配置控件。
- 保存按钮仅提示“设置保存接口尚未接入”，不伪造后端持久化能力；当前页面用于确认配置项是否需要进入后续实现。

### 已验证
- `npm exec eslint .` 通过。
- `npm run build` 在 `frontend/admin_web` 下通过；Vite 仍提示 Ant Design 单个 chunk 超过 500k，为既有体积提示。

### 遗留问题
- 系统设置尚未接入 `system_settings` 数据表或后端保存接口；后续确认配置项后再补真实读写和生效逻辑。

## 2026-05-30 Python 3.9 类型标注兼容

### 已完成
- 将后端运行路径和相关脚本中的 PEP 604 联合类型标注（例如 `datetime | None`、`HighlightCreate | dict`）替换为 Python 3.9 可解析的 `typing.Optional` / `typing.Union` 写法。
- 保持 API、数据库字段和业务逻辑不变，仅调整类型标注语法，修复 Python 3.9 启动 uvicorn 时导入模型失败的问题。
- 校正 `.env.example` 和 `README.md` 中 Docker Compose 示例数据库地址，使 `DATABASE_URL` 的用户名、密码和库名与下面的 `POSTGRES_*` 示例保持一致，并补充本机源码调试时改用 `localhost` / SQLite 的说明。
- 补充 README 源码启动流程中的 Redis 启动步骤，并提示源码直接运行时 `REDIS_URL` 应改为 `redis://localhost:6379/0`。
- 修复工作台后台任务页布局：移除 `JobsPage` 内重复嵌套的 `workspace-content` 容器，并为主内容、表格面板和 Ant Table wrapper 增加宽度收缩约束，避免 `workspace-table-panel` 未铺满且页面水平溢出。
- 在工作台菜单中新增 admin 专属“系统设置”页面入口，路径为 `/workspace/settings`，先接入占位页面，后续再对接真实系统配置接口。

### 已验证
- `python -m compileall backend ai_service` 通过；本地 `backend/uploads/pytest-tmp` 目录因权限无法列出，但不影响代码编译。
- 使用 `DATABASE_URL=sqlite:///./backend/ignitenow.db` 覆盖本机 Docker Compose 数据库配置后，`python -c "import backend.app.main"` 通过。
- `npm run build` 在 `frontend/admin_web` 下通过；Vite 仍提示 Ant Design 单个 chunk 超过 500k，为既有体积提示。

### 遗留问题
- 仓库 README 仍推荐 Python 3.12；Python 3.9 可通过本次语法兼容启动，但后续开发和 CI 仍应优先使用 README 记录的 3.12 环境。

## 2026-05-29 README 校正与补全

### 已完成
- 校正根目录 `README.md`，保留原有章节顺序和部署方式结构，补全脚本安装、Docker Compose、源码编译、访问地址、首次管理员账号和常用验证命令。
- 校正 `frontend/admin_web/README.md`，同步当前 `/workspace/*` 路由、JWT 登录、角色过滤、后台任务页接入状态和仍未完成的业务页面。
- 修正 `.env.example` 中 Docker Compose 默认 `REDIS_URL` 为 `redis://redis:6379/0`，本地源码调试时再改用 `redis://localhost:6379/0`。
- 将 Docker Compose 的主服务端口、PostgreSQL 端口、Redis 端口和 PostgreSQL 用户/密码/库名改为 `.env` 可配置，并同步 README 示例。
- 后端配置接入 `python-dotenv`，手动启动 `uvicorn`、worker 和 `bootstrap_admin.py` 时会自动读取仓库根目录 `.env`。

### 已验证
- 对照 `docker-compose.yml`、`Dockerfile`、`backend/scripts/docker-entrypoint.sh`、`backend/scripts/bootstrap_admin.py`、前端 `package.json` 和当前路由配置核对 README 命令与服务名。
- 使用 `rg` 检查根目录和前端 README 中的旧鉴权、旧路由、错误服务名和占位标题；使用 `git diff --check` 检查本次文档改动无空白错误。

### 遗留问题
- README 仅描述当前真实状态；自动创建管理员账号的环境开关尚未实现。

## 2026-05-28 数据库迁移与并发修复

### 已完成
- 将底层容器化数据库从 MySQL 切换为 PostgreSQL，在 `docker-compose.yml` 中使用 `postgres:15-alpine` 镜像并配置了专属持久化卷。
- 更新 Python 数据库驱动，移除 `pymysql` 并引入 `psycopg2-binary`，无缝对接现有 SQLAlchemy 通用模型层。
- 在 `docker-compose.yml` 中引入 `healthcheck`，确保应用容器和 Worker 容器在 PostgreSQL 完全就绪后再建立连接，杜绝了经典的 `Connection refused` 报错。
- 修复并发建表竞争导致 PostgreSQL 抛出 `UniqueViolation (duplicate key value violates unique constraint "pg_class_relname_nsp_index")` 异常的问题：修改 `docker-entrypoint.sh`，仅在主进程 `uvicorn` 启动时执行 `bootstrap_admin.py` 建表，`worker` 进程自动跳过。

### 已验证
- `docker compose down -v` 清除旧数据卷后执行 `docker compose up --build -d`，容器构建和启动完全正常，无互相抢占建表报错。
- `docker compose logs app | grep "admin password"` 成功捕获到了初始化管理员密码的输出。

## 2026-05-28 RQ 后台任务第一版

### 已完成
- 新增 RQ/Redis 配置：`REDIS_URL`、`RQ_QUEUE_NAME`，并在 `docker-compose.yml` 加入 Redis 服务。
- 新增 `job`、`job_log` SQLAlchemy 模型和 `datebase/schema.sql` 表结构，用数据库保存任务状态、进度、错误和任务日志。
- 抽出 AI 分析业务逻辑到 `backend/app/services/analysis_service.py`；原同步分析接口已于 2026-06-10 删除，当前由 RQ worker 调用同一实现。
- 新增 `/api/system/jobs`、`/api/system/jobs/{job_id}`、`/api/system/jobs/{job_id}/logs`、`/api/system/jobs/{job_id}/retry`，第一版支持创建和重试 `ai_analyze` RQ 任务。
- 新增 RQ worker 入口 `python -m backend.app.worker`。
- 管理后台新增 `/workspace/jobs` 页面，可提交 AI 分析任务、查看任务列表、查看任务日志和重试已结束任务。
- FastAPI 在检测到 `frontend/admin_web/dist` 存在时托管生产前端静态文件，保留本地 Vite 开发方式。
- 修复生产前端托管的 SPA 路由回退：`/login`、`/workspace/*` 等 React Router 路径在 FastAPI 静态托管下返回 `index.html`，缺失的真实静态资源仍返回 404。
- 修复 AI 高光入库缺省状态：AI 输出不包含 `status` 时默认按 `draft` 入库，避免分析任务成功但全部高光因缺少状态被判为非法。
- 同步 `docs/API_CONTRACT.md` 与 `docs/DECISIONS.md`。
- 新增根目录 `Dockerfile`，采用 Node 构建管理后台、Python 运行 FastAPI 的多阶段镜像；同一镜像可通过默认命令启动 Web/API，也可覆盖命令运行 RQ worker。
- 更新 `.dockerignore`，排除本地虚拟环境、依赖目录、测试和构建产物，减少 Docker build context。
- 更新 `README.md`，补充 Docker 镜像构建、运行 API/Web 和启动 RQ worker 的命令。

### 已验证
- `env PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache .venv312/bin/python -m compileall backend ai_service` 通过。
- `env PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache .venv312/bin/python -m pytest tests/test_jobs.py tests/test_analysis.py tests/test_auth_permissions.py tests/test_interactions.py tests/test_player_api.py tests/test_uploads.py` 通过，共 25 个测试；仍有既有 `datetime.utcnow` 弃用警告。
- `.venv312/bin/python` 冒烟导入 `backend.app.services.job_service` 与 `backend.app.jobs.tasks` 通过，确认 RQ 相关模块可加载。
- `npm exec eslint .` 通过。
- `npm run build` 通过，Vite 仍提示单个 JS chunk 超过 500k，为当前 Ant Design 单包构建的既有体积提示。
- Redis/RQ 端到端冒烟通过：使用临时 SQLite 数据库和 `ignitenow-verify` 队列，通过 `POST /api/system/jobs` 创建 `ai_analyze` 任务，Redis 队列计数为 1，`SimpleWorker` 消费后 `job.status=success`、`progress=100`，并生成 2 条 `draft` 高光和完整任务日志。
- `env PYTHONPYCACHEPREFIX=/private/tmp/ignitenow_pycache .venv312/bin/python -m pytest tests/test_static_frontend.py tests/test_jobs.py tests/test_analysis.py` 通过，共 10 个测试，覆盖 `/login` SPA fallback 和缺失静态资源 404。
- `docker build -t ignitenow-app:verify .` 通过；`docker run -d --rm --name ignitenow-app-verify -p 18080:8000 ignitenow-app:verify` 后验证 `/health` 返回 200、`/login` 返回 200 HTML、前端 CSS 静态资源返回 200。

### 遗留问题
- 当时 `ocr_import` 和 `verify_demo_chain` 仅预留任务类型、执行器尚未接入；`verify_demo_chain` 后续已从系统任务枚举删除。
- 统一系统日志、`system_settings` 和 `/workspace/settings` 尚未实现。
- 当前 RQ 第一版为单队列；服务重启时 running 任务需要依赖 RQ/worker 状态和后续补偿逻辑进一步收口。

## 2026-05-27

### 已完成
- 新增移动端上传账号体系：`user_account` 模型、注册和登录接口、JWT token 校验、上传接口 Bearer 鉴权。
- 新增移动端单集上传接口 `POST /api/uploads/episodes`，支持上传 MP4 视频、SRT/VTT/TXT 字幕文件或字幕文本，文件保存到 `backend/uploads/`，并创建或复用短剧后写入 `episode`。
- Flutter 播放端新增上传入口和 `UploadEpisodePage`，支持注册/登录、选择 MP4、选择字幕文件、填写字幕文本、上传成功后刷新剧集列表并可跳转播放页。
- 更新 `.env.example`、`datebase/schema.sql`、`docs/API_CONTRACT.md` 和 `docs/DECISIONS.md`，同步 JWT、上传接口和本地文件保存策略。

### 已验证
- `python -m pytest tests` 通过，共 12 个测试，新增覆盖未登录上传、登录上传入库、播放端可见、非 MP4 拦截、字幕文本入库。
- `python -m compileall backend ai_service` 通过。
- `python backend/scripts/verify_demo_chain.py --base-url http://127.0.0.1:8010 --skip-video-range` 通过，确认上传相关改动未破坏 E001-E007 演示链路。
- `npm run build` 通过，管理后台生产构建仍可用；Vite 仍提示 Ant Design chunk 超过 500k。
- `flutter pub get` 通过，新增 `file_picker` 依赖。
- `flutter analyze` 通过。

### 遗留问题
- 上传视频时长仍由用户填写，暂未自动解析 MP4 duration。
- 上传后不会自动触发 AI 分析，需要在管理后台点击识别并审核发布。

## 2026-05-26

### 已完成
- 按优先级 1 完成后端结构整理：将原集中式 API 拆分为 `admin`、`player`、`interactions`、`analytics`、`demo` 路由，并抽出通用鉴权、视频 URL 处理和高光校验服务。
- 补齐后台高光管理能力：支持手动新增高光、编辑高光、归档高光、批量更新状态，并在发布状态下校验同集高光时间段重叠。
- 强化 AI 分析入库保护：缺少字幕时明确置为 `failed`，非法高光项不会直接中断整集分析，响应中返回 `invalid_count`。
- 补齐管理统计接口：新增高光互动排行、剧集高光时间线、单条高光统计，便于后续后台看板继续扩展。
- 补齐生产化最小测试集：新增 `tests/test_player_api.py`、`tests/test_interactions.py`、`tests/test_analysis.py` 和内存 SQLite 测试夹具，覆盖播放端字段隔离、draft/rejected 不下发、互动幂等、后台鉴权、字幕缺失和高光校验。
- 将 Pydantic v2 schema 配置迁移到 `ConfigDict(from_attributes=True)`，减少测试和后续升级噪音。
- 管理后台接入新增审核和统计接口：高光审核页支持勾选后批量发布、驳回、归档；单条高光可打开统计抽屉；新增单集时间线看板和高光排行榜。
- 同步 `docs/API_CONTRACT.md`，记录新增高光管理接口、分析响应字段和 analytics 接口。
- 补齐演示数据状态：将 E006 的 6 条高光从 `draft` 发布为 `published`，恢复 E001-E007 共 54 条已发布高光的交付基线。

### 已验证
- `python -m compileall backend ai_service` 通过。
- `python -m pytest tests` 通过，共 8 个测试。
- `npm run build` 通过，管理后台生产包已重新生成；Vite 仍提示 Ant Design 相关 chunk 超过 500k，为既有体积提示。
- `python backend/scripts/verify_demo_chain.py --base-url http://127.0.0.1:8010` 通过，共 17 项检查：后端健康、E001-E007 播放端详情、7 个本地 MP4 Range 代理、播放端不泄露审核字段、管理 analytics 鉴权和新增统计接口。
- 管理端写接口冒烟通过：`POST /api/episodes/{episode_id}/highlights`、`PUT /api/highlights/{highlight_id}`、`POST /api/episodes/{episode_id}/highlights/bulk-status`、`DELETE /api/highlights/{highlight_id}`，测试高光已清理。

### 遗留问题
- 当前 analytics 仍是实时 SQL 聚合，适合 MVP 演示；数据量变大后应增加按剧集/日期的聚合表或缓存。
- 管理后台时间线目前使用轻量 CSS 视图，尚未引入 ECharts；后续如果要做热力图、趋势图和多维筛选，可再引入图表库并拆分 chunk。
- SQLAlchemy 模型仍使用 `datetime.utcnow` 默认值，在 Python 3.14 测试环境下会提示弃用警告；后续可统一迁移到 timezone-aware UTC 时间。

## 2026-05-25

### 已完成

- 新增只读演示链路验收脚本 `backend/scripts/verify_demo_chain.py`，用于检查后端健康状态、E001-E007 发布高光数量、播放端字段隔离、本地 MP4 Range 代理和后台 analytics 鉴权。
- 更新 README，补充演示链路验收命令，并将演示流程调整为当前数据库驱动的 E001-E007 剧集入口。
- 将 Flutter 播放端高光互动浮层停留时间从 3 秒延长到 4 秒；同步 `interaction_template.duration_ms` 默认值、种子 SQL 和当前 SQLite 模板数据为 `4000ms`。
- 进入交付物准备阶段：新增 `docs/DELIVERY_GUIDE.md`，整理 Web 演示包、截图、录屏脚本和 APK 打包要求；修正 README 中 Flutter 播放端目录和 Android 模拟器默认后端地址说明。
- 已构建管理后台生产包 `frontend/admin_web/dist` 和 Flutter Web 播放端生产包 `mobile/build/web`，并整理交付包到 `artifacts/delivery/`。
- 已补齐 Android SDK 后完成 APK 构建准备：将本地 `E:\gradle-8.12-all\gradle-8.12` 写入 Gradle wrapper 缓存，并在 Android Gradle 配置中增加阿里云 Maven 镜像源，保留官方源兜底。
- 已产出 Android release APK，并复制到 `artifacts/delivery/ignitenow-app-release.apk`。
- 新增交付启动脚本 `artifacts/delivery/start_demo.ps1` 和 `artifacts/delivery/stop_demo.ps1`，用于一键启动 / 停止后端、管理后台 Web 和 Flutter Web 播放端。

### 已验证

- `python backend/scripts/verify_demo_chain.py` 通过，共完成 17 项检查：E001-E007 播放端详情均返回 expected published 高光且不泄露 `reason`、`confidence`、`status`，7 个本地视频代理均返回 `206 video/mp4`，后台 analytics 带 token 正常、不带 token 返回 403。
- `python -m compileall backend ai_service`、`flutter analyze`、`flutter build web` 均通过；重新构建后的 Flutter Web 产物已确认高光浮层自动消失和 `ignore` 记录时间为 4 秒。
- `npm run build` 通过，产出管理后台 `dist`；Vite 仍提示 Ant Design chunk 大小超过 500k，仅为性能提示。
- `flutter build web --dart-define=API_BASE_URL=http://localhost:8000` 通过，产出 `mobile/build/web`。
- `flutter build apk --release --dart-define=API_BASE_URL=http://10.0.2.2:8000` 已产出 `mobile/build/app/outputs/flutter-apk/app-release.apk`，复制后的交付产物大小约 47.8MB。

## 2026-05-24

### 已完成

- 固化 P0 API 契约：短剧、剧集、AI 分析、高光审核发布、播放端下发、互动日志、基础统计。
- 固化高光 JSON Schema，限定 5 类高光、时间单位、分数范围和允许特效。
- 新增数据库建表和演示种子 SQL，包含核心表、索引和 `idempotency_key` 唯一约束。
- 新增 FastAPI 后端骨架和 P0 主链路接口。
- 新增 AI 服务字幕解析器和关键词 fallback 高光识别。
- 新增 React + Vite + Ant Design 管理后台最小闭环页面。
- 新增 Flutter 播放端模型、API client、匿名用户 ID、高光触发引擎、互动浮层、基础特效和日志回传。
- 更新 `.env.example`、`docker-compose.yml` 和 README 启动说明。
- 新增通用 LLM 高光识别接入配置，AI 服务可在有 `LLM_API_KEY` 时优先调用大模型，无 key 时继续使用 fallback。
- 新增播放端短剧/剧集入口接口，Flutter 首页可从数据库中的 `drama` / `episode` 数据进入播放页。
- 新增本地视频文件代理：数据库中的本地 MP4 路径会转换为播放端可访问的 HTTP 视频地址。
- 已将 `D:\byte\upload\videos\E001.mp4` 到 `E006.mp4` 导入当前 SQLite 数据库，归属到短剧 `那年冬至` 的第 1-6 集；保留已完成的 `E007.mp4` 第 7 集记录。
- `datebase/seed.sql` 已同步本地视频种子数据，重新初始化时可恢复 `那年冬至` 的 E001-E007 剧集配置。
- 新增 OCR 字幕导入脚本 `backend/scripts/import_ocr_subtitles.py`，可将 `D:\byte\upload\subtitles` 中的 `E001_ocr.txt` 到 `E007_ocr.txt` 清洗、去重并转换为 SRT 后写入 `episode.subtitle_content`。
- 已将 `那年冬至` E001-E007 的 OCR 字幕导入当前 SQLite 数据库，并触发大模型分析生成后台待审核的 `draft` 高光。
- 修复 Flutter Web 默认后端地址：浏览器端默认请求 `http://localhost:8000`，Android 模拟器仍默认请求 `http://10.0.2.2:8000`。
- 修正当前 SQLite 和 `datebase/seed.sql` 中 `那年冬至` E001-E007 的本地视频路径，从不存在的 `D:\upload\videos` 改为实际存在的 `D:\byte\upload\videos`。
- 已发布 `那年冬至` E001 的 8 条高光，并完成“播放端下发 published 高光 -> Flutter Web 播放触发浮层 -> 点击互动 -> 后端日志回传 -> analytics 更新”的闭环验证。
- 已发布 `那年冬至` E002-E007 的高光，并完成主短剧 E001-E007 整季播放端下发准备；当前发布数量为 E001/E002/E003/E004/E005/E007 各 8 条，E006 为 6 条。
- 修正当前 SQLite 和 `datebase/seed.sql` 中 `那年冬至` 第 7 集标题，从占位标题 `水水水` 改为 `E007`。
- 导出 `那年冬至` E001-E007 的高光审核清单到 `artifacts/highlight_audit_E001_E007.md` 和 `artifacts/highlight_audit_E001_E007.csv`，用于逐条核对时间点、按钮文案、类型、特效、原因和字幕片段。

### 已验证

- `python -m compileall backend ai_service` 通过。
- FastAPI TestClient 主链路通过：`/health`、`/api/demo/seed`、`/api/system/jobs` 创建 AI 分析任务、`/api/episodes/1/highlights/publish`、`/api/player/episodes/1`、`/api/interactions`、`/api/analytics/overview`。
- `npm install` 和 `npm run build` 通过；Vite 仅提示 Ant Design chunk 偏大，不影响运行。
- `flutter pub get` 通过。
- `flutter analyze` 通过，无静态分析问题。
- 大模型接入后验证：未配置 `LLM_API_KEY` 时，`ai_analyze` 异步任务由 worker 自动走 `fallback_rules` 并生成高光。
- 播放端入口接口验证：`GET /api/player/dramas`、`GET /api/player/dramas/1/episodes` 可返回数据库短剧和剧集数据。
- 本地视频代理验证：`D:\byte\upload\videos\E007.mp4` 存在时，`GET /api/player/episodes/3` 返回 `/video` 代理地址，`GET /api/player/episodes/3/video` 返回 MP4 文件。
- 本地视频批量验证：`GET /api/player/episodes/4..9` 均返回 `/video` 代理地址，`GET /api/player/episodes/{id}/video` 支持 `Range: bytes=0-1023` 并返回 `206 video/mp4`。
- OCR 字幕导入验证：E001-E007 清洗后分别得到 89、98、51、31、66、31、75 条可解析 SRT cue，`python -m compileall backend ai_service` 通过。
- 大模型 live 分析验证：E001-E005/E007 各生成 8 条 `draft` 高光，E006 生成 6 条 `draft` 高光；播放端接口暂不返回这些未发布高光。
- Flutter Web 地址验证：`flutter analyze` 和 `flutter build web` 通过；Playwright 访问 `http://localhost:62880` 时确认 `/api/player/dramas`、`/api/player/dramas/2/episodes`、`/api/player/dramas/1/episodes` 均从 `localhost:8000` 返回 200。
- Flutter Web 播放验证：`GET /api/player/episodes/4` 返回 `/video` 代理地址，`GET /api/player/episodes/4/video` 支持 `Range` 并返回 `206 video/mp4`；Playwright 点击 E001 后确认浏览器请求视频代理成功且无请求失败。
- E001 互动闭环验证：发布后 `GET /api/player/episodes/4` 下发 8 条高光且不暴露 `reason`、`confidence`、`status`；Playwright 跳转到首个高光时间点后触发浮层并点击按钮，`user_interaction_log` 新增 E001 的 `impression` 和 `click`，analytics 指标随之更新。
- 整季发布验证：`GET /api/player/dramas/2/episodes` 返回 E001-E007，发布高光数分别为 8、8、8、8、8、6、8；`GET /api/player/episodes/{id}` 对 E001-E007 均返回 `/video` 代理地址和 published 高光，且不暴露 `reason`、`confidence`、`status`。
- 整季视频代理验证：E001-E007 的 `GET /api/player/episodes/{id}/video` 均支持 `Range: bytes=0-1023` 并返回 `206 video/mp4`。
- E002 互动抽样验证：Playwright 打开 Flutter Web，进入 E002 播放页，跳转到首个高光时间点后触发浮层并点击按钮；`user_interaction_log` 新增 E002 首个高光的 `impression` 和 `click`，当前 `GET /api/analytics/overview` 返回 `highlight_count=60`、`published_highlight_count=54`、`interaction_count=46`、`click_count=7`、`avg_click_rate=0.28`。
- 高光审核清单验证：从 `backend/ignitenow.db` 导出 54 条 published 高光，按 E001-E007 分布为 8、8、8、8、8、6、8；Markdown 与 CSV 均为 UTF-8 内容，无 `\u` 字面量和问号占位。

### 遗留问题

- OCR 字幕来自视频画面识别，可能仍存在错字、漏字和重复语义；发布前需要在管理后台审核高光时间点和按钮文案。
- 演示短剧 `逆光归来` 仍使用公开演示 MP4；主短剧 `那年冬至` 已接入本地 MP4 资源。
- APK 打包、展示录屏和截图素材仍待完成。
## 2026-05-27 后端权限收口

### 已完成
- 新增后台账号托管接口 `POST /api/auth/admin/users`，公开注册仍只创建 `uploader`，后台可用 `role=admin` 的 Bearer JWT 访问管理接口。
- `require_admin` 支持 admin Bearer token 鉴权。
- 收口账号密码登录契约：`/api/auth/login` 和 `/api/auth/me` 响应新增 `expires_in` 与嵌套 `user`，默认 JWT 有效期调整为 120 分钟，并新增无 refresh token 版本的 `POST /api/auth/logout` 占位接口。
- `GET /api/dramas`、`GET /api/episodes`、`GET /api/episodes/{episode_id}/highlights` 已纳入后台鉴权，防止后台审核字段未授权暴露。
- `POST /api/interactions` 新增匿名身份与 `idempotency_key` 前缀一致性校验；非匿名 `user_id` 必须携带匹配的 Bearer token。
- 同步 `docs/API_CONTRACT.md`、`docs/DECISIONS.md` 与测试用例。

### 已验证
- `python -m compileall backend ai_service` 通过。
- `python -m pytest tests/test_auth_permissions.py tests/test_interactions.py tests/test_analysis.py tests/test_player_api.py tests/test_uploads.py` 通过，共 20 个测试。

### 遗留问题
- 管理后台前端已合入账号密码登录 UI，并接入后端 JWT 登录；后台业务页面仍是工作台骨架，尚未接入短剧、剧集、高光和看板真实数据 API。
- 播放端仍是匿名互动，不强制用户登录；当前只做匿名身份和幂等键一致性校验。

## 2026-05-27 dev/frontend 合并

### 已完成
- 将远端 `feature/frontend` 合入当前 `dev`，保留 `dev` 现有后端、AI 服务、移动端、数据库和测试实现。
- 管理后台前端切换为 `feature/frontend` 的 Vite + React + Ant Design + React Router 结构，新增 `/` 入口页、`/login` 登录页和工作台路由。
- 登录页从开发占位 token 改为调用 `POST /api/auth/login`；退出登录调用 `POST /api/auth/logout` 后清理本地登录态。
- 新增前端 Axios client，自动携带 `Authorization: Bearer <access_token>`，并在 `401/403` 时清 token 跳回 `/login`。
- 清理旧版 TypeScript 管理后台入口，避免 `src/main.tsx` 和新 JSX 工作台并存。
- 同步 `frontend/admin_web/README.md`、`frontend/admin_web/AUTHENTICATION.md`、`docs/DECISIONS.md` 和本进度文档。

### 已验证
- `npm install` 通过，前端依赖已按合并后的 `package.json` / `package-lock.json` 同步。
- `npm exec eslint .` 通过。
- `npm run build` 通过，Vite 仍提示单个 JS chunk 超过 500k，为当前 Ant Design 单包构建的既有体积提示。
- `python -m compileall backend ai_service` 通过。
- `python -m pytest tests/test_auth_permissions.py tests/test_interactions.py tests/test_analysis.py tests/test_player_api.py tests/test_uploads.py` 通过，共 20 个测试。

### 遗留问题
- 工作台当前仍是导航和占位页面，后续还需要按 `docs/API_CONTRACT.md` 接入短剧、剧集、AI 分析、高光审核和看板接口。

## 2026-05-27 工作台路由与角色权限收口

### 已完成
- 将前端工作台路由从 `/admin/*` 改为 `/workspace/*`，旧 `/admin/*` 保留重定向到 `/workspace`。
- 将前端命名从 `AdminWorkspace` / `adminModules` / `pages/admin` 调整为 `WorkspaceLayout` / `workspaceModules` / `pages/workspace`。
- 登录页不再拒绝 `uploader`，而是根据角色分流：`admin` 默认进入仪表盘，`uploader` 默认进入内容管理；侧边栏按角色过滤页面。
- 后端新增通用 `require_roles(...)` 权限依赖，并移除 `X-Admin-Token` / `ADMIN_TOKEN` 固定后台密钥逻辑。
- 后端接口权限调整：`admin/uploader` 可访问短剧、剧集和 AI 分析；高光审核发布、analytics、账号托管和 demo seed 仅 `admin` 可访问。
- 新增 `backend/scripts/bootstrap_admin.py`，用于在数据库无管理员时创建第一个 `admin` 并生成一次性随机密码。
- 同步 `.env.example`、`docs/API_CONTRACT.md`、`docs/DECISIONS.md`、`frontend/admin_web/README.md` 和 `frontend/admin_web/AUTHENTICATION.md`。

### 已验证
- `py -3.12 -m compileall backend ai_service` 通过。
- `npm exec eslint .` 通过。
- `npm run build` 通过，Vite 仍提示单个 JS chunk 超过 500k，为当前 Ant Design 单包构建的既有体积提示。
- `py -3.12 -m pytest tests/test_auth_permissions.py tests/test_interactions.py tests/test_analysis.py tests/test_player_api.py tests/test_uploads.py` 执行到 18 项通过；3 个上传测试在当前 Windows 临时目录权限处报 `PermissionError`，未进入业务断言。
- 使用 FastAPI TestClient 冒烟验证通过：未登录访问工作台 API 返回 401；`uploader` 可读短剧、上传视频并触发 AI 分析；`uploader` 访问高光审核和 analytics 返回 403；`admin` 可访问高光审核和 analytics。

### 遗留问题
- `/workspace/*` 当前仍是导航和占位页面，后续需要接入短剧、剧集上传/配置、AI 分析、高光审核和看板真实数据 API。

## 2026-05-28 结构化系统日志

### 已完成
- 引入 `structlog` 作为全局日志记录器，输出带有 `request_id` 的结构化 JSON 日志。
- 实现日志三端分发：标准输出（Docker logs）、本地持久化文件（`backend/logs/ignitenow.log`）、数据库表（`system_log`）。
- 新增 FastAPI 中间件，自动为每个请求生成 `request_id` 并记录执行时间，拦截全局未处理异常。
- 增加 `SystemLog` 模型，并且实现日志分级过滤写入：`INFO` 级别仅输出到文件和终端，`WARNING` 及 `ERROR` 级别会同步存入数据库。
- 新增 `GET /api/system/logs` 查询接口，供后续后台看板调阅。
- 同步更新了 API 契约和决策文档。

### 已验证
- API 冒烟测试：访问正常的 `/health` 接口，验证 JSON 日志输出在控制台和日志文件中，且未写入数据库。
- 异常链路拦截测试：通过 `/api/auth/login` 触发 `422 Unprocessable Entity`，验证系统准确在控制台和文件中输出 `WARNING` 级别 JSON，且正确记录到了 `SystemLog` 数据库表中。

## 2026-06-10 - 管理后台表格排版优化
**改动内容**：
- 废弃了 `DramasPage.jsx` 中 `episodeColumns` 和 `dramaColumns` 的百分比宽度（`width: '14%'` 等），改为硬编码的像素固定宽度结合弹性列（`minWidth`）。
- 为表格增加横向滚动能力（`scroll={{ x: 800 }}` 和 `scroll={{ x: 1000 }}`），在小屏幕或侧边栏展开时，允许表格溢出滚动，而不再强行挤压内部元素。
- 在 `workspace.css` 和内联样式中全面引入 `white-space: nowrap` 规则，强制保护“状态标签”、表头列名（如“字幕状态”）、以及“更新时间”等原子数据在一行内完整展示，杜绝难看的文字截断或多行折断。

**验证方式**：
- 缩放浏览器视口宽度，并进入短剧管理页的“管理剧集”面板，观察表格内容是否出现水平滚动条，以及文本是否保持单行。

**遗留问题/风险**：
- 暂无。

## 2026-06-11 - AI 分析高光审核弹窗样式收口

### 已完成
- 删除临时旧样式预览入口。
- 高光审核弹窗改为复用内容管理编辑信息同一套 `upload-drama-modal`、`upload-drama-form`、`upload-drama-card` 和 `upload-drama-footer` 样式。
- AI 分析表格勾选短剧时保留父子级联选择，剧集会随短剧一起被选中。
- 继续压缩高光审核详情标题、筛选栏和表头上下间距，右侧高光表格进一步贴近内容管理表格样式；底部统计移动到最左侧并移除“已归档”展示。
- AI 分析列表单集行的重新提交按钮增加“重新分析”文字；高光审核详情顶部摘要中的短剧标题区域缩短并支持超长标题省略。
- 高光审核详情顶部“分析完成时间”固定到摘要行最右侧；修正右侧高光列表搜索框与类型/状态筛选框的垂直对齐。
- 为高光审核列表“搜索识别依据关键词”输入框增加独立样式，覆盖 `upload-drama-modal` 全局输入框高度，统一外壳、内层输入和搜索图标的 30px 对齐。
- 高光审核左侧“视频时间轴”从占位图改为真实 HTML video 控件；下方新增独立审核进度条，按后端高光 `start_time` 标记彩色高光点，点击 marker 会选中高光并跳转视频时间；新增“人工添加”按钮，可按当前播放时间调用 `POST /api/episodes/{id}/highlights` 创建 draft 高光；右侧搜索框宽度改为与相邻筛选框一致。
- 修复高光审核右侧 AI 识别高光列表未撑满纵向容器的问题，补齐 `highlight-review-table` 与 Ant Table 内部 wrapper 的 flex 高度链路。
- 删除播放器下方独立高光类型 legend，改为在进度条每个高光 marker 下直接显示对应类型文字；“人工添加”按钮移动到“选中高光编辑”标题右侧并重做按钮样式；编辑区移除“AI识别”标签，审核状态下拉移除“已归档”选项；开始/结束时间标题右侧新增定位按钮，可把当前视频播放时间同步到对应输入框；对照后端确认 `reason`/“识别依据”等字段真实存在。
- 强化高光编辑选中反馈：编辑面板顶部新增当前编辑高光状态条，展示选中高光的类型、时间范围和审核状态；进度条选中的高光 marker 增强描边、阴影和类型文字强调；“添加高光”按钮固定为蓝底，避免未悬停时发白。
- 高光时间轴从点状 marker 改为段状 range，使用 `start_time` 到 `end_time` 的长度表达高光片段；编辑面板拆分 `编辑高光` 与 `新增高光` 两种模式，点击“新增高光”后开始/结束时间均等于当前播放时间，未修改成合法时间段时禁用“创建高光”，并提供“取消新增”回到上一次选中高光。
- 继续强化高光段状 range 的视觉：改为更粗的矩形片段条和更明显的选中描边，避免短片段看起来像点；AI 分析表格“一键分析全剧”按钮调整为与其他行操作一致的 30px 高度、13px 字号和紧凑内边距。
- 将单条高光保存按钮从弹窗底部全局 footer 移入编辑高光卡片的右下角，编辑模式显示“保存当前修改”，新增模式显示“创建高光”；弹窗底部仅保留取消和提交审核结果，避免单条保存与整体验收动作混淆。

### 已验证
- `npm exec eslint .` 通过。
- `npm run build` 通过，Vite 仍提示单个 JS chunk 超过 500k，为当前 Ant Design 单包构建的既有体积提示。
- `git diff --check` 通过。

### 遗留问题/风险
- 暂无。
