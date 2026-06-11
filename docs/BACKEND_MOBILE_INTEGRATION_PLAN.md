# 后端开发与移动端衔接方案

本文基于当前管理后台页面、Flutter 播放端实现、后端已完成接口和数据模型，梳理后续后端开发重点，以及 Web 管理后台、Android 播放端需要增删改的功能。

## 0. 已确认实施决定

- AI 分析列表确定新增并使用 `GET /api/analysis/queue` 聚合接口；前端不再自行拼接 drama、episode 和 job 列表数据。
- 管理后台视频上传确定接入 `ffprobe`，由后端解析 duration、width、height、file_size 和 mime_type。
- 互动日志确定新增 `play_session_id`；Android 每次进入播放页生成一个 UUID，并随 impression、click、ignore 一起回传。
- 移动端上传链路确定下线：删除 `POST /api/uploads/episodes`、移动端上传页面及入口。Android 保留 `/api/player/*` 播放接口和 `POST /api/interactions` 互动回传接口。
- `verify_demo_chain` 确定从系统 `JOB_TYPES` 删除；`backend/scripts/verify_demo_chain.py` 继续作为命令行验收脚本保留。

## 1. 当前真实状态

### 1.1 已经跑通的后端能力

- 账号与权限：`/api/auth/register`、`/api/auth/login`、`/api/auth/me`、`/api/auth/logout` 已支持 Bearer JWT；`admin` 和 `uploader` 已区分权限。
- 内容资产：`drama`、`episode` 已有基础表和后台接口；`episode.owner_user_id` 已用于 uploader 数据隔离。
- 移动端上传：`POST /api/uploads/episodes` 当前仍存在，但已确定下线，内容上传统一迁移到管理后台。
- AI 分析：同步接口 `/api/episodes/{episode_id}/analyze` 已删除，触发分析统一通过 `/api/system/jobs` 创建 `ai_analyze` 异步任务，实际执行由 RQ worker 调用同一分析服务完成。
- 高光管理：`highlight_event.status` 已支持 `draft`、`published`、`rejected`、`archived`；后台可新增、编辑、归档、批量改状态和发布 draft 高光。
- 播放端接口：`/api/player/dramas`、`/api/player/dramas/{drama_id}/episodes`、`/api/player/episodes/{episode_id}` 已只下发 `published` 高光，并隐藏 `reason`、`confidence`、`status` 等审核字段。
- 互动回传：`POST /api/interactions` 已支持 `impression`、`click`、`ignore`，并用 `idempotency_key` 保证幂等。
- 数据看板底座：`/api/analytics/*` 已有 overview、类型分布、热门按钮、高光排行、单集时间线、单条高光统计。

### 1.2 当前管理后台页面状态

- 内容管理页：真实调用 `GET /api/dramas`、`POST /api/dramas`、`PUT /api/dramas/{id}`；阶段 2 已补齐 `wide_cover_url`、`categories`、`cast_tags`、`updated_at`、`asset_status` 和视频元数据字段。上传短剧弹窗已接入封面/横版封面/视频/字幕真实上传、指定短剧单集上传入库和上传后自动提交 AI 分析任务。
- AI 分析页：已改为读取 `GET /api/analysis/queue` 聚合接口，任务创建、重试、详情和日志继续使用 `/api/system/jobs`；无真实任务时显示真实空状态，不再使用 mock 行。
- 发布中心：已新增 `publish_job`、`publish_job_item`、待发布列表、发布任务、一键发布、发布记录、详情和重试接口，前端已替换核心 mock 数据。定时发布 worker 和发布单维度回流聚合仍待阶段 3。
- 仪表盘：已接入 `/api/analytics/overview`、`/api/analytics/highlight-types`、`/api/analytics/top-actions` 和 `/api/analytics/highlight-ranking`。
- 系统设置：保留 `/api/system/settings` 基础读写接口和前端占位骨架，未接入真实运行逻辑的配置项已删除。

### 1.3 当前 Flutter 播放端状态

