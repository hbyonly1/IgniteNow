import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import FileResponse

from .core.logger import setup_logger
from .database import Base, engine
from .middleware.logging_middleware import LoggingMiddleware
from .routers.api import router
from .schema_compat import ensure_app_schema

Base.metadata.create_all(bind=engine)
ensure_app_schema(engine)


class SpaStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and "." not in Path(path).name:
                return FileResponse(Path(self.directory) / "index.html")
            raise


async def _scheduled_publish_loop() -> None:
    """后台定时任务：每分钟扫描并执行到期的定时发布单。"""
    from .jobs.tasks import run_scheduled_publish

    while True:
        try:
            await asyncio.sleep(60)
            await asyncio.to_thread(run_scheduled_publish)
        except asyncio.CancelledError:
            break
        except Exception:
            pass  # 异常不影响下一轮扫描


@asynccontextmanager
async def lifespan(app: FastAPI):
    import shutil
    import logging
    if not shutil.which("ffprobe"):
        logging.warning(
            "⚠️  ffprobe not found in PATH. Video metadata parsing will fallback to default values. "
            "Please install ffmpeg (e.g. brew install ffmpeg) for accurate video durations."
        )

    task = asyncio.create_task(_scheduled_publish_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


setup_logger()

app = FastAPI(title="IgniteNow API", version="0.1.0", lifespan=lifespan)
app.add_middleware(LoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "IgniteNow API"}


admin_dist = Path(__file__).resolve().parents[2] / "frontend" / "admin_web" / "dist"
uploads_dir = Path(__file__).resolve().parents[1] / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
if admin_dist.exists():
    app.mount("/", SpaStaticFiles(directory=admin_dist, html=True), name="admin_web")
