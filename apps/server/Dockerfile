FROM node:22-alpine AS base

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps/server/package.json apps/server/package.json

RUN pnpm install --frozen-lockfile

COPY apps/server apps/server

RUN pnpm --filter server prisma:generate
RUN pnpm --filter server build

EXPOSE 3000

CMD ["pnpm", "--filter", "server", "start"]
