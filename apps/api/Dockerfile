# syntax=docker/dockerfile:1
# Construit depuis la racine du dépôt : docker build -f apps/api/Dockerfile [--target worker] .
# Node 24 exécute le TypeScript directement (type stripping) : pas d'étape de compilation.
# Deux images à partir des mêmes sources : `api` (par défaut) et `worker` (traitement des médias).

FROM node:24-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter @picturart/api...

FROM node:24-alpine AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION}
WORKDIR /repo
COPY --from=deps /repo ./
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /repo/apps/api

# Worker : ffmpeg (vidéos), libheif (HEIC d'iPhone) et le pilote VA-API Intel pour QuickSync
FROM runtime AS worker
RUN apk add --no-cache ffmpeg libheif-tools intel-media-driver
USER node
HEALTHCHECK NONE
CMD ["node", "src/worker.ts"]

FROM runtime AS api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health > /dev/null || exit 1
CMD ["node", "src/server.ts"]
