# ============================================================
# apps/web/Dockerfile
# Multi-stage build for @fsp-scheduler/web (Next.js 14)
# Build context must be the monorepo root:
#   docker build -f apps/web/Dockerfile .
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
RUN npm ci --ignore-scripts --force

# ── Stage 3: builder ─────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w packages/shared-types
RUN npm run build -w apps/web

# ── Stage 4: runner ──────────────────────────────────────────
# Use Next.js standalone output for minimal image size
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output bundles all required node_modules
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /app/apps/web/public           ./apps/web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
USER node
CMD ["node", "apps/web/server.js"]
