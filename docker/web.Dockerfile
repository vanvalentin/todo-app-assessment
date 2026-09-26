FROM node:24.12.0-alpine3.22 AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig packages/config/tsconfig
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/config packages/config
COPY packages/contracts packages/contracts
RUN pnpm --filter @ksat/web build

FROM nginxinc/nginx-unprivileged:1.27.5-alpine AS production

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