- 内容入口只消费 `GET /api/player/dramas` 和 `GET /api/player/dramas/{drama_id}/episodes`。
- 播放页消费 `GET /api/player/episodes/{episode_id}`，字段为 `episode_id`、`title`、`video_url`、`duration`、`highlights`。
- 高光触发使用 `highlight_id`、`start_time`、`end_time`、`trigger_score`、`button_text`、`effect`。
- 互动日志使用匿名 `user_id`，按 `user_id_highlight_id_action_type_minuteBucket` 生成幂等键。
- 上传页当前消费 `/api/auth/*` 与 `/api/uploads/episodes`；该页面、入口和上传 API 已确定删除。

## 2. 目标链路

最终建议收敛成一条清晰链路：

```text
管理后台创建/上传短剧资产
-> 创建剧集与上传视频/字幕
-> 创建 AI 分析任务
-> 后端生成 draft 高光
-> 管理后台审核、编辑、发布
-> 发布中心生成 Android 发布单
-> 播放端只拉取已发布且 Android 可见的内容
-> 播放端曝光/点击/忽略回传
-> 管理后台看板与发布中心回流展示数据
```

这里有一个关键边界：播放端仍然不能看到后台审核字段。任何新增发布接口都必须保证移动端只拿到播放必要字段。

## 3. 后端需要增加的能力

### 3.1 内容资产模型补齐

当前 `drama` 只有 `title`、`description`、`cover_url`、`status`。但前端“上传短剧”已经设计了分类、主演、横版封面、剧集数量、素材上传、AI 开关。

阶段 2 已开始落地第一批内容资产字段：

| 表 | 字段 | 说明 |
|---|---|---|
| `drama` | `wide_cover_url` | 横版封面 |
| `drama` | `categories_json` | 所属分类数组，JSON 字符串 |
| `drama` | `cast_tags_json` | 主演/标签数组，JSON 字符串 |
| `drama` | `updated_at` | 内容管理“最后更新时间”来源 |
| `episode` | `updated_at` | AI、上传、配置变更时更新 |
| `episode` | `asset_status` | `draft`、`ready`、`incomplete`，用于内容资产完整度 |
| `episode` | `video_width`、`video_height`、`video_file_size`、`video_mime_type` | 后台上传视频时由 ffprobe 自动解析 |

如果后续要做更规范的分类管理，再拆 `category`、`drama_category`、`cast_member` 表。MVP 阶段用 JSON 字符串足够，改动更小。

### 3.2 管理后台上传接口

当前后台“上传短剧”弹窗只创建 `drama`，没有真正上传封面、视频、字幕，也不会创建剧集。

建议新增或扩展接口：

| 接口 | 用途 |
|---|---|
| `POST /api/admin/assets/files` | 已新增并接入前端；上传封面、视频、字幕等通用文件，返回 `/uploads/...` 可访问 URL 和本地 path，视频会解析 ffprobe 元数据 |
| `POST /api/dramas/{drama_id}/episodes/upload` | 已新增；管理后台为指定短剧上传单集视频/字幕并创建 episode |
| `POST /api/dramas/{drama_id}/episodes/batch` | 批量创建剧集配置，第一版可只接 JSON，不必立刻解析 Excel |
| `POST /api/dramas/{drama_id}/enqueue-analysis` | 按短剧批量提交 AI 分析任务 |

不复用 `/api/uploads/episodes`。该移动端上传接口确定删除，后台上传使用本节定义的管理员素材接口，以支持批量能力、管理员权限、素材状态、封面和横版封面处理。

### 3.3 发布中心真实化

当前“发布中心”是最大缺口。后端只有 `highlight_event.status=published`，没有发布单、渠道、定时发布、发布中/失败状态。

第一阶段建议新增最小发布模型：

| 表 | 关键字段 | 说明 |
|---|---|---|
| `publish_job` | `id`、`channel`、`status`、`scheduled_at`、`created_by_user_id`、`error`、`created_at`、`updated_at` | 一次发布动作 |
| `publish_job_item` | `id`、`publish_job_id`、`episode_id`、`status`、`error` | 发布单中的剧集 |

枚举建议：

- `channel`: 第一版只允许 `android`
- `publish_job.status`: `pending`、`publishing`、`success`、`failed`、`canceled`
- `publish_job_item.status`: `pending`、`publishing`、`success`、`failed`

建议接口：

