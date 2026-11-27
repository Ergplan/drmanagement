# Web app (Next.js) for self-hosting on the VM, behind Caddy (HTTPS).
FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@10.28.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY reference ./reference
COPY apps/web ./apps/web
RUN pnpm install --filter @drm/web... --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1 NODE_NO_WARNINGS=1
ARG GIT_SHA=vm
ENV VERCEL_GIT_COMMIT_SHA=$GIT_SHA
RUN pnpm --filter @drm/web build
WORKDIR /app/apps/web
CMD ["pnpm", "exec", "next", "start", "-p", "3100", "-H", "127.0.0.1"]
