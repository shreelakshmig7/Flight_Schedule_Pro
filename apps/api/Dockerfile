# ============================================================
# apps/api/Dockerfile
# Multi-stage build for @fsp-scheduler/api (NestJS + Fastify)
# Build context must be the monorepo root:
#   docker build -f apps/api/Dockerfile .
# ============================================================

# ── Stage 1: base ────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ── Stage 2: deps ────────────────────────────────────────────
# Copy only package manifests first to maximise layer cache hits.
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
# Build workspace packages that api depends on, then build api itself
RUN npm run build -w packages/shared-types
RUN npm run build -w packages/fsp-client
RUN npm run generate -w packages/database
RUN npm run build -w packages/database
RUN npm run build -w apps/api

# ── Stage 4: runner ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Re-install production deps only (omit devDependencies)
COPY package.json package-lock.json ./
COPY apps/api/package.json            ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/database/package.json   ./packages/database/
COPY packages/fsp-client/package.json ./packages/fsp-client/
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output from builder
COPY --from=builder /app/apps/api/dist            ./apps/api/dist
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/database/dist    ./packages/database/dist
COPY --from=builder /app/packages/fsp-client/dist  ./packages/fsp-client/dist

EXPOSE 3000
USER node
CMD ["node", "apps/api/dist/main.js"]