| 接口 | 说明 |
|---|---|
| `GET /api/publish/pending-items?status=all|publishing|unpublished|failed` | 发布中心待发布表格数据 |
| `POST /api/publish/jobs` | 创建发布任务，支持单个或批量 episode，支持可选 `scheduled_at` |
| `POST /api/publish/jobs/one-click` | 一键发布当前所有可发布内容 |
| `GET /api/publish/jobs` | 最近发布记录与回流 |
| `GET /api/publish/jobs/{job_id}` | 发布单详情 |
| `POST /api/publish/jobs/{job_id}/retry` | 失败发布重试 |
| `POST /api/publish/items/{episode_id}/config` | 保存发布配置，例如发布时间、策略挂载 |

第一版发布执行逻辑可以很简单：

1. 校验 episode 存在。
2. 校验 episode 至少有 draft 或 published 高光。
3. 将该 episode 的 draft 高光发布为 `published`。
4. 写入 `publish_job` 和 `publish_job_item`。
5. 统计该 episode 的回流数据。

后续如果要支持定时发布，再由 worker 扫描 `scheduled_at <= now` 且 `status=pending` 的发布单。

### 3.4 播放端可见性收口

当前播放端只看 `highlight_event.status=published`。如果引入发布单，必须明确移动端可见条件。

建议第一阶段仍保持：

```text
drama.status = active
episode 存在
highlight_event.status = published
```

如果产品要求“发布单成功后才可见”，再增加：

```text
episode.android_publish_status = published
```

或者增加发布映射表查询。但 MVP 不建议让播放端接口依赖复杂发布单 join，否则容易破坏现有稳定链路。

### 3.5 系统设置落库

| 表 | 字段 |
|---|---|
| `system_setting` | `key`、`value_json`、`updated_by_user_id`、`updated_at` |

接口已保留：

- `GET /api/system/settings`
- `PUT /api/system/settings`

当前未接入真实运行逻辑的占位配置项已删除，接口返回空 `settings`。后续新增任何设置前，必须先接入对应业务逻辑，再同步 API 契约和前端表单。

### 3.6 数据看板接入

仪表盘应接入已有 analytics，不必先新建复杂接口。

前端需要读取：

- `GET /api/analytics/overview`
- `GET /api/analytics/highlight-types`
- `GET /api/analytics/top-actions`
- `GET /api/analytics/highlight-ranking`

后端后续再补：

- 按日期分组的趋势接口：`GET /api/analytics/trend?from=&to=`
- 按发布单回流的接口：`GET /api/publish/jobs/{job_id}/analytics`

## 4. 后端需要修改的能力

### 4.1 `GET /api/dramas` 和 `GET /api/episodes`

需要补齐前端当前展示字段：

- `created_at`
- `updated_at`
- `wide_cover_url`
- `categories`
- `cast_tags`
- `asset_completion` 或 `asset_status`
- `latest_job`

AI 分析页现在自己拼 job、drama、episode。确定新增聚合接口：

```http
GET /api/analysis/queue
```

返回每个 episode 的短剧名、封面、`asset_status`、字幕状态、AI 状态、最新任务、草稿高光数、更新时间。接入后，AI 分析列表只读取该接口；创建、重试任务仍使用 `/api/system/jobs`，任务详情和日志接口继续保留。权限过滤统一在后端完成。

### 4.2 `/api/system/jobs`

当前只实现 `ai_analyze`。`verify_demo_chain` 从 `JOB_TYPES` 删除，继续作为命令行验收脚本使用；`ocr_import` 暂保留为预留类型，但在执行器完成前不得在 UI 中暴露。

另外建议增加：

- `cancel` 接口：`POST /api/system/jobs/{job_id}/cancel`
- `latest_by_episode` 查询：`GET /api/system/jobs/latest?episode_ids=1,2,3&type=ai_analyze`

### 4.3 上传服务

管理后台视频上传确定接入 `ffprobe`，由后端自动解析：

- duration
- width / height
- file_size
- mime_type

解析结果统一写入 episode 或 asset 表；上传失败、解析超时和非法视频必须返回明确错误。部署镜像必须安装 FFmpeg/ffprobe。

### 4.4 互动幂等策略

当前移动端按分钟生成幂等键。这样同一分钟内同一高光同一动作只记录一次，适合 MVP，但会限制重复观看统计。

后续建议：

- `impression`: 同一播放会话内一次。
- `click`: 同一高光一次。
- `ignore`: 每次展示超时一次。

确定新增 `play_session_id` 字段，替换仅依赖分钟桶区分播放过程的方式。Android 每次进入播放页生成一个 UUID，同一播放过程的所有互动使用同一个值。

