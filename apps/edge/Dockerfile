FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@10.28.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY reference ./reference
COPY apps/edge ./apps/edge
RUN pnpm install --filter @drm/edge... --frozen-lockfile
ENV REFERENCE_DIR=/app/reference NODE_NO_WARNINGS=1
WORKDIR /app/apps/edge
CMD ["pnpm", "start"]
