# Build context must be the repository ROOT (see docker-compose.yml).
FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# System Chromium for whatsapp-web.js / puppeteer (smaller & more reliable than
# downloading a bundled build). The runtime uses this via PUPPETEER_EXECUTABLE_PATH.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install the full workspace from manifests + lockfile. A full (non-filtered)
# install produces the correct pnpm symlink layout for every package's binaries
# (prisma, nest, etc.). The root pnpm config controls which package build
# scripts may run — needed for the Prisma engine download.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY api/package.json ./api/
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile

# Build the API.
COPY api ./api
RUN pnpm --filter api exec prisma generate \
  && pnpm --filter api run build

WORKDIR /app/api
ENV NODE_ENV=production
EXPOSE 3000

# Apply migrations on boot, then start. `migrate deploy` only runs pending
# migrations, so this is idempotent across restarts.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
