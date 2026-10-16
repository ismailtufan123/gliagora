# syntax=docker/dockerfile:1
# Production image for the Next.js + Payload app. Built in GitHub Actions and pushed to GHCR;
# the server only pulls and runs it (PLAN §11.7.1).

# Node.js 24 LTS on Alpine, pinned by digest (PLAN §18.2).
ARG NODE_IMAGE=node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# 1. Dependencies, cached as long as the lockfile does not change.
FROM base AS deps
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 2. Build. No database or secrets are needed at build time.
FROM base AS build
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# 3. Runtime: only the standalone server, static files and public assets.
# NEXT_TRAILING_SLASH: withPayload sets it only while next.config.ts runs, which the standalone
# server does not; Payload's own links (password-reset emails, sign-in redirects) then end with
# the slash every address has (trailingSlash) instead of being redirected.
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TRAILING_SLASH=true
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# The operations script (M7): `docker compose exec app node ops/call.mjs …` (src/lib/ops/auth.ts).
COPY --from=build --chown=node:node /app/ops ./ops
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/health/ || exit 1
CMD ["node", "server.js"]
