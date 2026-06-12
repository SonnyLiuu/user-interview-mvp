from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .db import close_pool, init_pool
from .errors import AIServiceError, BadRequestError, DatabaseUnavailableError, NotFoundError, UnauthorizedError
from .routers import call_prep, dashboard, desktop, fireflies, intake, live_sessions, onboarding, otter, outreach, outreach_projects, projects, recall, workspace, zoom_rtms

import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    await init_pool(settings)
    yield
    await close_pool()


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or get_settings()
    app = FastAPI(title="User Interview API", version="0.1.0", lifespan=lifespan)
    app.state.settings = cfg

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(projects.router)
    app.include_router(onboarding.router)
    app.include_router(intake.router)
    app.include_router(call_prep.router)
    app.include_router(desktop.router)
    app.include_router(live_sessions.router)
    app.include_router(outreach.router)
    app.include_router(outreach_projects.router)
    app.include_router(dashboard.router)
    app.include_router(workspace.router)
    app.include_router(zoom_rtms.router)
    app.include_router(recall.router)
    app.include_router(fireflies.router)
    app.include_router(otter.router)

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok"}

    @app.exception_handler(UnauthorizedError)
    async def handle_unauthorized(_request: Request, _exc: UnauthorizedError):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    @app.exception_handler(NotFoundError)
    async def handle_not_found(_request: Request, _exc: NotFoundError):
        return JSONResponse({"error": "Not found"}, status_code=404)

    @app.exception_handler(BadRequestError)
    async def handle_bad_request(_request: Request, exc: BadRequestError):
        body: dict = {"error": str(exc)}
        if exc.code:
            body["code"] = exc.code
        return JSONResponse(body, status_code=400)

    @app.exception_handler(DatabaseUnavailableError)
    async def handle_database_unavailable(_request: Request, exc: DatabaseUnavailableError):
        logger.warning("Database unavailable: %s", exc)
        return JSONResponse(
            {"error": "Database temporarily unavailable", "detail": str(exc)},
            status_code=503,
        )

    @app.exception_handler(AIServiceError)
    async def handle_ai_service_error(_request: Request, exc: AIServiceError):
        body: dict = {"error": str(exc)}
        if exc.provider:
            body["provider"] = exc.provider
        return JSONResponse(body, status_code=502)

    @app.exception_handler(Exception)
    async def handle_unhandled(_request: Request, exc: Exception):
        logger.exception("Unhandled server error")
        return JSONResponse(
            {"error": "Internal server error", "detail": str(exc)},
            status_code=500,
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
