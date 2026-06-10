# IgniteNow 模块化任务拆解


## 1. MVP 闭环目标

先完成一条最短可演示链路：

```text
后台创建短剧/剧集
→ 配置视频和字幕
→ 后端触发 AI 高光识别
→ AI 输出结构化高光点
→ 后端入库
→ 后台审核并发布
→ Flutter 播放页拉取播放数据
→ 播放到高光时间点自动弹出互动
→ 用户点击后回传日志
→ 后台看板展示基础统计
```

## 2. 模块边界

| 模块 | 目录 | 职责 |
|---|---|---|
| 后端服务 | `backend/` | REST API、业务规则、数据库访问、AI 调度、统计聚合 |
| AI 高光识别 | `ai_service/` | 字幕解析、Prompt、LLM/规则识别、结构化 JSON 输出 |
| 管理后台 | `frontend/admin_web/` | 短剧/剧集管理、高光审核发布、数据看板 |
| Flutter 播放端 | `flutter/` | 视频播放、时间轴监听、互动浮层、动效、日志回传 |
| 数据库 | `datebase/` | 建表 SQL、初始数据、迁移脚本 |
| 资产与演示 | `assets/` | 示例视频、字幕、截图、演示素材 |
| 文档 | `docs/` | API 契约、进度、决策、交付说明 |

## 3. P0 任务：先跑通主链路

### 3.1 项目基建

| ID | 任务 | 产出 | 验收标准 |
|---|---|---|---|
| P0-BASE-01 | 补齐仓库目录说明 | `README.md` 更新 | 能说明各模块如何启动 |
| P0-BASE-02 | 补齐环境变量模板 | `.env.example` | 包含数据库、管理 token、AI 配置、静态资源地址 |
| P0-BASE-03 | 补齐 Docker Compose 本地编排 | `docker-compose.yml` | 至少能启动 MySQL，后续可加入 backend/admin |
| P0-BASE-04 | 建立进度和决策文档 | `docs/PROGRESS.md`、`docs/DECISIONS.md` | 记录已完成事项和关键取舍 |
| P0-BASE-05 | 固化 API 契约 | `docs/API_CONTRACT.md` | 前端、Flutter、后端字段对齐 |

### 3.2 数据库

| ID | 任务 | 产出 | 验收标准 |
|---|---|---|---|
| P0-DB-01 | 设计核心表结构 | `datebase/schema.sql` | 包含 drama、episode、highlight_event、interaction_template、user_interaction_log |
| P0-DB-02 | 添加唯一约束和索引 | SQL 索引 | interaction idempotency key 唯一，高光查询按 episode/status 高效 |
| P0-DB-03 | 准备演示种子数据 | `datebase/seed.sql` | 本地初始化后有 1 部短剧、1 集、模板数据 |

### 3.3 后端 FastAPI

| ID | 任务 | 产出 | 验收标准 |
|---|---|---|---|
| P0-BE-01 | 初始化 FastAPI 项目 | `backend/app/main.py` 等 | `/health` 可访问 |
| P0-BE-02 | 建立数据库连接与模型 | SQLAlchemy models | 能连接 MySQL 并创建/查询核心实体 |
| P0-BE-03 | 实现短剧 API | `/api/dramas` | 支持创建和列表查询 |
| P0-BE-04 | 实现剧集 API | `/api/episodes` | 支持创建、列表查询、绑定字幕/视频地址 |
| P0-BE-05 | 实现 AI 分析入口 | `POST /api/system/jobs` 创建 `ai_analyze` 异步任务 | worker 可调用 AI 服务并写入 draft 高光 |
| P0-BE-06 | 实现高光管理 API | `/api/episodes/{id}/highlights`、`/api/highlights/{id}` | 支持查询、编辑、删除/驳回 |
| P0-BE-07 | 实现发布 API | `POST /api/episodes/{id}/highlights/publish` | draft 高光可变为 published |
| P0-BE-08 | 实现播放端下发 API | `GET /api/player/episodes/{episode_id}` | 只返回 published 高光，不暴露 reason/confidence/status |
| P0-BE-09 | 实现互动日志 API | `POST /api/interactions` | 支持 impression/click/ignore，幂等写入 |
| P0-BE-10 | 实现基础统计 API | `GET /api/analytics/overview` | 返回短剧数、剧集数、高光数、互动数、点击率 |
| P0-BE-11 | 管理接口 token 校验 | `X-Admin-Token` | 后台写操作无 token 时拒绝 |

### 3.4 AI 高光识别服务

| ID | 任务 | 产出 | 验收标准 |
|---|---|---|---|
| P0-AI-01 | 实现字幕解析器 | `ai_service/subtitle_parser.py` | 支持 SRT/VTT 或至少一种演示字幕格式 |
| P0-AI-02 | 定义高光 JSON Schema | `docs/HIGHLIGHT_SCHEMA.json` | 限定类型、时间、按钮、特效、分数范围 |
| P0-AI-03 | 编写 Prompt 模板 | `ai_service/prompt_template.md` | 固定 5 类高光：conflict/reversal/sweet/satisfying/suspense |
| P0-AI-04 | 实现分析入口 | `ai_service/highlight_analyzer.py` | 输入字幕，输出 highlights 列表 |
| P0-AI-05 | 增加本地 fallback 规则 | 规则识别逻辑 | 无 LLM key 时仍能用示例字幕生成演示高光 |
| P0-AI-06 | 后端结果校验 | backend service | 非法 JSON、非法枚举、时间错误、分数越界会被拦截 |

### 3.5 管理后台 React

