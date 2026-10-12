# syntax=docker/dockerfile:1
# Construit depuis la racine du dépôt : docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @picturart/web...
COPY design design
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @picturart/web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
