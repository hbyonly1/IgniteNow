from fastapi import APIRouter

from . import admin, analysis, analytics, auth, demo, interactions, player, publish, system, uploads

router = APIRouter(prefix="/api")
router.include_router(admin.router)
router.include_router(auth.router)
router.include_router(uploads.router)
router.include_router(player.router)
router.include_router(interactions.router)
router.include_router(analytics.router)
router.include_router(analysis.router)
router.include_router(publish.router)
router.include_router(system.router)
router.include_router(demo.router)
