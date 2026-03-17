# app/Dockerfile
# Build context: monorepo root (.)

# ── Base ──────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /monorepo

# ── Dependencies (cached layer) ──────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/
# Include shared packages if referenced
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @stept/app...

# ── Build (production assets) ────────────────────────
FROM deps AS build
COPY app/ app/
COPY packages/shared/ packages/shared/
ENV VITE_API_URL="" \
    VITE_API_BASE_URL="/api/v1"
RUN pnpm --filter @stept/app build

# ── Dev (used by docker-compose.dev.yml) ─────────────
FROM deps AS dev
# Source code mounted via volume at runtime.
# Entrypoint re-installs deps after mount (volume overwrites node_modules).
CMD ["sh", "-c", "pnpm install --filter @stept/app... && exec pnpm --filter @stept/app dev --host 0.0.0.0 --port 5173"]

# ── Production ───────────────────────────────────────
FROM nginx:alpine AS production
COPY --from=build /monorepo/app/dist /usr/share/nginx/html
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
