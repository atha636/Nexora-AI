from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, dashboard, documents, health, leads, sales, team
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=f"{settings.app_name} API",
    version=settings.app_version,
    description="Your Intelligent AI Agent for Business Operations.",
)


@app.middleware("http")
async def reject_oversized_uploads(request: Request, call_next):
    """Cheap early rejection using the Content-Length header, before the body is read.
    (The upload endpoint also enforces the real limit on the bytes it receives.)"""
    if request.url.path.endswith("/documents/upload"):
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > settings.max_upload_bytes + 1024 * 1024:
            return JSONResponse({"detail": "The file is too large."}, status_code=413)
    return await call_next(request)


# Added AFTER the middleware above so CORS is the outermost layer: even the 413 reply above
# then carries CORS headers and the browser can show the real error message.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


for r in (
    health.router,
    auth.router,
    team.router,
    leads.router,
    sales.router,
    documents.router,
    dashboard.dashboard_router,
    dashboard.analytics_router,
):
    app.include_router(r, prefix="/api/v1")