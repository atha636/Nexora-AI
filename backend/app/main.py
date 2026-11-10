from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, dashboard, health, leads, sales, team
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=f"{settings.app_name} API",
    version=settings.app_version,
    description="Your Intelligent AI Agent for Business Operations.",
)

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
    dashboard.dashboard_router,
    dashboard.analytics_router,
):
    app.include_router(r, prefix="/api/v1")