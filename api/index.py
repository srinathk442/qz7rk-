"""Vercel entry point: the backend API plus the built React frontend in one app.

Vercel runs this as a single function that serves both /api/... and the built
frontend files. Locally and in Docker the backend runs on its own instead.
"""

import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app as api  # noqa: E402

# Vite puts a content hash in every /assets/ filename, so a file never changes
# once built. s-maxage lets Vercel's CDN serve them instead of this function.
IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable"

app = FastAPI(title=api.title)
app.include_router(api.router)


@app.middleware("http")
async def cache_hashed_assets(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/assets/") and response.status_code == 200:
        response.headers["Cache-Control"] = IMMUTABLE
    return response

# Declared after the API routes, so /api/... always reaches the backend.
app.mount("/", StaticFiles(directory=ROOT / "frontend" / "dist", html=True), name="frontend")
