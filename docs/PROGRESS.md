# 开发进度

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
- 抽出 AI 分析业务逻辑到 `backend/app/services/analysis_service.py`，原同步分析接口和 RQ worker 共用同一实现。
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
- `ocr_import` 和 `verify_demo_chain` 仅预留任务类型，执行器尚未接入。
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
- FastAPI TestClient 主链路通过：`/health`、`/api/demo/seed`、`/api/episodes/1/analyze`、`/api/episodes/1/highlights/publish`、`/api/player/episodes/1`、`/api/interactions`、`/api/analytics/overview`。
- `npm install` 和 `npm run build` 通过；Vite 仅提示 Ant Design chunk 偏大，不影响运行。
- `flutter pub get` 通过。
- `flutter analyze` 通过，无静态分析问题。
- 大模型接入后验证：未配置 `LLM_API_KEY` 时，`POST /api/episodes/1/analyze` 自动走 `fallback_rules` 并生成 3 条高光。
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
