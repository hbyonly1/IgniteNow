# AI 分析功能完善计划

## 背景与目标

当前 AI 分析链路已打通端到端流程，但存在以下 4 个明显缺口需要修复，以及一项 UI bug 需要立即修复。

---

## 任务优先级

### 🔴 立即修复（Bug）

**复选框不应级联选中所有子集数**

Ant Design Tree Data 的 `rowSelection` 默认会在勾选父行时自动级联勾选所有子行。但业务上用户可能只想"批量分析某部剧"，而非"选中某部剧的所有剧集"。

- **修复方式**：在 `rowSelection` 中增加 `checkStrictly: true`，使父子行复选框**完全独立**，不互相级联。
- **影响文件**：[AnalyzePage.jsx](file:///Users/hbyonly1/vscode/IgniteNow/frontend/admin_web/src/pages/workspace/AnalyzePage.jsx)
- **改动量**：1行

---

### 🔴 高优先级 — 高光审核详情弹窗

**将 `AnalyzePage` 中每集的"查看详情"按钮改为打开高光审核弹窗。**

> [!IMPORTANT]
> 后端接口已完全就绪：`GET /api/episodes/{id}/highlights`、`PUT /api/highlights/{id}`、`POST /api/episodes/{id}/highlights/bulk-status`，无需新增接口。

#### 弹窗布局（对照参考图）

弹窗分为三个区域：

**① 顶部信息栏**
- 短剧名称 + 封面、集数、时长、分析状态、分析完成时间

**② 主体内容区（左右分栏）**
- **左侧（40%）**: 模拟视频播放区 + 时间轴标记
  - 时间轴上按高光类型显示彩色圆点标记（冲突/反转/心动/爆点/悬念/人工添加）
  - 点击标记或列表行时，左下方"选中高光编辑区"随之联动更新
- **左下：选中高光编辑区**
  - 时间范围（可直接编辑数字，格式 `MM:SS.ms`）
  - 高光类型下拉（固定 5 种 + 人工添加）
  - 置信度（仅显示，AI 识别的不可改）
  - 识别依据（`reason` 字段，纯文本，可编辑）
  - 审核状态下拉（待审核 / 已通过 / 已修改 / 已拒绝）

- **右侧（60%）: AI 识别高光列表**
  - 顶部筛选：全部类型 / 全部状态 / 关键词搜索
  - 表格列：`时间范围` | `类型` | `识别依据（截断）` | `置信度%` | `状态 Tag` | `操作（通过/修改/拒绝）`
  - 点击行 → 左侧编辑区联动

**③ 底部统计 + 操作栏**
- 统计汇总：全部 N / 已通过 N / 已修改 N / 已拒绝 N / 待审核 N / 人工添加 N
- 操作按钮：`取消` | `保存修改`（PUT 单条）| `提交审核结果`（bulk-status）

#### 实施文件
- [MODIFY] [AnalyzePage.jsx](file:///Users/hbyonly1/vscode/IgniteNow/frontend/admin_web/src/pages/workspace/AnalyzePage.jsx) — 新增 `HighlightReviewModal` 组件，"查看详情"按钮改为打开此弹窗
- [MODIFY] [workspace.css](file:///Users/hbyonly1/vscode/IgniteNow/frontend/admin_web/src/styles/workspace.css) — 补充弹窗样式

---

### 🔴 高优先级 — 字幕预处理修复

**将字幕文本先经过 `subtitle_parser.py` 解析结构化，再格式化传给 LLM，而不是直接扔原始 SRT。**

目前 `analysis_service.py` 第 35 行：
```python
# 当前：直接把原始 SRT 扔给 LLM
result = analyze_subtitle_text(episode.subtitle_content or episode.subtitle_url or "")
```

修复后：
```python
# 修复后：先解析，再格式化为 "时间段: 台词" 形式传入
from ai_service.subtitle_parser import parse_subtitle_text
cues = parse_subtitle_text(episode.subtitle_content)
payload = "\n".join(f"[{c.start_time:.1f}s - {c.end_time:.1f}s] {c.text}" for c in cues)
result = analyze_subtitle_text(payload)
```

- **影响文件**：[analysis_service.py](file:///Users/hbyonly1/vscode/IgniteNow/backend/app/services/analysis_service.py)
- **改动量**：5行

---

### 🟡 中优先级 — 置信度在高光审核列表中展示并可过滤

在高光审核弹窗中已包含置信度展示（见上方弹窗计划）。此项作为弹窗的附属功能，随弹窗一起交付，不单独实施。

---

### 🟡 中优先级 — 自定义 Prompt 入口

在管理后台"设置"页增加一个 Prompt 编辑器，允许运营人员自定义 AI 识别指引：

- **后端**：新增 `GET/PUT /api/settings/prompt-template` 接口，将模板存储在数据库或文件系统（当前 `prompt_template.md`）中
- **前端**：在 [SettingsPage.jsx](file:///Users/hbyonly1/vscode/IgniteNow/frontend/admin_web/src/pages/workspace/SettingsPage.jsx) 中增加 Prompt 编辑区块

> [!NOTE]
> 此项与高光审核弹窗相对独立，可在弹窗完成后单独实施。

---

## 执行顺序建议

| 顺序 | 任务 | 预计改动量 |
|---|---|---|
| 1 | 修复复选框级联 bug | 1行 |
| 2 | 字幕预处理修复 | 5行（后端） |
| 3 | 高光审核详情弹窗（主体） | 约 400 行（前端新组件） |
| 4 | 自定义 Prompt 入口 | 约 50 行后端 + 100 行前端 |

## 验证计划

- **复选框**：手动勾选短剧父行，确认子集数行未被选中
- **字幕预处理**：触发一次 AI 分析，查看 job log 确认无 SRT 乱码传入
- **高光弹窗**：打开任意一个已完成分析的剧集，确认高光列表正常加载，通过/拒绝/修改后状态同步更新

> 批准后我将按上述顺序依次执行，从 bug 修复开始。
