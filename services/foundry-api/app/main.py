from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .db import close_pool, init_pool
from .errors import BadRequestError, NotFoundError, UnauthorizedError
from .routers import briefs, dashboard, intake, onboarding, projects, workspace


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    await init_pool(settings)
    yield
    await close_pool()


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or get_settings()
    app = FastAPI(title="Startup Foundry API", version="0.1.0", lifespan=lifespan)

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
    app.include_router(briefs.router)
    app.include_router(dashboard.router)
    app.include_router(workspace.router)

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
        return JSONResponse({"error": str(exc)}, status_code=400)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
