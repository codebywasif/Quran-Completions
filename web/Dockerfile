# Build context must be the repository ROOT (see docker-compose.yml).
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Full workspace install (see api/Dockerfile note) so the web toolchain
# (tsc, vite) is correctly linked.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY web/package.json ./web/
COPY api/package.json ./api/
RUN pnpm install --frozen-lockfile

COPY web ./web
RUN pnpm --filter web run build

# --- Serve the static build with nginx ---
FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
