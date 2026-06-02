from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Drama, Episode, UserAccount
from ..schemas import UploadEpisodeOut
from ..services.auth_service import require_user
from ..services.upload_service import save_subtitle_file, save_video_file
from ..services.video_service import player_video_url
from .common import ok

router = APIRouter(prefix="/uploads")


@router.post("/episodes")
async def upload_episode(
    request: Request,
    drama_id: Optional[int] = Form(default=None),
    drama_title: Optional[str] = Form(default=None),
    drama_description: str = Form(default=""),
    episode_no: int = Form(...),
    episode_title: str = Form(...),
    duration: float = Form(default=0),
    subtitle_content: str = Form(default=""),
    video_file: UploadFile = File(...),
    subtitle_file: Optional[UploadFile] = File(default=None),
    user: UserAccount = Depends(require_user),
    db: Session = Depends(get_db),
):
    if episode_no < 1:
        raise HTTPException(status_code=400, detail="episode_no must be greater than 0")
    if not episode_title.strip():
        raise HTTPException(status_code=400, detail="episode_title is required")

    if drama_id:
        drama = db.get(Drama, drama_id)
        if not drama:
            raise HTTPException(status_code=404, detail="drama not found")
    else:
        if not drama_title or not drama_title.strip():
            raise HTTPException(status_code=400, detail="drama_title is required when drama_id is omitted")
        drama = Drama(title=drama_title.strip(), description=drama_description.strip())
        db.add(drama)
        db.flush()

    video_path = await save_video_file(video_file)
    subtitle_text = subtitle_content.strip()
    subtitle_url = ""
    if subtitle_file:
        subtitle_path, subtitle_text = await save_subtitle_file(subtitle_file)
        subtitle_url = str(subtitle_path)

    episode = Episode(
        drama_id=drama.id,
        episode_no=episode_no,
        title=episode_title.strip(),
        owner_user_id=user.id,
        video_url=str(video_path),
        subtitle_url=subtitle_url,
        subtitle_content=subtitle_text,
        duration=duration,
    )
    db.add(episode)
    db.commit()
    db.refresh(episode)

    return ok(
        UploadEpisodeOut(
            drama_id=drama.id,
            episode_id=episode.id,
            video_url=player_video_url(episode, request),
            has_subtitle=bool(episode.subtitle_content or episode.subtitle_url),
        ).model_dump(),
        "episode uploaded",
    )
