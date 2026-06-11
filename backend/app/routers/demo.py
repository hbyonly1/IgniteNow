from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Drama, Episode, InteractionTemplate
from .common import ok, require_admin

router = APIRouter()


@router.post("/demo/seed", dependencies=[Depends(require_admin)])
def seed_demo(db: Session = Depends(get_db)):
    drama = db.query(Drama).first()
    if not drama:
        drama = Drama(title="逆光归来", description="演示用短剧，覆盖冲突、反转和爽点。", cover_url="")
        db.add(drama)
        db.flush()
    episode = db.query(Episode).filter(Episode.drama_id == drama.id).first()
    if not episode:
        episode = Episode(
            drama_id=drama.id,
            episode_no=1,
            title="第 1 集 真相浮出水面",
            video_url="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
            duration=30,
            subtitle_content="1\n00:00:02,000 --> 00:00:05,000\n你竟敢羞辱她，今天我替她讨回公道。\n\n2\n00:00:08,000 --> 00:00:12,000\n所有人都以为他输了，可真正的身份终于曝光。\n\n3\n00:00:16,000 --> 00:00:20,000\n坏人终于被打脸，这一刻太爽了。\n",
        )
        db.add(episode)
    for highlight_type, button_text, effect in [
        ("conflict", "替她反击", "angry"),
        ("reversal", "反转了", "shocked"),
        ("sweet", "磕到了", "sweet"),
        ("satisfying", "爽", "satisfied"),
        ("suspense", "快更", "tense"),
    ]:
        if not db.query(InteractionTemplate).filter(InteractionTemplate.highlight_type == highlight_type).first():
            db.add(InteractionTemplate(highlight_type=highlight_type, button_text=button_text, effect=effect))
    db.commit()
    return ok({"drama_id": drama.id, "episode_id": episode.id}, "demo data ready")