## 5. 后端建议删除或下线的内容

| 项 | 建议 | 原因 |
|---|---|---|
| 旧 `X-Admin-Token` 文档残留 | 删除或标记废弃 | 当前已统一 Bearer JWT |
| 前端不可用的后台任务入口 | 已删除页面，后端保留 API | 后端 API 仍支撑 AI 分析，不删除 |
| `verify_demo_chain` 系统任务类型 | 从 `JOB_TYPES` 删除 | 它是命令行验收脚本，不是业务任务 |
| `ocr_import` 对外任务类型 | 暂时从前端选项隐藏 | 未实现执行器，避免误用 |
| 移动端上传接口与页面 | 删除 | 内容上传统一由管理后台负责 |
| 同步分析接口 `/api/episodes/{id}/analyze` | 删除 | AI 分析统一异步化，避免阻塞请求线程并统一任务状态、日志和失败重试 |
| 发布中心 mock 数据 | 接入真实发布接口后删除 | 避免演示数据和真实数据混杂 |
| 上传短剧弹窗中的假文件 chip | 接入真实上传后删除 | 当前“第1集_1080p.mp4 上传完成”是静态假状态 |

## 6. 前端还应该增加的功能

### 6.1 内容管理

需要增加：

- 点击短剧行进入“短剧详情/剧集列表”，否则当前只能看到短剧表，无法管理剧集。
- 上传短剧弹窗真正上传封面、横版封面、视频、字幕。
- 素材上传后创建 episode，而不是只创建 drama。
- 剧集列表支持：
  - 编辑视频 URL / 本地文件
  - 编辑字幕
  - 查看字幕是否存在
  - 提交 AI 分析
  - 跳转到 AI 任务详情
  - 跳转到发布中心

需要删除或收敛：

- 静态“第1集_1080p.mp4 上传完成”chip。
- 只存在于前端的 `categories`、`keywords` 默认值，接后端后应使用真实字段。
- “上传后立即开始分析”在后端没有自动任务时，应禁用或接入真实行为。

### 6.2 AI 分析

需要增加：

- 任务列表空状态不要长期使用 mock 行，建议改成真实空状态和“去内容管理上传素材”入口。
- 分析任务详情展示后端真实日志、错误摘要、生成高光数、invalid_count。
- 失败任务支持查看原因和重试。
- 可按短剧、剧集、状态、更新时间筛选。

需要删除：

- mock 任务详情数据，接入真实任务后删除或只保留开发环境 demo seed。

### 6.3 发布中心

需要增加：

- 接 `GET /api/publish/pending-items` 替换 `publishItems`。
- 接 `POST /api/publish/jobs` 替换单行“发布”按钮。
- 接 `POST /api/publish/jobs/one-click` 替换“一键发布”按钮。
- 发布配置弹窗保存到后端。
- 最近发布记录接 `GET /api/publish/jobs`。
- 失败记录支持重试。
- 回流数据展示 impressions、clicks、click_rate，而不是“回流正常”文案。

需要删除：

- `recentRecords` 静态数组。
- `publishMetrics` 静态数字。
- H5、正式环境等已被删除的非 Android 渠道后续也不要在接口中保留。

### 6.4 仪表盘

需要增加：

- 接入 `/api/analytics/overview`。
- 展示总短剧、总剧集、已发布高光、互动次数、点击率。
- 展示高光类型分布和热门按钮。

### 6.5 系统设置

当前保留系统设置页面和 `/api/system/settings` 基础接口，但不展示未接入真实逻辑的配置项。后续新增设置时，需要在页面上明确该设置是否立即生效、是否需要重启 worker。

## 7. Android 播放端衔接要求

### 7.1 移动端继续只使用播放端 API

Android 不应调用后台接口，不应携带管理员 token。推荐保持以下接口：

| 场景 | 接口 |
|---|---|
| 首页短剧列表 | `GET /api/player/dramas` |
| 短剧剧集列表 | `GET /api/player/dramas/{drama_id}/episodes` |
| 播放详情 | `GET /api/player/episodes/{episode_id}` |
| 视频文件 | `GET /api/player/episodes/{episode_id}/video` 或远程 URL |
| 互动回传 | `POST /api/interactions` |

### 7.2 播放详情字段保持稳定

