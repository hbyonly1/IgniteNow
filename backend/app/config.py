import os
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./ignitenow.db")
    static_base_url: str = os.getenv("STATIC_BASE_URL", "http://localhost:8000/static")
    jwt_secret: str = os.getenv("JWT_SECRET", "ignitenow-dev-secret")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expire_minutes: int = int(os.getenv("JWT_EXPIRE_MINUTES", "120"))
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    rq_queue_name: str = os.getenv("RQ_QUEUE_NAME", "ignitenow")


settings = Settings()
