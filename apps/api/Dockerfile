# syntax=docker/dockerfile:1
# Construit depuis la racine du dépôt : docker build -f apps/api/Dockerfile .
# Node 24 exécute le TypeScript directement (type stripping) : pas d'étape de compilation.

FROM node:24-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter @picturart/api...

FROM node:24-alpine
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION}
WORKDIR /repo
COPY --from=deps /repo ./
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health > /dev/null || exit 1
CMD ["node", "src/server.ts"]
