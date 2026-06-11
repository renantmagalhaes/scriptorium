from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .auth import login
from .routers import admin, browse, extractions, files, search, status

app = FastAPI(title="Scriptorium", docs_url=None, redoc_url=None)

# ─── Auth ─────────────────────────────────────────────────────────────────────
app.add_api_route("/api/auth/login", login, methods=["POST"], tags=["auth"])

# ─── API routers ──────────────────────────────────────────────────────────────
app.include_router(search.router)
app.include_router(files.router)
app.include_router(status.router)
app.include_router(browse.router)
app.include_router(extractions.router)
app.include_router(admin.router)

# ─── SPA static file serving ──────────────────────────────────────────────────
# The React build (dist/) is copied into ./static/ by the Dockerfile.
# Vite bundles assets under dist/assets/ — mount that sub-directory so the
# browser can fetch hashed JS/CSS bundles directly. All other routes fall
# through to index.html so client-side routing works.
_STATIC = Path(__file__).parent.parent / "static"


if _STATIC.exists():
    app.mount("/assets", StaticFiles(directory=str(_STATIC / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa(full_path: str) -> FileResponse:
        # Serve an actual file if it exists (favicon, manifest, etc.).
        candidate = _STATIC / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_STATIC / "index.html"))
