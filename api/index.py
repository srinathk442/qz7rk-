"""Vercel entry point for the backend API.

On Vercel the React build is written to public/ and served from the CDN;
any path not found there (i.e. /api/...) reaches this FastAPI app.
Locally and in Docker the backend runs on its own instead.
"""

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app as api  # noqa: E402

app = FastAPI(title=api.title)
app.include_router(api.router)


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    # Fallback only: the CDN normally serves public/index.html for "/".
    return FileResponse(ROOT / "public" / "index.html")
