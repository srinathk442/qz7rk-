FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_URL=sqlite:////srv/db/users.db

WORKDIR /srv

# Install dependencies first so this layer is cached between code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data ./data

# /srv/db holds the user accounts database (a volume in docker-compose.yml).
RUN useradd --create-home appuser && mkdir /srv/db && chown appuser /srv/db
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
