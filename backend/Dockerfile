FROM python:3.12-slim-bookworm

# GDAL/GEOS/PROJ para GeoDjango.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gdal-bin libgdal32 libgeos-c1v5 libproj25 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "uv>=0.8,<0.9"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

RUN useradd --system --uid 1000 --home /app app \
    && mkdir -p /data/static /data/media \
    && chown -R app:app /data
USER app

ENV STATIC_ROOT=/data/static \
    MEDIA_ROOT=/data/media

EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-"]