移动端依赖字段应保持：

```json
{
  "episode_id": 1,
  "title": "第 1 集",
  "video_url": "http://...",
  "duration": 120,
  "highlights": [
    {
      "highlight_id": 1,
      "start_time": 12.4,
      "end_time": 16.8,
      "highlight_type": "reversal",
      "emotion": "震惊",
      "intensity": 0.8,
      "trigger_score": 0.9,
      "button_text": "太反转了",
      "effect": "shocked"
    }
  ]
}
```

禁止下发：

- `status`
- `reason`
- `confidence`
- `created_at`
- `updated_at`
- 审核人、发布人、失败原因等后台字段

### 7.3 移动端需要补的功能

- 剧集列表区分“暂无高光”和“可播放但无互动”。
- 播放页在视频加载失败时展示可复制的 `video_url` 或 request id，便于联调。
- 互动日志失败时做本地队列重试，不要只在内存里丢弃。
- 移动端启动播放页时生成 `play_session_id`，并随每次互动回传。

## 8. 推荐实施顺序

### 阶段 1：让现有页面全部接真实数据

1. 仪表盘接 analytics overview。
2. 发布中心新增最小发布接口和发布表。
3. 发布中心替换 mock 数据。
4. 系统设置新增读写接口。
5. 删除 AI 分析 mock 行，改真实空状态。

验收标准：

- 管理后台没有核心业务 mock 数据。
- 发布中心点击“发布”后，Android 能看到对应高光。
- Flutter 播放到高光点可以触发互动，并能在 analytics 看到回流。

### 阶段 2：补齐上传与内容资产

1. 后端补 drama 扩展字段和 updated_at。（已完成：`wide_cover_url`、`categories_json`、`cast_tags_json`、`drama.updated_at`、`episode.updated_at`、`episode.asset_status` 已落地）
2. 后台上传封面、视频、字幕接真实文件接口。（已完成）
3. 后台上传短剧可以创建剧集。（已完成第一版：单次提交创建第 1 集）
4. 上传后按配置自动提交 AI 分析任务。（已完成第一版）

验收标准：

- 从后台上传一个新短剧和一集视频/字幕，不需要移动端上传，也能完成 AI 分析和发布。

### 阶段 3：强化发布与移动端回流

1. 支持定时发布 worker。
2. 发布失败可重试。
3. 发布单维度展示曝光、点击、忽略、点击率。
4. 移动端互动日志支持本地失败重试和 play_session_id。

验收标准：

- 发布中心能解释每条内容为什么发布中、失败或已上线。
- 移动端弱网下互动日志不会大量丢失。

## 9. 必须补充的测试

后端：

- 发布接口只允许 admin。
- `channel` 只允许 `android`。
- 发布 draft 高光后，`GET /api/player/episodes/{id}` 可以看到高光。
- rejected、archived、draft 高光仍不会下发给播放端。
- 定时发布未到时间不会下发。
- 发布失败记录 `error`，重试后状态正确。
- 系统设置保存后能读取。
- 后台上传视频/字幕能创建 episode。

前端：

- 发布中心列表、发布、一键发布、失败重试。
- 上传短剧真实上传流程。
- AI 分析空状态和失败状态。
- 系统设置保存成功和失败。

Flutter：

- 播放端字段隔离。
- 高光只触发一次。
- impression、click、ignore 幂等。
- 视频 URL 失败提示。

## 10. 总结

当前后端已经完成了 MVP 主链路的核心底座：内容、AI、审核状态、播放端下发、互动回传和基础统计。下一步不是重写，而是补齐“运营后台新 UI”背后的真实模型，尤其是发布中心、后台上传和系统设置。

最小可交付路径是：

```text
发布中心真实化
-> Android 只看 published 高光
-> 仪表盘接 analytics
-> 上传短剧真正创建 episode
-> 系统设置落库
```

只要保持播放端接口字段隔离和 `highlight_event.status=published` 规则不破坏，Android 端可以低成本继续沿用现有 API，并自然接入后台发布后的内容。

---

## 11. 执行状态追踪（截至 2026-06-11）

### 11.1 三个阶段完成情况

