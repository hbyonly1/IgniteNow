"""移动端上传接口已下线。

按 BACKEND_MOBILE_INTEGRATION_PLAN.md §5 决定，`POST /api/uploads/episodes`
已确定删除，内容上传统一由管理后台负责（`/api/admin/assets/files` 和
`/api/dramas/{drama_id}/episodes/upload`）。

本文件保留路由前缀占位，所有请求返回 410 Gone，便于调用方发现接口已废弃。
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/uploads")


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def uploads_gone(path: str):
    """移动端上传接口已下线，请使用管理后台上传功能。"""
    return JSONResponse(
        status_code=410,
        content={
            "ok": False,
            "detail": (
                "POST /api/uploads/episodes 已下线。"
                "内容上传请使用管理后台接口：POST /api/admin/assets/files 和 "
                "POST /api/dramas/{drama_id}/episodes/upload。"
            ),
        },
    )
