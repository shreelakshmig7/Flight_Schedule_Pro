# ============================================================
# apps/worker/Dockerfile
# Multi-stage build for @fsp-scheduler/worker (NestJS worker)
# Build context must be the monorepo root:
#   docker build -f apps/worker/Dockerfile .
# ============================================================

# ── Stage 1: base ────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ── Stage 2: deps ────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json            ./apps/api/
COPY apps/worker/package.json         ./apps/worker/
COPY apps/web/package.json            ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/database/package.json   ./packages/database/
COPY packages/fsp-client/package.json ./packages/fsp-client/
RUN npm ci --ignore-scripts

# ── Stage 3: builder ─────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w packages/shared-types
RUN npm run build -w packages/fsp-client
RUN npm run generate -w packages/database
RUN npm run build -w packages/database
RUN npm run build -w apps/worker

# ── Stage 4: runner ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/worker/package.json         ./apps/worker/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/database/package.json   ./packages/database/
COPY packages/fsp-client/package.json ./packages/fsp-client/
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/apps/worker/dist           ./apps/worker/dist
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/database/dist     ./packages/database/dist
COPY --from=builder /app/packages/fsp-client/dist   ./packages/fsp-client/dist

EXPOSE 3001
USER node
CMD ["node", "apps/worker/dist/main.js"]
