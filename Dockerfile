FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN CI=1 pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# Use pnpm's command resolver; node_modules/.bin/drizzle-kit is a shell shim, not JavaScript.
# Stop startup if migrations fail rather than launching against an incomplete schema.
CMD ["sh", "-c", "pnpm db:migrate && node scripts/ensure-worker-runtime-schema.mjs && node dist/index.js"]
