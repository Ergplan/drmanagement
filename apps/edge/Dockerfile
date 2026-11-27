FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@10.28.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/edge ./apps/edge
RUN pnpm install --filter @drm/edge... --frozen-lockfile
WORKDIR /app/apps/edge
CMD ["pnpm", "start"]