| 阶段 | 条目 | 状态 |
|---|---|---|
| **阶段 1** | 仪表盘接 analytics overview | ✅ 已完成 |
| | 发布中心新增最小发布接口和发布表 | ✅ 已完成 |
| | 发布中心替换 mock 数据 | ✅ 已完成 |
| | 系统设置新增读写接口 | ✅ 已完成 |
| | 删除 AI 分析 mock 行，改真实空状态 | ✅ 已完成 |
| **阶段 2** | drama 扩展字段（wide_cover_url、categories_json 等） | ✅ 已完成 |
| | 后台上传封面/视频/字幕接真实接口（ffprobe 元数据解析） | ✅ 已完成 |
| | 上传短剧后创建剧集（第 1 集） | ✅ 已完成 |
| | 上传后自动提交 AI 分析任务 | ✅ 已完成 |
| **阶段 3** | 定时发布 worker（asyncio 每分钟扫描到期发布单） | ✅ 已完成 |
| | 发布失败可重试（接口 + 前端重试按钮） | ✅ 已完成 |
| | 发布单回流数据展示（曝光/点击/点击率分列） | ✅ 已完成 |
| | 移动端 play_session_id 上报 | ✅ 已完成 |
| | 移动端互动日志本地失败重试队列 | ✅ 已完成 |
| | 删除移动端上传页面和上传入口 | ✅ 已完成 |

### 11.2 计划内尚未落地的条目

下列条目在计划中有明确描述，当前执行情况如下：

#### 高优先 — 全部已完成 ✅

| 条目 | 章节 | 状态 |
|---|---|---|
| 删除后端 `POST /api/uploads/episodes` | §5 | ✅ 已改为 410 Gone，测试同步更新 |
| 后端接收并存储 `play_session_id` | §4.4 | ✅ 模型、Schema、schema_compat、API 契约同步更新 |
| Flutter 剧集列表区分"暂无高光"和"可播放但无互动" | §7.3 | ✅ 已区分金色高光标签和灰色"暂无高光"状态 |

#### 中优先 — 全部已完成 ✅

| 条目 | 章节 | 状态 |
|---|---|---|
| `POST /api/dramas/{drama_id}/episodes/batch` 批量创建剧集 | §3.2 | ✅ 已实现，最多 100 条/次，episode_no 不重复校验 |
| `POST /api/dramas/{drama_id}/enqueue-analysis` 按短剧批量提交 AI 分析 | §3.2 | ✅ 已实现，跳过 processing/success 状态剧集 |
| `POST /api/system/jobs/{job_id}/cancel` 取消任务 | §4.2 | ✅ 已实现，只允许取消 pending 状态任务 |
| `GET /api/system/jobs/latest?episode_ids=...` | §4.2 | ⏭️ 跳过，`/api/analysis/queue` 已覆盖该场景 |

#### 低优先 — 已完成两个，一个需运维决策

| 条目 | 章节 | 状态 |
|---|---|---|
| `GET /api/analytics/trend?from_date=&to_date=` 趋势接口 | §3.6 | ✅ 已实现，按日期分组，支持日期范围过滤，默认最近 30 天 |
| `GET /api/publish/jobs/{job_id}/analytics` 发布单维度回流 | §3.6 | ✅ 已实现，按剧集细化展示曝光/点击/忽略数据 |
| 多实例定时发布并发安全 | §3.3 | ⚠️ 未实现，需运维侧决策（单实例部署可忽略） |

### 11.3 遗留技术债

- **多实例并发安全**：定时发布 worker 仅保证单 uvicorn 进程安全。生产多实例部署需加 `SELECT FOR UPDATE SKIP LOCKED` 或使用外部 cron，否则同一发布单可能被多次执行。
- **`AuthTokenOut` 中残留移动端字段**：`schemas.py` 中 `AuthTokenOut` 仍保留 `user_id`、`username`、`role` 平铺字段（兼容旧客户端），随着上传链路完全下线后可清理。
- **`UploadEpisodeOut` schema 可以删除**：`uploads.py` 现已仅返回 410 Gone，该 schema 不再被引用，后续可从 `schemas.py` 移除。

### 11.4 验收基线（截至本次）

- 后端：43 个测试全部通过（`pytest tests --basetemp .codex-pytest-tmp`）
- 前端：`npm run build` 通过（Vite 4 chunk > 500k 为既有提示，非错误）
- 后端编译：`compileall backend/app` 通过
- Flutter：`flutter analyze` 0 error，0 warning
