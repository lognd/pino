FROM python:3.12-slim AS build

RUN pip install --no-cache-dir uv
WORKDIR /app
COPY pyproject.toml ./
COPY src/ ./src/
RUN uv sync --frozen --no-dev || uv sync --no-dev

FROM python:3.12-slim

# LaTeX toolchain for professional invoice PDFs (see
# domain/invoices/pdf/renderer.py's doc comment for why LaTeX over a
# pure-Python PDF library) -- latexmk drives the compile, the three
# texlive-* packages cover melpinoinvoice.cls's own \RequirePackage list
# (geometry, xcolor, tabularx, booktabs, hyperref, fancyhdr, lmodern).
# This is a genuinely large image layer (order of ~1GB) -- an accepted
# tradeoff for PDF output quality, not an oversight. CRIB: logand.app
# backend/Dockerfile -- same layer, same reasoning.
RUN apt-get update && apt-get install -y --no-install-recommends \
    latexmk \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/false appuser
WORKDIR /app
COPY --from=build /app /app
# Named volumes (app_logs, storage_data in docker-compose.yml) mount over
# these paths on first run and inherit whatever ownership exists here at
# that moment -- create them now, owned by appuser, since the process
# runs as appuser (not root) below and would otherwise get
# PermissionError writing its own log file.
RUN mkdir -p /app/logs /app/data/storage && chown -R appuser:appuser /app/logs /app/data/storage
# alembic.ini's script_location (src/melpino_backend/db/migrations) is
# relative to the CWD alembic is invoked from -- this must be COPIED into
# the image or `alembic upgrade head` has nothing to run against even if
# invoked. CRIB: logand.app backend/Dockerfile -- that repo previously
# shipped without this line and the deployed stack silently never
# migrated; do not repeat that mistake here.
COPY alembic.ini ./
ENV PATH="/app/.venv/bin:${PATH}"

# Baked in at image-build time (deploy workflow passes
# --build-arg GIT_COMMIT=${{ github.sha }}) since the built image has no
# .git directory to introspect at runtime.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

USER appuser

EXPOSE 8000
# Migrate THEN serve, every container start -- idempotent (alembic no-ops
# once the DB is already at head), so a fresh docker-compose stack (test
# or real) never needs a separate manual/CI migration step someone could
# forget to run before the app's first request.
CMD ["sh", "-c", "alembic upgrade head && uvicorn melpino_backend.asgi:app --host 0.0.0.0 --port 8000"]
