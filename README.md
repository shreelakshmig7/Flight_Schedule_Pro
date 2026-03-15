# Agentic Scheduler for Flight Schedule Pro (FSP)
## Phase 1 MVP

A multi-tenant SaaS application that integrates with Flight Schedule Pro (FSP) to automate and optimise flight school scheduling. The system monitors schedule state, detects cancellations and openings, generates AI-powered scheduling suggestions with plain-English rationale, and surfaces them to human schedulers through an approval queue.

**All changes require explicit human approval before any reservation is created in FSP.**

---

## Stack

| Layer | Technology |
|---|---|
| Backend API | NestJS 10 (Fastify adapter) |
| Worker service | NestJS 10 (Fastify adapter) |
| Scheduler console | Next.js 14 (App Router) |
| Database | PostgreSQL (Prisma ORM) |
| Message queue | Azure Service Bus |
| Hosting | Azure Container Apps |
| LLM | Claude 3.5 Sonnet (`claude-3-5-sonnet-20241022`) |
| Monorepo | Turborepo + npm workspaces |

---

## Project Structure

```
fsp-agentic-scheduler/
├── apps/
│   ├── api/          # NestJS backend API
│   ├── worker/       # Background worker service
│   └── web/          # Next.js 14 scheduler console
├── packages/
│   ├── fsp-client/   # Typed FSP API client (all 19 sections)
│   ├── shared-types/ # Shared DTOs and constants
│   └── database/     # Prisma schema and client
├── eval/             # Evaluation harness
├── infrastructure/   # Azure Bicep IaC
└── tests/results/    # TDD test result archives
```

---

## Local Development Setup

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- PostgreSQL 15+
- Docker (optional, for local PostgreSQL)

### Install

```bash
npm install
```

### Configure environment

```bash
cp .env.example .env
# Edit .env with your local values
```

### Database setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed with a test operator
npm run db:seed
```

### Run all apps in development

```bash
npm run dev
```

### Individual apps

```bash
# API only
cd apps/api && npm run dev

# Worker only
cd apps/worker && npm run dev

# Web only
cd apps/web && npm run dev
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run build` | Build all workspaces via Turborepo |
| `npm run test` | Run all tests via Vitest |
| `npm run lint` | Lint all workspaces |
| `npm run dev` | Start all apps in development mode |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed the database with test data |

---

## Environment Variables

See `.env.example` for the complete list of environment variables with descriptions.

---

## Testing

This project follows strict TDD. Tests are written before implementation.

```bash
# Run all tests
npm run test

# Run tests for a specific workspace
cd apps/api && npm run test

# Results are saved to tests/results/
```

---

## Architecture

See `docs/Flight_Schedule_Pro_PRD.md` for the full product requirements and architecture documentation.

Key principles:
- FSP is the source of truth — this system never stores FSP operational data
- Every suggestion requires human scheduler approval before FSP writes
- Rate-limited polling: 55 FSP API calls/minute across all tenants
- All changes are immutably logged for FAA AC 120-78B compliance

---

## License

Proprietary — Agentic Scheduler for Flight Schedule Pro
