# syntax=docker/dockerfile:1

FROM node:22-alpine AS admin-web-builder

WORKDIR /app/frontend/admin_web

COPY frontend/admin_web/package*.json ./
RUN npm ci

COPY frontend/admin_web/ ./
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/app \
    XDG_CACHE_HOME=/app/backend/model_cache \
    HF_HOME=/app/backend/model_cache/huggingface \
    WHISPER_MODEL=tiny \
    WHISPER_DOWNLOAD_ROOT=/app/backend/model_cache/faster-whisper

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg bash libgomp1 && rm -rf /var/lib/apt/lists/*

RUN addgroup --system ignitenow && adduser --system --ingroup ignitenow ignitenow

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY ai_service ./ai_service
COPY datebase ./datebase
COPY --from=admin-web-builder /app/frontend/admin_web/dist ./frontend/admin_web/dist

RUN mkdir -p backend/uploads/videos backend/uploads/subtitles backend/logs backend/model_cache \
    && chown -R ignitenow:ignitenow /app

USER ignitenow

EXPOSE 8000

ENTRYPOINT ["bash", "backend/scripts/docker-entrypoint.sh"]
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
