"""Vercel entry point: the backend API plus the built React frontend in one app.

Vercel runs this as a single function and serves the mounted frontend files
from its CDN. Locally and in Docker the backend runs on its own instead.
"""

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app as api  # noqa: E402

app = FastAPI(title=api.title)
app.include_router(api.router)

# Declared after the API routes, so /api/... always reaches the backend.
app.mount("/", StaticFiles(directory=ROOT / "frontend" / "dist", html=True), name="frontend")
