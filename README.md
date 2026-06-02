# IgniteNow

## 概览

即燃引擎：基于短剧内容理解的即时互动激发系统。

本项目面向短剧观看场景，通过 AI 分析字幕与剧情时间轴，识别剧情高光，并在 Flutter Android 播放端的关键时间点触发低门槛互动组件。用户点击后的行为会回传到后端，最终在 Web 工作台形成上传、识别、审核、发布和数据看板闭环。

## 核心功能

- 短剧、剧集、视频和字幕管理
- AI 高光识别
- 高光点结构化存储、编辑、审核和发布
- 按时间轴触发可交互的特效
- 用户互动回传
- 工作台数据看板统计曝光、点击、点击率和热门按钮

## 开发状态

详见 [docs/PROGRESS.md](docs/PROGRESS.md)

## 技术栈

| 模块 | 技术栈 |
|---|---|
| 后端 | FastAPI + SQLAlchemy + PostgreSQL |
| 前端 | React + Vite + Ant Design |
| AI 服务 | Python |
| 移动端 | Flutter + video_player + http + shared_preferences |
| 后台任务 | Redis + RQ |
| 日志 | structlog |

## `.env` 配置项说明

```env
# 主服务对外端口。容器内仍固定监听 8000；这里控制宿主机访问端口。
APP_PORT=8000
# 如果 APP_PORT 更改，下面的地址都应该更改
# 后端静态资源基础地址，默认指向当前 FastAPI 服务。
STATIC_BASE_URL=http://localhost:8000/static
# 前端本地开发时访问的后端地址。
VITE_API_BASE_URL=http://localhost:8000
# Docker Compose 内部访问 postgres 服务时使用这个地址。
# 如果修改了 POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB，DATABASE_URL 也要同步修改。
# 本机直接运行后端时可改为：postgresql://postgres:your_secure_password_here@localhost:5432/ignitenow
# 只想快速本地跑 SQLite 时可改为：sqlite:///./backend/ignitenow.db
DATABASE_URL=postgresql://postgres:your_secure_password_here@postgres:5432/ignitenow

# Redis 对外端口。只影响宿主机访问端口，不影响 app/worker 访问 Redis。
REDIS_PORT=6379
# Redis 连接。Docker Compose 内部访问 redis 服务时使用这个地址。
REDIS_URL=redis://redis:6379/0

# PostgreSQL 对外端口。只影响宿主机访问端口，不影响容器内服务名。
POSTGRES_PORT=5432
# PostgreSQL 容器用户名。
POSTGRES_USER=postgres
# PostgreSQL 容器密码。生产环境必须修改。
POSTGRES_PASSWORD=your_secure_password_here
# PostgreSQL 数据库名。
POSTGRES_DB=ignitenow

# JWT 签名密钥。
JWT_SECRET=your_jwt_secret_here
# JWT 签名算法，当前后端默认使用 HS256。
JWT_ALGORITHM=HS256
# access token 有效期，单位：分钟。
JWT_EXPIRE_MINUTES=120

# RQ 队列名称，app 和 worker 必须保持一致。
RQ_QUEUE_NAME=ignitenow

# LLM 请求超时时间，单位：秒。
LLM_TIMEOUT_SECONDS=90
# LLM API Key。留空时 AI 分析会走本地 fallback 规则。
LLM_API_KEY=
# 兼容 OpenAI 协议的 LLM 服务地址。
LLM_BASE_URL=https://api.openai.com/v1
# LLM 模型名称。
LLM_MODEL=gpt-4o-mini
```

## 部署方式

### 方式一：手动部署

适合已经在本机安装 Python、Node.js、Flutter、Redis 和数据库服务的开发环境。

#### 前置条件

- Python 3.12
- Node.js 22 或兼容版本
- Flutter SDK
- Redis
- PostgreSQL 或 SQLite

#### 快速开始

```bash
# 复制环境变量文件
cp .env.example .env
# 按需修改环境变量
nano .env
# 安装并启动 FastAPI
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
# 源码直接运行时，Redis 地址应使用宿主机地址：REDIS_URL=redis://localhost:6379/0
# 启动 Redis
redis-server
# 启动 worker
python -m backend.app.worker
# 首次使用没有管理员账号时，运行脚本来获取一次性密码
python backend/scripts/bootstrap_admin.py
```

若要启动前端开发服务：

```bash
cd frontend/admin_web
npm install
npm run dev
```

### 方式二：Docker Compose (推荐)

使用 Docker Compose 部署，包含 FastAPI App、RQ Worker、Redis 和 PostgreSQL 容器。

#### 前置条件

- Docker
- Docker Compose

#### 快速开始

```bash
# 复制环境变量文件
cp .env.example .env
# 按需修改环境变量
nano .env
# 启动服务
docker compose up --build -d
# 查看日志
docker compose logs -f app
```

## 访问

Docker Compose 或生产镜像启动后，在浏览器中打开：

- 产品入口页：`http://YOUR_SERVER_IP:8000/`
- 登录页：`http://YOUR_SERVER_IP:8000/login`
- 工作台：`http://YOUR_SERVER_IP:8000/workspace`
- 健康检查：`http://YOUR_SERVER_IP:8000/health`

本地 Vite 开发服务默认访问：

- 产品入口页：`http://localhost:5173/`
- 登录页：`http://localhost:5173/login`
- 工作台：`http://localhost:5173/workspace`

如果 admin 密码是自动生成的，在 log 中查找：

```bash
docker compose logs app
# macOS / Linux ：
docker compose logs app | grep "admin password"
# Windows PowerShell ：
docker compose logs app | Select-String "admin password"
```

## 启动 flutter

```bash
cd mobile
flutter pub get
```

启动 Android 模拟器：

```bash
flutter run
```

真机或局域网调试时，把地址改成电脑的局域网 IP：

```bash
flutter run --dart-define=API_BASE_URL=http://你的电脑局域网IP:8000
```

## 项目架构

```text
IgniteNow/
├── backend/                 # FastAPI 后端服务：API、业务逻辑、AI 调度、数据统计
├── ai_service/              # Python AI 高光识别服务：字幕解析、Prompt、LLM 调用
├── frontend/
│   └── admin_web/           # React + Vite Web 工作台
├── mobile/                  # Flutter Android / Web 播放端
├── datebase/                # 数据库脚本：建表 SQL、初始化数据、迁移文件
├── assets/                  # 示例视频、字幕、截图和演示素材
├── docs/
│   ├── PROGRESS.md          # 开发进度
│   ├── API_CONTRACT.md      # API 契约
│   ├── HIGHLIGHT_SCHEMA.json # 高光结构约束
│   ├── DECISIONS.md         # 技术决策记录
│   └── 原始开发文档 v1.1.md
├── docker-compose.yml       # Docker Compose 本地编排入口
├── .env.example             # 本地环境变量示例
├── .dockerignore
├── .gitignore
├── AGENTS.md
└── README.md
```
