"""
FastAPI Application Entrypoint per SPEC §1, §4 and Phase 2.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.ingest.pipeline import startup_recovery, PROCESS_POOL
from app.api.ingest import router as ingest_router
from app.api.jobs import router as jobs_router
from app.api.matches import router as matches_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    init_db()
    startup_recovery()
    yield
    # Shutdown actions
    PROCESS_POOL.shutdown(wait=False)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Local-Scope API",
        description="Local-Scope CS2 Demo Parser & Analytics API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS configuration
    # Never allow wildcard origin when allow_credentials=True per CORS specifications
    explicit_origins = [o.strip() for o in settings.cors_origins if o.strip() and o.strip() != "*"]
    if not explicit_origins:
        explicit_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

    origin_regex = (
        settings.cors_origin_regex.strip()
        if settings.cors_origin_regex and settings.cors_origin_regex.strip()
        else None
    )
    if origin_regex == ".*" or origin_regex == "^.*$":
        origin_regex = None

    app.add_middleware(
        CORSMiddleware,
        allow_origins=explicit_origins,
        allow_origin_regex=origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health check endpoint per Phase 2 requirement
    @app.get("/api/health", tags=["health"])
    def health_check():
        return {"status": "ok"}

    # Include API Routers
    app.include_router(ingest_router)
    app.include_router(jobs_router)
    app.include_router(matches_router)

    return app


app = create_app()
