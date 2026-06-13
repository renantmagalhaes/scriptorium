# ─── Stage 1: build the React SPA ─────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install --ignore-scripts
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Python / FastAPI backend ────────────────────────────────────────
FROM python:3.12-slim AS app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1000 app \
    && useradd -u 1000 -g app -s /sbin/nologin -M app

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app/ ./app/
# Copy the compiled SPA into the location FastAPI serves as static files.
COPY --from=frontend /frontend/dist/ ./static/
# Copy worker's ocr module to share the supported extensions list
COPY worker/ocr/ ./ocr/

USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