| ID | 任务 | 产出 | 验收标准 |
|---|---|---|---|
| P0-WEB-01 | 初始化 Vite + React + Ant Design | `frontend/admin_web/` | 本地 dev server 可打开 |
| P0-WEB-02 | API client 封装 | Axios service | 自动携带 `X-Admin-Token` |
| P0-WEB-03 | 短剧列表/创建页 | Dramas page | 可创建短剧并展示列表 |
| P0-WEB-04 | 剧集列表/创建页 | Episodes page | 可配置视频 URL、字幕 URL/内容 |
| P0-WEB-05 | AI 分析触发 | Analyze button | 点击后后端生成高光 |
| P0-WEB-06 | 高光审核页 | Highlight review page | 可查看、编辑、发布、驳回高光 |
| P0-WEB-07 | 基础看板页 | Analytics page | 展示 overview 指标 |

### 3.6 Flutter Android 播放端

| ID | 任务 | 产出 | 验收标准 |
|---|---|---|---|
| P0-MOB-01 | 初始化 Flutter 项目 | `flutter/` | Android 模拟器可运行 |
| P0-MOB-02 | API client | Dio service | 可请求后端播放数据 |
| P0-MOB-03 | 匿名用户 ID | SharedPreferences | 首次启动生成，后续复用 |
| P0-MOB-04 | 播放入口页 | Drama/Episode list 或 demo selector | 可进入指定 episode 播放页 |
| P0-MOB-05 | 视频播放页 | Player page | 能播放配置的视频 URL |
| P0-MOB-06 | 时间轴监听 | Player controller | 能读取 currentPosition 秒数 |
| P0-MOB-07 | 高光触发引擎 | HighlightTriggerEngine | 命中 start/end 窗口只触发一次，重叠时按 trigger_score/confidence/start_time 排序 |
| P0-MOB-08 | 互动浮层 | InteractionOverlay | 展示后端下发按钮 |
| P0-MOB-09 | 基础动效 | EffectLayer | 至少实现点击气泡和一种特效 |
| P0-MOB-10 | 互动日志回传 | InteractionLogger | 展示、点击、忽略事件能 POST 到后端 |

## 4. P1 任务：提升演示完整度

| ID | 模块 | 任务 | 验收标准 |
|---|---|---|---|
| P1-BE-01 | 后端 | 高光类型分布 API | `/api/analytics/highlight-types` 返回可图表化数据 |
| P1-BE-02 | 后端 | 热门按钮 API | `/api/analytics/top-actions` 返回按钮点击排行 |
| P1-WEB-01 | 管理后台 | 高光时间轴视图 | 能按 episode 看到高光分布 |
| P1-WEB-02 | 管理后台 | ECharts 图表 | 类型分布、点击率、热门按钮至少 2 个图 |
| P1-MOB-01 | Flutter | 群体反馈气泡 | 展示某高光已有多少人点击 |
| P1-MOB-02 | Flutter | 多种高光特效 | sweet/reversal/satisfying 至少有不同反馈 |
| P1-DEL-01 | 交付 | Android APK 打包 | 生成可安装 APK |

## 5. P2 任务：有余力再做

| ID | 模块 | 任务 | 说明 |
|---|---|---|---|
| P2-AUTH-01 | 后端/后台 | 完整登录和权限 | MVP 可用 admin token 代替 |
| P2-FILE-01 | 后端 | 文件上传/对象存储 | MVP 可先使用 URL 或本地静态文件 |
| P2-RT-01 | Flutter/后端 | WebSocket 实时反馈 | MVP 用轮询或静态统计即可 |
| P2-AI-01 | AI | 多模态视频理解 | 当前以字幕分析为主 |
| P2-MOB-01 | Flutter | 多剧集连续播放 | 演示一集即可 |
| P2-WEB-01 | 管理后台 | 高光热力图 | 第三周看时间安排 |

## 6. 推荐开发顺序

1. 数据库 schema 和 API 契约先定下来，避免三端字段反复改。
2. 后端先提供 mock 播放数据，让 Flutter 播放端能并行开发。
3. AI 服务先做本地规则 fallback，再接 LLM，保证演示不被外部服务阻塞。
4. 管理后台先做高光审核/发布，不急着做漂亮看板。
5. 最后串联完整录屏链路，补 README、截图、APK 和演示数据。

## 7. 并行分工建议

| 角色 | 第一阶段 | 第二阶段 | 第三阶段 |
|---|---|---|---|
| 成员 A：移动端 | Flutter 初始化、播放页、API client | 高光触发、互动浮层、日志回传 | 动效、APK、移动端录屏 |
| 成员 B：后端/AI | schema、FastAPI、基础 API | AI 分析、入库、发布、播放下发 | 统计 API、异常处理、部署脚本 |
| 成员 C：后台/文档 | React 初始化、页面框架、API 契约 | 短剧/剧集/高光审核页 | 看板、README、飞书文档、录屏脚本 |

## 8. 关键验收场景

最终至少要能稳定演示以下路径：

1. 后台创建短剧和剧集。
2. 为剧集配置视频和字幕。
3. 点击 AI 识别，生成 draft 高光。
4. 在后台编辑或直接发布高光。
5. Flutter 播放端打开该 episode。
6. 播放到高光时间点，自动出现互动按钮。
7. 用户点击按钮后出现反馈动效。
8. 后端收到互动日志。
9. 后台看板互动次数和点击率发生变化。

## 9. 当前仓库状态

- `docs/原始开发文档 v1.1.md` 已提供完整产品和技术方案。
- `README.md` 有项目概览，但技术栈、启动方式仍待补。
- `backend/`、`ai_service/`、`frontend/admin_web/`、`flutter/`、`datebase/`、`assets/` 目前只有占位文件。
- `docs/PROGRESS.md`、`docs/DECISIONS.md`、`docs/API_CONTRACT.md`、`docs/HIGHLIGHT_SCHEMA.json` 目前为空，建议下一步优先补齐。
