from collections.abc import Iterator
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite://")

from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app.models import Drama, Episode, HighlightEvent, UserAccount
from backend.app.services.auth_service import create_access_token, hash_password


@pytest.fixture()
def db_session() -> Iterator[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _auth_headers_for_role(db_session: Session, username: str, role: str) -> dict[str, str]:
    user = UserAccount(username=username, password_hash=hash_password("secret123"), role=role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(user)}"}


@pytest.fixture()
def admin_headers(db_session: Session) -> dict[str, str]:
    return _auth_headers_for_role(db_session, "admin-user", "admin")


@pytest.fixture()
def uploader_headers(db_session: Session) -> dict[str, str]:
    return _auth_headers_for_role(db_session, "uploader-user", "uploader")


@pytest.fixture()
def demo_episode(db_session: Session) -> Episode:
    drama = Drama(title="Test Drama", description="pytest")
    episode = Episode(
        drama=drama,
        episode_no=1,
        title="E001",
        video_url="https://example.com/video.mp4",
        subtitle_content="",
        duration=30,
    )
    db_session.add_all([drama, episode])
    db_session.flush()
    db_session.add_all(
        [
            HighlightEvent(
                episode_id=episode.id,
                start_time=3,
                end_time=5,
                highlight_type="reversal",
                emotion="shock",
                intensity=0.8,
                confidence=0.9,
                trigger_score=0.7,
                reason="review-only",
                button_text="反转了",
                effect="shocked",
                status="published",
            ),
            HighlightEvent(
                episode_id=episode.id,
                start_time=8,
                end_time=10,
                highlight_type="sweet",
                emotion="warm",
                intensity=0.6,
                confidence=0.8,
                trigger_score=0.6,
                reason="draft-only",
                button_text="磕到了",
                effect="sweet",
                status="draft",
            ),
            HighlightEvent(
                episode_id=episode.id,
                start_time=12,
                end_time=14,
                highlight_type="conflict",
                emotion="angry",
                intensity=0.7,
                confidence=0.8,
                trigger_score=0.6,
                reason="rejected-only",
                button_text="替她反击",
                effect="angry",
                status="rejected",
            ),
        ]
    )
    db_session.commit()
    db_session.refresh(episode)
    return episode
