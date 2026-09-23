FROM node:24.12.0-alpine3.22 AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig packages/config/tsconfig
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/contracts packages/contracts

RUN pnpm --filter @ksat/api build

FROM node:24.12.0-alpine3.22 AS production

WORKDIR /workspace/apps/api
ENV NODE_ENV=production

COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/apps/api/node_modules /workspace/apps/api/node_modules
COPY --from=build /workspace/packages/contracts/node_modules /workspace/packages/contracts/node_modules
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/apps/api/prisma ./prisma
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/packages/contracts/package.json /workspace/packages/contracts/package.json
COPY --from=build /workspace/packages/contracts/dist /workspace/packages/contracts/dist

USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
