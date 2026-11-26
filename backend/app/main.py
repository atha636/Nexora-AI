import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import account, agent, approvals, auth, dashboard, documents, emails, health, insights, leads, notifications, observability, sales, tasks, team, views, workflows
from app.core.config import get_settings
from app.core.logging_safety import install_redaction
from app.db.session import get_session_factory
from app.services.sweeper import sweep_stuck_runs

settings = get_settings()
install_redaction()
log = logging.getLogger("nexora")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """On startup, fail runs that were interrupted by a restart or a sleeping free-tier instance."""
    try:
        factory = _app.dependency_overrides.get(get_session_factory, get_session_factory)()
        with factory() as db:
            sweep_stuck_runs(db)
    except Exception:  # noqa: BLE001 - never block startup (e.g. database not migrated yet)
        log.warning("Startup sweep skipped", exc_info=False)
    yield


app = FastAPI(
    lifespan=lifespan,
    title=f"{settings.app_name} API",
    version=settings.app_version,
    description="Your Intelligent AI Agent for Business Operations.",
)


DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Adds a request id to every response and the standard browser protections."""
    request_id = uuid.uuid4().hex[:16]
    request.state.request_id = request_id
    response = await call_next(request)
    h = response.headers
    h["X-Request-ID"] = request_id
    h["X-Content-Type-Options"] = "nosniff"
    h["X-Frame-Options"] = "DENY"
    h["Referrer-Policy"] = "no-referrer"
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if not request.url.path.startswith(DOCS_PATHS):  # the docs page needs scripts, so no strict CSP there
        h["Content-Security-Policy"] = API_CSP
    if request.url.path.startswith("/api"):
        h["Cache-Control"] = "no-store"
    if settings.environment == "production":
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    """Anything unexpected becomes a generic 500. Details go to the (redacted) log, never to the client."""
    request_id = getattr(request.state, "request_id", None)
    log.error("Unhandled error on %s %s (request %s): %s", request.method, request.url.path, request_id, type(exc).__name__)
    return JSONResponse({"detail": "Something went wrong on our side.", "request_id": request_id}, status_code=500)


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
    account.router,
    leads.router,
    sales.router,
    documents.router,
    agent.router,
    dashboard.dashboard_router,
    dashboard.analytics_router,
    insights.router,
    emails.router,
    approvals.router,
    workflows.router,
    observability.router,
    notifications.router,
    tasks.router,
    views.router,
):
    app.include_router(r, prefix="/api/v1")