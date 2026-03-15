# Agentic Scheduler for Flight Schedule Pro (FSP)
## Product Requirements Document — Phase 1 MVP

**Stack:** TypeScript · NestJS · Next.js 14 · PostgreSQL · Azure Service Bus · Azure Container Apps  
**LLM:** Claude 3.5 Sonnet (`claude-3-5-sonnet-20241022`)  
**FSP Integration:** REST API (19 sections) · Polling-based detection · Suggest-and-approve model

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Data Model](#4-data-model)
5. [Environment Variables](#5-environment-variables)
6. [How to Read This Document](#6-how-to-read-this-document)
7. [PRs](#7-prs)

---

## 1. Project Overview

The Agentic Scheduler is an independently deployable, multi-tenant SaaS application that integrates with Flight Schedule Pro (FSP) to automate and optimise flight school scheduling. The system monitors schedule state across all operator tenants, detects cancellations and openings, generates suggested schedule adjustments with plain-English rationale, and surfaces those suggestions to human schedulers through an in-app approval queue.

All changes require explicit human approval before any reservation is created or modified in FSP. FSP remains the authoritative source of truth for all operational data. This system stores only derived artefacts: suggestions, audit logs, operator policy configuration, and communication records.

**Users:**

| Role | Interaction |
|---|---|
| Scheduler / Dispatch | Reviews and approves suggestions in the console |
| Student | Receives offer and confirmation via email or SMS |
| Prospect | Requests discovery flight; receives confirmation |
| Instructor | Receives confirmation of scheduling changes |
| Manager / Owner | Monitors performance via operator dashboard |

**Four MVP use cases:**

- **A. Waitlist Automation** — When a slot opens, rank eligible students and propose a booking
- **B. Reschedule on Cancellation** — When a reservation is cancelled, generate compatible alternatives for the affected student
- **C. Discovery Flight Booking** — When a prospect requests a first flight, generate daylight-only options with eligible instructor and aircraft pairings
- **D. Schedule Next Lesson on Completion** — When a lesson is completed, determine the next required training event and propose scheduling options

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Azure Container Apps                      │
│                                                                   │
│  ┌─────────────────┐        ┌──────────────────────────────┐    │
│  │   Next.js 14    │        │         NestJS API            │    │
│  │ Scheduler       │◄──────►│  - Auth / tenant middleware   │    │
│  │ Console (UI)    │        │  - Suggestion controller      │    │
│  └─────────────────┘        │  - Operator config controller │    │
│                              │  - Audit log controller       │    │
│                              └──────────────┬───────────────┘    │
│                                             │                     │
│                    ┌────────────────────────▼──────────────┐     │
│                    │         Azure Service Bus              │     │
│                    │  Queues: PollJobs · ChangeEvents ·    │     │
│                    │          SuggestionResults             │     │
│                    └────────────────────────┬──────────────┘     │
│                                             │                     │
│              ┌──────────────────────────────▼──────────────┐     │
│              │              Worker Service                   │     │
│              │  - Rate-limited polling dispatcher            │     │
│              │  - Change detection engine                    │     │
│              │  - Suggestion generation engine               │     │
│              │  - LLM rationale generator                    │     │
│              │  - Notification dispatcher                    │     │
│              └──────────────────────────────────────────────┘     │
│                                                                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
           ┌────────────────▼──────────────────┐
           │         PostgreSQL                 │
           │  operators · suggestions ·         │
           │  audit_log · discovery_prospects · │
           │  communications                    │
           └───────────────────────────────────┘
                            │
           ┌────────────────▼──────────────────┐
           │         FSP REST API               │
           │  Source of truth for all           │
           │  operational data                  │
           └───────────────────────────────────┘
```

**Key architectural principles:**

- FSP is the source of truth. This system never holds a copy of FSP operational data — it reads on demand.
- The polling dispatcher maintains a token bucket capped at 55 calls/min across all tenants to respect FSP's 60 calls/60 seconds rate limit.
- Every suggestion passes through a validate-only FSP call before being surfaced to the scheduler. No reservation is created without explicit approval.
- The suggestion state machine is: `PENDING → APPROVED / REJECTED / EXPIRED`.
- All writes to the audit log are append-only. No record is ever updated or deleted.

---

## 3. Monorepo Structure

```
fsp-agentic-scheduler/
├── apps/
│   ├── api/                          # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/                 # FSP token validation, tenant middleware
│   │   │   ├── suggestions/          # Suggestion CRUD, state machine
│   │   │   ├── operators/            # Operator config, policy weights
│   │   │   ├── audit/                # Audit log controller
│   │   │   ├── dashboard/            # C_util, acceptance rate, metrics
│   │   │   └── main.ts
│   │   └── test/
│   ├── worker/                       # Background worker service
│   │   ├── src/
│   │   │   ├── polling/              # Dispatcher, tier classification, token bucket
│   │   │   ├── detection/            # Change detection, state diff
│   │   │   ├── suggestions/          # Use case handlers A, B, C, D
│   │   │   ├── llm/                  # Claude 3.5 Sonnet rationale generator
│   │   │   ├── notifications/        # Email + SMS dispatch
│   │   │   └── main.ts
│   │   └── test/
│   └── web/                          # Next.js 14 scheduler console
│       ├── src/
│       │   ├── app/
│       │   │   ├── queue/            # Approval queue UI
│       │   │   ├── config/           # Operator configuration UI
│       │   │   └── dashboard/        # Metrics dashboard
│       │   └── components/
│       └── test/
├── packages/
│   ├── fsp-client/                   # Typed FSP API client (all 19 sections)
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── reservations/
│   │   │   ├── availability/
│   │   │   ├── scheduling/
│   │   │   ├── enrollment/
│   │   │   ├── weather/
│   │   │   └── index.ts
│   │   └── test/
│   ├── shared-types/                 # Shared DTOs across all apps
│   │   └── src/
│   │       ├── suggestion.types.ts
│   │       ├── operator.types.ts
│   │       ├── fsp.types.ts
│   │       └── index.ts
│   └── database/                     # Prisma schema + migrations
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       └── src/
│           └── index.ts
├── eval/                             # Evaluation harness
│   ├── golden_data.yaml
│   ├── run_eval.py
│   ├── __init__.py
│   └── DATASET_README.md
├── infrastructure/                   # Azure Bicep / Terraform IaC
│   ├── main.bicep
│   ├── container-apps.bicep
│   ├── service-bus.bicep
│   ├── postgresql.bicep
│   └── keyvault.bicep
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── .env.example
├── turbo.json                        # Turborepo config
├── package.json
└── README.md
```

---

## 4. Data Model

All entities live in PostgreSQL. FSP operational data is never stored here — only derived artefacts.

### 4.1 operators

Stores per-tenant configuration and polling state.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, auto-generated | Internal operator ID |
| fsp_operator_id | INTEGER | UNIQUE, NOT NULL | FSP operatorId — tenant identifier |
| name | VARCHAR(255) | NOT NULL | Operator display name |
| polling_tier | ENUM('TIER1','TIER2','TIER3') | NOT NULL, DEFAULT 'TIER2' | Polling cadence tier |
| last_polled_at | TIMESTAMPTZ | NULLABLE | Last successful poll timestamp |
| last_poll_hash | TEXT | NULLABLE | Hash of last reservations response for change detection |
| priority_weights | JSONB | NOT NULL, DEFAULT '{}' | Configurable waitlist ranking weights |
| policy_config | JSONB | NOT NULL, DEFAULT '{}' | Operator scheduling policy settings |
| fsp_subscription_key_ref | VARCHAR(500) | NOT NULL | Azure Key Vault reference for FSP subscription key |
| notification_config | JSONB | NOT NULL, DEFAULT '{}' | Email/SMS preferences and branding |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Whether polling is active for this tenant |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |

### 4.2 suggestions

Core suggestion artefact produced by the agent.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, auto-generated | Suggestion ID |
| operator_id | UUID | FK → operators.id, NOT NULL | Tenant reference |
| use_case_type | ENUM('WAITLIST','RESCHEDULE','DISCOVERY','NEXT_LESSON') | NOT NULL | Which use case generated this |
| status | ENUM('PENDING','APPROVED','REJECTED','EXPIRED') | NOT NULL, DEFAULT 'PENDING' | Current state |
| candidate_payload | JSONB | NOT NULL | Full candidate data: studentId, slotStart, slotEnd, aircraftId, instructorId, locationId |
| rationale | TEXT | NOT NULL | Plain-English rationale from LLM or fallback template |
| confidence_score | DECIMAL(4,3) | NOT NULL | 0.000 – 1.000 |
| constraint_results | JSONB | NOT NULL | Results of each constraint check: availability, daylight, aircraft, instructor, activity type |
| fsp_validate_result | JSONB | NULLABLE | Response from FSP validateOnly call |
| fsp_reservation_id | VARCHAR(255) | NULLABLE | FSP reservation ID once approved and created |
| resolved_by | VARCHAR(255) | NULLABLE | FSP userId of scheduler who approved/rejected |
| resolved_at | TIMESTAMPTZ | NULLABLE | Timestamp of approval or rejection |
| rejection_reason | TEXT | NULLABLE | Scheduler-provided rejection reason |
| expires_at | TIMESTAMPTZ | NOT NULL | Auto-expire time (configurable per operator) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Suggestion creation timestamp |

### 4.3 audit_log

Immutable append-only event log. No updates or deletes permitted.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, auto-generated | Log entry ID |
| operator_id | UUID | FK → operators.id, NOT NULL | Tenant reference |
| event_type | VARCHAR(100) | NOT NULL | e.g. SUGGESTION_CREATED, SUGGESTION_APPROVED, RESERVATION_CREATED, NOTIFICATION_SENT |
| actor_id | VARCHAR(255) | NULLABLE | FSP userId of actor (NULL for system events) |
| suggestion_id | UUID | FK → suggestions.id, NULLABLE | Related suggestion if applicable |
| payload | JSONB | NOT NULL | Full event context |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Immutable timestamp |

### 4.4 discovery_prospects

Stores prospect data for discovery flights — fields FSP does not natively support.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, auto-generated | Prospect ID |
| operator_id | UUID | FK → operators.id, NOT NULL | Tenant reference |
| first_name | VARCHAR(100) | NOT NULL | Prospect first name |
| last_name | VARCHAR(100) | NOT NULL | Prospect last name |
| email | VARCHAR(255) | NOT NULL | Contact email |
| phone | VARCHAR(50) | NULLABLE | Contact phone |
| preferred_dates | JSONB | NULLABLE | Array of preferred date ranges |
| payment_status | ENUM('PENDING','CONFIRMED','WAIVED') | NOT NULL, DEFAULT 'PENDING' | External payment status marker |
| consent_marketing | BOOLEAN | NOT NULL, DEFAULT false | Marketing consent flag |
| lead_source | VARCHAR(100) | NULLABLE | How the prospect found the school |
| notes | TEXT | NULLABLE | Free-text operator notes |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

### 4.5 communications

Record of every email and SMS sent by the system.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, auto-generated | Communication ID |
| operator_id | UUID | FK → operators.id, NOT NULL | Tenant reference |
| suggestion_id | UUID | FK → suggestions.id, NULLABLE | Related suggestion if applicable |
| channel | ENUM('EMAIL','SMS') | NOT NULL | Delivery channel |
| recipient_id | VARCHAR(255) | NOT NULL | FSP userId or prospect ID |
| recipient_address | VARCHAR(255) | NOT NULL | Email address or phone number |
| template_id | VARCHAR(100) | NOT NULL | Template identifier used |
| rendered_content | TEXT | NOT NULL | Final rendered message content |
| status | ENUM('SENT','DELIVERED','FAILED') | NOT NULL | Delivery status |
| provider_message_id | VARCHAR(255) | NULLABLE | Provider-assigned message ID for tracking |
| sent_at | TIMESTAMPTZ | NOT NULL | Send timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last status update |

---

## 5. Environment Variables

| Variable | Description | Example |
|---|---|---|
| `FSP_API_BASE_URL` | FSP authentication gateway (Azure APIM) | `https://development-fsp.azure-api.net` |
| `FSP_CORE_BASE_URL` | FSP direct API base URL | `https://api-develop.flightschedulepro.com` |
| `FSP_CURRICULUM_BASE_URL` | FSP curriculum and enrollment API | `https://curriculum-api-develop.flightschedulepro.com` |
| `FSP_SUBSCRIPTION_KEY` | FSP API subscription key (x-subscription-key header) | `your-subscription-key` |
| `FSP_ENVIRONMENT` | FSP environment identifier | `develop` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/fsp_scheduler` |
| `AZURE_SERVICE_BUS_CONNECTION_STRING` | Service Bus connection string | `Endpoint=sb://...` |
| `AZURE_SERVICE_BUS_POLL_QUEUE` | Poll jobs queue name | `poll-jobs` |
| `AZURE_SERVICE_BUS_CHANGE_QUEUE` | Change events queue name | `change-events` |
| `AZURE_SERVICE_BUS_SUGGESTION_QUEUE` | Suggestion results queue name | `suggestion-results` |
| `ANTHROPIC_API_KEY` | Claude 3.5 Sonnet API key | `sk-ant-...` |
| `ANTHROPIC_MODEL` | LLM model identifier | `claude-3-5-sonnet-20241022` |
| `JWT_SECRET` | JWT signing secret for console auth | `your-jwt-secret` |
| `AZURE_KEY_VAULT_URL` | Key Vault endpoint | `https://fsp-scheduler-kv.vault.azure.net` |
| `SMS_PROVIDER` | SMS provider selection | `azure` or `twilio` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID (if SMS_PROVIDER=twilio) | `AC...` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token (if SMS_PROVIDER=twilio) | `your-token` |
| `TWILIO_FROM_NUMBER` | Twilio sender number | `+1...` |
| `AZURE_COMMUNICATION_CONNECTION_STRING` | Azure Communication Services (if SMS_PROVIDER=azure) | `endpoint=https://...` |
| `APPINSIGHTS_CONNECTION_STRING` | Azure Application Insights | `InstrumentationKey=...` |
| `POLLING_RATE_LIMIT` | Max FSP API calls per minute | `55` |
| `TIER1_POLL_INTERVAL_SECONDS` | Tier 1 polling interval | `60` |
| `TIER2_POLL_INTERVAL_SECONDS` | Tier 2 polling interval | `300` |
| `TIER3_POLL_INTERVAL_SECONDS` | Tier 3 polling interval | `1800` |
| `SUGGESTION_EXPIRY_HOURS` | Hours before a PENDING suggestion auto-expires | `24` |
| `PORT` | API server port | `3000` |
| `NODE_ENV` | Environment | `development` / `production` |

---

## 6. How to Read This Document

Each PR represents one atomic, deployable unit of work. A PR is complete when every item in its acceptance criteria is satisfied. PRs must be implemented in dependency order — a PR cannot be started until all PRs listed in its Dependencies field are merged.

Each PR contains:

- **What** — what is being built in this PR
- **Why** — the purpose of this PR and what it unlocks for subsequent PRs
- **Scope In** — everything that must be implemented in this PR
- **Scope Out** — what is explicitly deferred, with a reference to which PR covers it
- **Technical Detail** — key implementation patterns, constraints, and decisions the implementer must follow
- **Dependencies** — PRs that must be merged before this one starts
- **Acceptance Criteria** — the precise conditions that confirm this PR is complete and correct, combining behavioural statements and measurable checks

---

## 7. PRs

---

### PR 1 — Monorepo Setup

**What**
Initialise the monorepo with Turborepo, create all application and package workspaces, configure TypeScript in strict mode across all packages, and establish shared tooling (ESLint, Prettier, Vitest).

**Why**
Every subsequent PR depends on the monorepo structure being in place. Shared types, the FSP client, and the database package must exist as importable workspaces before any application code is written. Getting this right upfront prevents DTO drift across the API, worker, and web apps.

**Scope In**
- Turborepo initialisation with `turbo.json` pipeline configuration for `build`, `test`, `lint`, and `dev` tasks
- Workspace structure: `apps/api`, `apps/worker`, `apps/web`, `packages/fsp-client`, `packages/shared-types`, `packages/database`
- TypeScript `tsconfig.base.json` at root with strict mode enabled; each workspace extends it
- ESLint with `@typescript-eslint` rules shared across all workspaces
- Prettier config at root
- Vitest config at root with workspace-level test discovery
- `package.json` at root with all workspace scripts
- `.env.example` with all variables listed in Section 5
- `README.md` with project setup instructions, local development guide, and environment variable reference
- NestJS scaffold in `apps/api` — empty module, empty controller, `main.ts` bootstrapping on configured PORT
- NestJS scaffold in `apps/worker` — empty module, `main.ts`
- Next.js 14 scaffold in `apps/web` with App Router enabled
- Empty package scaffolds for `packages/fsp-client`, `packages/shared-types`, `packages/database` with `index.ts` exports
- `eval/` folder with empty `__init__.py`, placeholder `golden_data.yaml`, and placeholder `run_eval.py`

**Scope Out**
- CI/CD pipeline configuration — covered in PR 3
- Azure infrastructure provisioning — covered in PR 2
- Any application logic — covered in subsequent PRs
- Database schema — covered in PR 5
- FSP API client implementation — covered in PR 6

**Technical Detail**
- Use Turborepo with `npm` workspaces. Each app and package is a separate workspace with its own `package.json`.
- `packages/shared-types` must be imported by all three apps. No app imports directly from another app.
- `packages/database` exports the Prisma client instance only. Schema is defined here; no other package defines database models.
- `packages/fsp-client` has zero dependencies on any app — it is a pure API client library.
- All internal package imports use workspace protocol: `"@fsp-scheduler/shared-types": "workspace:*"`.
- The `apps/web` Next.js app uses the App Router exclusively. Pages Router must not be used.
- NestJS apps use the `@nestjs/platform-fastify` adapter, not Express, for performance.

**Dependencies**
None — this is the foundation PR.

**Acceptance Criteria**
- `npm run build` from the root completes without errors across all workspaces
- `npm run test` from the root runs Vitest and exits 0 (no tests yet — just confirms harness works)
- `npm run lint` from the root passes across all workspaces
- Each workspace can import from `@fsp-scheduler/shared-types` and `@fsp-scheduler/fsp-client` without TypeScript errors
- `apps/api` starts on PORT from `.env` and returns 200 on `GET /health`
- `apps/worker` starts without errors
- `apps/web` starts and renders a blank page without errors
- `.env.example` contains every variable listed in Section 5

---

### PR 2 — Azure Infrastructure Provisioning

**What**
Provision all Azure resources required to run the application: Container Apps environment, PostgreSQL Flexible Server, Service Bus namespace and queues, Key Vault, App Configuration, and Application Insights — all defined as Infrastructure as Code.

**Why**
The application must be deployed to Azure before any feature work begins. All subsequent PRs deploy on top of this infrastructure. Defining it as IaC ensures environments are reproducible, consistent across develop/staging/production, and can be torn down and recreated.

**Scope In**
- Azure Bicep templates in `infrastructure/`:
  - `main.bicep` — entry point, orchestrates all modules
  - `container-apps.bicep` — Container Apps environment, two Container App definitions (api, worker), one Container App definition (web)
  - `service-bus.bicep` — Standard tier Service Bus namespace, three queues: `poll-jobs`, `change-events`, `suggestion-results`
  - `postgresql.bicep` — PostgreSQL Flexible Server, database named `fsp_scheduler`, firewall rules
  - `keyvault.bicep` — Key Vault, access policies for Container Apps managed identities
  - `appinsights.bicep` — Application Insights workspace linked to Log Analytics
- All resources tagged with `environment`, `project`, and `managed-by` tags
- Managed identities assigned to all Container Apps for Key Vault access — no connection strings in app settings
- All secrets (FSP subscription key, Anthropic API key, database password) stored in Key Vault, referenced via Key Vault references in Container Apps configuration
- `infrastructure/README.md` documenting how to deploy to each environment

**Scope Out**
- Application container images — built and deployed in PR 3
- Database schema creation — covered in PR 5
- Any application-level Service Bus consumers — covered in PR 6 and onwards

**Technical Detail**
- Use Azure Container Apps with consumption plan for cost efficiency at MVP scale.
- PostgreSQL Flexible Server must be provisioned with the `GeneralPurpose_Standard_D2s_v3` SKU minimum for production; `Burstable_Standard_B1ms` is acceptable for develop environment.
- Service Bus must be Standard tier minimum — Basic tier does not support topics or scheduled messages.
- All three queues (`poll-jobs`, `change-events`, `suggestion-results`) must have dead-letter queues enabled with `maxDeliveryCount` set to 5.
- Key Vault must have soft-delete and purge protection enabled.
- Container Apps must have minimum 1 replica and maximum 10 replicas with CPU-based scaling rules.
- US data residency: all resources must be provisioned in `eastus` or `eastus2`.

**Dependencies**
- PR 1

**Acceptance Criteria**
- `az deployment group create` with `main.bicep` completes without errors in the develop environment
- All three Service Bus queues exist and have dead-letter queues enabled
- PostgreSQL Flexible Server is reachable from Container Apps environment
- Key Vault is provisioned with soft-delete and purge protection enabled
- Application Insights is connected and receiving heartbeat telemetry
- Container Apps managed identities can read secrets from Key Vault
- All resources are tagged correctly
- No plaintext secrets appear in any Bicep template or parameter file

---

### PR 3 — CI/CD Pipeline

**What**
Implement the full GitHub Actions CI/CD pipeline: a CI workflow that runs on every pull request, and a deploy workflow that builds and deploys all three Container Apps to Azure on merge to main.

**Why**
Every subsequent PR must go through automated quality gates before merge. Without CI, there is no safety net on the shared main branch. The deploy workflow ensures every merged change is immediately live in the develop environment.

**Scope In**
- `.github/workflows/ci.yml`:
  - Triggers on pull_request to main
  - Steps: checkout, setup Node, install dependencies, `turbo lint`, `turbo build`, `turbo test`
  - Caches node_modules and Turborepo cache between runs
- `.github/workflows/deploy.yml`:
  - Triggers on push to main
  - Builds Docker images for `apps/api`, `apps/worker`, `apps/web`
  - Pushes images to Azure Container Registry
  - Updates Container App revisions for all three apps
  - Uses OIDC-based authentication to Azure — no stored credentials
- `Dockerfile` for each app in `apps/api/`, `apps/worker/`, `apps/web/`
- Each Dockerfile uses multi-stage build: build stage installs all dependencies and compiles TypeScript; runtime stage copies only compiled output and production dependencies
- Health check endpoints used by Container Apps liveness probes:
  - `apps/api`: `GET /health` returns `{ status: "ok" }`
  - `apps/worker`: internal TCP health check on configured port

**Scope Out**
- Staging and production deployment pipelines — can be added later
- Eval pipeline integration — covered after eval files are created
- Database migration step in deploy pipeline — covered in PR 5

**Technical Detail**
- OIDC authentication to Azure uses a federated identity credential on the deploy service principal. No `AZURE_CREDENTIALS` secret with long-lived tokens.
- Turborepo remote caching should be configured if a Turborepo cache server is available; otherwise local caching is acceptable for MVP.
- Docker images must be tagged with both `latest` and the Git commit SHA for rollback capability.
- The deploy workflow must wait for health check to pass on new Container App revision before completing. If the revision fails its health check, the workflow must exit with a non-zero code.
- Container Apps rolling deployment: new revision receives 100% traffic only after health check passes.

**Dependencies**
- PR 1
- PR 2

**Acceptance Criteria**
- Every pull request triggers the CI workflow and all steps pass before merge is permitted
- Merging a PR to main triggers the deploy workflow and deploys all three apps
- `GET /health` on the deployed API returns `{ status: "ok" }` with HTTP 200
- Docker images are tagged with commit SHA and visible in Azure Container Registry
- A deliberate build failure in a PR causes the CI workflow to block the merge
- No Azure credentials are stored as GitHub secrets — OIDC authentication is used throughout
- Rollback to a previous image tag is achievable by updating the Container App revision manually

---

### PR 4 — Azure Service Bus Queue Topology

**What**
Implement the Service Bus client wrapper and define the three-queue message topology used by the polling dispatcher and suggestion engine: `poll-jobs`, `change-events`, and `suggestion-results`.

**Why**
The polling dispatcher (PR 8), change detection engine (PR 9), and suggestion engine (PRs 10–16) all communicate via Service Bus. The queue topology and typed message contracts must be established before any of those PRs begin.

**Scope In**
- Service Bus client module in `apps/worker/src/service-bus/`
- Typed message schemas for all three queues in `packages/shared-types`:
  - `PollJobMessage`: `{ operatorId: string, fspOperatorId: number, tier: 'TIER1' | 'TIER2' | 'TIER3', scheduledAt: string }`
  - `ChangeEventMessage`: `{ operatorId: string, fspOperatorId: number, changeType: 'CANCELLATION' | 'NEW_OPENING' | 'STATUS_CHANGE', reservationId: string, detectedAt: string, rawDiff: object }`
  - `SuggestionResultMessage`: `{ operatorId: string, suggestionId: string, useCaseType: string, status: 'CREATED' | 'FAILED', createdAt: string }`
- Publisher and consumer implementations for each queue
- Dead-letter queue consumer that logs unprocessable messages to Application Insights and marks them in the audit log
- Message retry configuration: maximum 5 delivery attempts, exponential backoff between retries
- Unit tests for all message schemas and queue operations using mocked Service Bus client

**Scope Out**
- Actual polling logic — covered in PR 8
- Change detection logic — covered in PR 9
- Suggestion generation logic — covered in PRs 10–16

**Technical Detail**
- Use `@azure/service-bus` SDK. Authenticate via `DefaultAzureCredential` — no connection strings in code.
- All message bodies must be JSON-serialisable. No binary payloads.
- Consumers must implement graceful shutdown: on SIGTERM, stop accepting new messages, complete in-flight messages, then exit.
- Dead-letter queue consumers run as a separate scheduled job (every 15 minutes), not a continuous listener.
- Message TTL on `poll-jobs` queue: 5 minutes. A poll job that has not been processed within 5 minutes is stale and must be discarded.
- Message TTL on `change-events` queue: 30 minutes.
- Message TTL on `suggestion-results` queue: 1 hour.

**Dependencies**
- PR 1
- PR 2
- PR 3

**Acceptance Criteria**
- A message published to `poll-jobs` is consumed and its payload is correctly deserialised into a `PollJobMessage`
- A message published to `change-events` is consumed and its payload is correctly deserialised into a `ChangeEventMessage`
- A malformed message (missing required fields) is sent to the dead-letter queue after 5 delivery attempts
- Dead-letter consumer processes the dead-lettered message and logs it to Application Insights
- Graceful shutdown: when the worker receives SIGTERM, in-flight message processing completes before the process exits
- All queue operations are covered by unit tests with mocked Service Bus client
- No connection strings appear in source code — DefaultAzureCredential is used exclusively

---

### PR 5 — Database Schema and Migrations

**What**
Define the complete Prisma schema for all five entities, generate the initial migration, and implement the database client module used by all applications.

**Why**
All application logic — suggestions, audit logging, operator configuration, discovery prospects, and communications — depends on the database schema. This must be in place before any feature PR writes to or reads from the database.

**Scope In**
- `packages/database/prisma/schema.prisma` defining all five entities exactly as specified in Section 4:
  - `operators` with all fields, enums, and constraints
  - `suggestions` with all fields, enums, and constraints
  - `audit_log` with all fields — Prisma model named `AuditLog`
  - `discovery_prospects` with all fields and enums
  - `communications` with all fields and enums
- All foreign key relationships defined with appropriate cascade behaviour
- Indexes defined on: `suggestions.operator_id`, `suggestions.status`, `suggestions.use_case_type`, `audit_log.operator_id`, `audit_log.suggestion_id`, `communications.suggestion_id`
- Initial Prisma migration generated and applied
- Database client module in `packages/database/src/index.ts` exporting a singleton Prisma client
- Database migration step added to the deploy workflow in `.github/workflows/deploy.yml` — migrations run before new container revisions receive traffic
- Seed script for local development creating one test operator record
- Prisma client imported by `apps/api` and `apps/worker` via `@fsp-scheduler/database`

**Scope Out**
- Row-level security — all tenant isolation is enforced at the application layer via `operatorId` scoping in every query
- Data seeding beyond the local development seed script
- Any application logic that reads or writes these tables — covered in subsequent PRs

**Technical Detail**
- The `audit_log` table must have a database-level trigger or application-level guard that prevents UPDATE and DELETE operations. Implement as a Prisma middleware that throws on any `update` or `delete` operation targeting `AuditLog`.
- `suggestions.candidate_payload`, `suggestions.constraint_results`, `suggestions.fsp_validate_result`, `operators.priority_weights`, `operators.policy_config`, and `operators.notification_config` are all `Json` type in Prisma. Each must have a corresponding TypeScript type defined in `packages/shared-types`.
- `suggestions.expires_at` default is `NOW() + INTERVAL '24 hours'`. This is set at the application layer, not as a database default.
- The Prisma client singleton must handle connection pooling correctly for serverless/container environments — use `PrismaClient` with connection limit configured via `DATABASE_URL` parameters.
- Migration must be idempotent — running it twice must not produce errors.

**Dependencies**
- PR 1
- PR 2
- PR 3

**Acceptance Criteria**
- `npx prisma migrate deploy` runs without errors against the provisioned PostgreSQL instance
- All five tables exist with correct columns, types, constraints, and indexes
- Foreign key constraints are enforced: inserting a `suggestion` with a non-existent `operator_id` raises a constraint violation
- Attempting to update or delete an `audit_log` record raises an error at the application layer
- The database client singleton is importable from `@fsp-scheduler/database` in both `apps/api` and `apps/worker`
- The deploy workflow runs migrations before updating Container App revisions
- Local seed script creates one operator record and is runnable via `npm run db:seed`

---

### PR 6 — FSP API Client Library

**What**
Implement the complete typed FSP API client in `packages/fsp-client`, covering all 19 API sections from the API appendix. This is the only place in the codebase that makes HTTP calls to FSP.

**Why**
Every use case handler (PRs 13–16), the polling dispatcher (PR 8), and the suggestion engine depend on FSP API calls. Centralising all FSP communication in one package ensures consistent authentication, retry logic, error handling, and 429 rate-limit handling across the entire system.

**Scope In**
- One service class per API section, all living in `packages/fsp-client/src/`:
  - `AuthService` — authenticate, verify MFA, refresh session, logout
  - `OperatorsService` — list operators, get operator details, list users, get permissions
  - `LocationsService` — list locations, get location details
  - `AircraftService` — list aircraft, get times/hours, get squawks, get maintenance reminders
  - `InstructorsService` — list instructors
  - `ActivityTypesService` — list activity types
  - `SchedulingGroupsService` — list scheduling groups
  - `AvailabilityService` — get single user availability, batch availability, availability with overrides, check reservation availability, add/update/delete overrides
  - `ScheduleService` — get schedule, get display hours, get filters, get cancellation reasons
  - `SchedulableEventsService` — get schedulable events (training queue)
  - `AutoScheduleService` — get settings, update settings, execute AutoSchedule, submit feedback
  - `FindATimeService` — get preferences, update preferences, get available time slots
  - `ReservationsService` — create/validate reservation, get reservation details, get reservations for person, update, delete, list with filters, check available times, check availability, get aircraft options
  - `BatchReservationsService` — publish batch, track batch progress
  - `EnrollmentService` — get enrollments, get enrollment details, get progress, update progress, get history, get training sessions, get student progress report, get checkride scores, get knowledge tests
  - `StudentsService` — search students, list students, get dropdown items, get training alerts
  - `WeatherService` — get METAR, get TAF
  - `CivilTwilightService` — get civil twilight for location
  - `FlightAlertsService` — list, create, update, complete, get overdue, get by aircraft, get by type
- `FspClientModule` — NestJS module that provides all services, configured with base URLs and subscription key from environment variables
- HTTP client built on `axios` with:
  - `x-subscription-key` header injected on every request
  - Bearer token header injected on every authenticated request
  - Automatic retry on 5xx errors: 3 retries with exponential backoff (1s, 2s, 4s)
  - 429 handling: when a 429 is received, pause all outgoing requests for 60 seconds, then retry
  - Request and response logging to Application Insights (method, URL, status, duration — no request bodies in logs)
- All request and response types defined in `packages/shared-types/src/fsp.types.ts`
- Unit tests for each service using mocked HTTP responses via MSW

**Scope Out**
- Token management and session refresh — covered in PR 7
- Any business logic using the client — covered in subsequent PRs

**Technical Detail**
- The 429 pause must be global across all service instances — use a shared semaphore or flag on the HTTP client instance. When one request receives a 429, all subsequent requests must wait, not just requests from the same service.
- `start` and `end` fields on reservation creation requests are in local time (no timezone suffix) per the FSP API spec. The client must not convert these to UTC.
- The `AutoScheduleService.execute()` method accepts times in UTC and the client must pass them through unchanged.
- The FSP API mixes V1 and V2 endpoint versions — each service class must use the exact endpoint path specified in the API appendix, including the version prefix.
- All response types must handle optional fields — many FSP responses return null for fields that are sometimes absent.

**Dependencies**
- PR 1
- PR 3

**Acceptance Criteria**
- All 19 service classes are implemented and exported from `packages/fsp-client`
- A 429 response from any service pauses all outgoing FSP requests for 60 seconds
- A 5xx response triggers retry with exponential backoff; after 3 retries the error is thrown to the caller
- All service methods are covered by unit tests using MSW-mocked FSP responses
- TypeScript compilation of `packages/fsp-client` produces zero errors in strict mode
- The FSP client is importable by `apps/api` and `apps/worker` without circular dependency errors
- Request logs appear in Application Insights with method, URL, status code, and duration

---

### PR 7 — Authentication and Multi-Tenant Middleware

**What**
Implement FSP-based authentication for the scheduler console, per-tenant middleware that scopes every request to the correct `operatorId`, and the operator bootstrap flow that registers a new tenant in the system.

**Why**
Every API endpoint and every worker job operates in the context of a specific operator tenant. Without tenant scoping, data isolation between operators cannot be guaranteed. This PR establishes the security boundary that all subsequent PRs rely on.

**Scope In**
- NestJS auth guard that validates FSP Bearer tokens on every incoming request to `apps/api`
- FSP token validation calls `GET /core/v1.0/operators/{operatorId}/users/{userId}/permissions` to verify the token is valid and the user has `canManageSchedule` permission
- `TenantContext` — a request-scoped NestJS provider that holds `operatorId`, `userId`, and decoded token claims for the duration of a request
- Tenant middleware that extracts `operatorId` from the request path or header, looks up the operator in the `operators` table, and attaches the operator record to `TenantContext`
- Operator bootstrap endpoint `POST /operators/bootstrap` — registers a new FSP operator in the system, creates the operator record in the database with default configuration, and starts polling for that tenant
- Operator lookup endpoint `GET /operators/me` — returns the current operator's configuration
- FSP token refresh: the worker service maintains a token per operator and refreshes it before expiry using `POST /common/v1.0/sessions/refresh`
- All tokens stored in Azure Key Vault, not in the database
- Unit tests for the auth guard, tenant middleware, and token refresh logic

**Scope Out**
- Operator configuration UI — covered in PR 21
- Operator policy weight configuration — covered in PR 11
- MFA flow — the console uses the FSP auth library; MFA is handled by FSP's own UI

**Technical Detail**
- The auth guard must reject requests with expired, malformed, or revoked tokens with HTTP 401.
- Every database query in every subsequent PR must include `where: { operatorId: tenantContext.operatorId }`. This is the application-layer tenant isolation mechanism. There is no database-level row security.
- The worker service must not share tokens between operators. Each operator's FSP token is independent.
- Token refresh should happen proactively when the token has less than 5 minutes remaining, not reactively after a 401.
- The bootstrap endpoint is called once per operator when they first connect the agentic scheduler to their FSP account. It is idempotent — calling it twice for the same operator must not create duplicate records.

**Dependencies**
- PR 1
- PR 3
- PR 5
- PR 6

**Acceptance Criteria**
- A request to any protected endpoint without a valid FSP Bearer token returns HTTP 401
- A request with a valid token for operator A cannot access data belonging to operator B
- `POST /operators/bootstrap` creates an operator record in the database and returns the operator configuration
- Calling `POST /operators/bootstrap` twice for the same `fsp_operator_id` returns the existing record without creating a duplicate
- The worker service successfully refreshes an expiring token before it expires
- All auth guard and middleware logic is covered by unit tests
- `TenantContext` is available as an injectable provider in all NestJS request-scoped contexts

---

### PR 8 — Rate-Limited Polling Dispatcher

**What**
Implement the polling dispatcher — the component that schedules and executes FSP API polls for all active operator tenants while staying within the 60 calls/60 seconds rate limit enforced by FSP.

**Why**
Without a rate-limited dispatcher, polling 1,300 operators at any reasonable frequency would immediately exceed FSP's rate limit of 60 calls per minute, causing 429 errors and polling blackouts. This is the most architecturally critical component in the system.

**Scope In**
- Token bucket implementation: capacity 55 tokens, refill rate 55 tokens per 60 seconds. Every FSP API call consumes one token. If the bucket is empty, the call waits until a token is available.
- Tier classification logic:
  - `TIER1`: operator has at least one reservation scheduled in the next 24 hours, or a cancellation was detected in the last 2 hours — poll every `TIER1_POLL_INTERVAL_SECONDS`
  - `TIER2`: operator has at least one reservation scheduled in the next 7 days — poll every `TIER2_POLL_INTERVAL_SECONDS`
  - `TIER3`: operator has no reservations in the next 7 days — poll every `TIER3_POLL_INTERVAL_SECONDS`
- Tier re-classification job runs every hour for all active operators and updates `operators.polling_tier`
- Poll job scheduler: on startup, reads all active operators from the database and enqueues a `PollJobMessage` for each onto the `poll-jobs` Service Bus queue at the interval appropriate for their tier
- Poll job consumer: reads from `poll-jobs` queue, calls `POST /api/V1/operator/{operatorId}/operatorReservations/list` via the FSP client, stores the response for change detection (PR 9)
- 429 handling: if FSP returns 429, pause the token bucket for 60 seconds, log the incident to Application Insights, and re-enqueue the poll job at the back of the queue
- Metrics emitted to Application Insights: `polling.calls_per_minute`, `polling.429_count`, `polling.queue_depth`, `polling.tier_distribution`

**Scope Out**
- Change detection logic — covered in PR 9. This PR only fetches and stores the raw FSP response; it does not analyse it.
- Suggestion generation — covered in PRs 10–16

**Technical Detail**
- The token bucket must be shared across all poll job consumers. If multiple worker instances are running (horizontal scaling), the token bucket must be coordinated — use a Redis-backed implementation or Azure Cache for Redis. For MVP with a single worker instance, an in-memory token bucket is acceptable.
- The poll job scheduler must not enqueue duplicate jobs for the same operator. Before enqueuing, check whether a job for that operator is already in the queue.
- The raw FSP reservations response is stored temporarily (in memory or Redis with a short TTL) for comparison by the change detection engine (PR 9). It is not persisted to PostgreSQL.
- Log a warning to Application Insights when the token bucket is below 10 tokens. Log an error when a 429 is received.
- The dispatcher must handle operators being added or removed while it is running — tier re-classification and job scheduling must be incremental, not a full restart.

**Dependencies**
- PR 1
- PR 3
- PR 4
- PR 5
- PR 6
- PR 7

**Acceptance Criteria**
- The total number of FSP API calls per 60-second window never exceeds 55 under any load
- When FSP returns 429, the dispatcher pauses for 60 seconds, then resumes — no calls are lost
- A TIER1 operator receives a poll at the configured interval (±10 seconds)
- A TIER3 operator receives a poll at the configured interval (±30 seconds)
- Tier re-classification runs every hour and correctly promotes an operator from TIER3 to TIER1 when a reservation is added to their schedule
- `polling.calls_per_minute` metric is visible in Application Insights
- Adding a new operator via the bootstrap endpoint (PR 7) results in that operator being polled within one polling interval without restarting the worker
- Unit tests cover the token bucket: token consumption, bucket exhaustion, 60-second refill, and 429 pause behaviour

---

### PR 9 — Change Detection Engine

**What**
Implement the change detection engine that compares each new FSP reservations response against the last-known state for that operator, identifies what changed, and emits typed `ChangeEventMessage` records onto the `change-events` Service Bus queue.

**Why**
The suggestion engine (PRs 13–16) is triggered by specific change types — cancellations, new openings, status changes. Without a reliable change detection layer, the agent cannot know when to act. This PR is the bridge between raw polling data and actionable events.

**Scope In**
- State comparison: for each poll result, compare the new reservations list against the hash stored in `operators.last_poll_hash`
- If the hash is unchanged, no further processing occurs for that poll
- If the hash has changed, diff the two reservation lists to identify:
  - `CANCELLATION`: a reservation that existed in the previous state is now cancelled or absent
  - `NEW_OPENING`: a time slot that was previously occupied is now free
  - `STATUS_CHANGE`: a reservation exists in both states but its status field has changed
- For each detected change, publish a `ChangeEventMessage` to the `change-events` queue
- Update `operators.last_poll_hash` with the hash of the new response
- Update `operators.last_polled_at` with the current timestamp
- Metrics emitted to Application Insights: `detection.changes_per_poll`, `detection.cancellations`, `detection.new_openings`

**Scope Out**
- Acting on the change events — that is the responsibility of the use case handlers in PRs 13–16
- Handling weather-based disruptions — out of scope for Phase 1 MVP

**Technical Detail**
- The hash must be a deterministic hash of the reservations response sorted by reservation ID, so that order changes in the response do not trigger false positives.
- The diff algorithm must be resilient to the FSP API returning duplicate events — deduplicate by `reservationId` before diffing.
- A `CANCELLATION` event is only emitted if the cancelled reservation had a student assigned. Cancelled maintenance blocks or instructor-only reservations must not trigger suggestion generation.
- `NEW_OPENING` detection compares the set of occupied time slots before and after the poll. A slot is defined as a 30-minute interval at a specific `locationId` during which at least one aircraft and one instructor are both unavailable. If that combination becomes available, it is a new opening.
- The `rawDiff` field in `ChangeEventMessage` must contain enough information for the use case handler to act without making additional FSP calls for context that is already available from the poll.

**Dependencies**
- PR 4
- PR 5
- PR 7
- PR 8

**Acceptance Criteria**
- When a reservation is cancelled in FSP, a `CANCELLATION` `ChangeEventMessage` appears on the `change-events` queue within the polling interval
- When a previously occupied slot becomes free, a `NEW_OPENING` `ChangeEventMessage` appears on the `change-events` queue
- When the reservations response is identical to the previous poll, no `ChangeEventMessage` is published and `operators.last_poll_hash` is unchanged
- Duplicate reservation entries in the FSP response do not cause duplicate `ChangeEventMessage` records
- Cancelled maintenance blocks do not produce `CANCELLATION` events
- `operators.last_polled_at` is updated after every successful poll
- `detection.cancellations` metric increments in Application Insights when a cancellation is detected
- Unit tests cover: hash comparison, cancellation detection, new opening detection, duplicate deduplication, maintenance block filtering

---

### PR 10 — Suggestion State Machine

**What**
Implement the suggestion state machine, the base suggestion creation and resolution logic, and the suggestion API endpoints used by the scheduler console.

**Why**
Every use case handler (PRs 13–16) produces a suggestion. The state machine governs how suggestions move from creation to approval, rejection, or expiry. The API endpoints in this PR are what the scheduler console queries to display the approval queue.

**Scope In**
- Suggestion service in `apps/api/src/suggestions/`:
  - `createSuggestion(payload)` — creates a new suggestion record in PENDING state, writes a SUGGESTION_CREATED audit log entry
  - `approveSuggestion(suggestionId, actorId)` — transitions PENDING → APPROVED, validates the FSP reservation one final time using validateOnly, writes SUGGESTION_APPROVED audit log entry, publishes to `suggestion-results` queue
  - `rejectSuggestion(suggestionId, actorId, reason)` — transitions PENDING → REJECTED, writes SUGGESTION_REJECTED audit log entry
  - `expireSuggestions()` — scheduled job running every 15 minutes, transitions all PENDING suggestions past their `expires_at` to EXPIRED, writes SUGGESTION_EXPIRED audit log entries
- API endpoints:
  - `GET /suggestions` — paginated list of suggestions for the current operator, filterable by `status`, `use_case_type`, `created_at` range
  - `GET /suggestions/:id` — single suggestion with full detail
  - `POST /suggestions/:id/approve` — approve a suggestion
  - `POST /suggestions/:id/reject` — reject a suggestion with required `reason` body field
- All endpoints protected by the auth guard from PR 7 and scoped to the current operator's tenant context
- Audit log entries written for every state transition

**Scope Out**
- LLM rationale generation — covered in PR 12
- Use case specific suggestion creation — covered in PRs 13–16. This PR provides the `createSuggestion` function; the use case handlers call it.
- Bulk approve/decline — covered in PR 20

**Technical Detail**
- State transitions must be enforced at the database level using a check constraint or at the application layer: PENDING → APPROVED, PENDING → REJECTED, PENDING → EXPIRED are the only valid transitions. Any attempt to transition from APPROVED, REJECTED, or EXPIRED must throw an error.
- The final validate-only FSP call on approval must use the same `candidate_payload` that was generated when the suggestion was created. If the validate-only call returns errors, the approval must be blocked and the scheduler shown the FSP error messages.
- `expireSuggestions()` must run as an idempotent job — running it twice within the same 15-minute window must not produce duplicate audit log entries.
- Pagination on `GET /suggestions` uses cursor-based pagination on `created_at` — not offset pagination.

**Dependencies**
- PR 1
- PR 3
- PR 5
- PR 6
- PR 7

**Acceptance Criteria**
- `POST /suggestions/:id/approve` on a PENDING suggestion with a passing FSP validate-only call transitions the suggestion to APPROVED and writes an audit log entry
- `POST /suggestions/:id/approve` on a PENDING suggestion where FSP validate-only returns errors returns HTTP 409 with the FSP error messages and does not transition the suggestion
- `POST /suggestions/:id/approve` on an already APPROVED suggestion returns HTTP 409
- `POST /suggestions/:id/reject` without a `reason` body returns HTTP 400
- `GET /suggestions` returns only suggestions belonging to the authenticated operator — never suggestions from another operator
- PENDING suggestions past their `expires_at` are transitioned to EXPIRED by the expiry job
- Every state transition produces exactly one audit log entry with the correct `event_type` and `actor_id`
- Cursor-based pagination on `GET /suggestions` returns correct results across pages

---

### PR 11 — Priority Weight Engine

**What**
Implement the configurable priority weight engine that ranks waitlist candidates for use case A. This includes the weight signal computation, the ranking algorithm, and the operator configuration endpoints for setting custom weights.

**Why**
Waitlist automation requires ranking eligible students by priority — not just returning the first available student. The weight engine must be configurable per operator because different schools have different priorities (e.g. some prioritise students closest to checkride, others prioritise those who have waited longest).

**Scope In**
- Priority weight engine in `apps/worker/src/suggestions/priority-weight.engine.ts`:
  - Accepts a list of candidate students and computes a priority score for each
  - Built-in signals:
    - `timeSinceLastFlight`: days since the student's most recent completed reservation — sourced from FSP reservation history (§13). Higher value = higher priority.
    - `timeUntilNextScheduledFlight`: days until the student's next upcoming reservation — if no upcoming reservation exists, score is maximum. Higher value = higher priority.
    - `totalFlightHours`: total logged flight hours from enrollment progress (§15). Direction is configurable — some operators want students with more hours (closer to checkride) prioritised; others want students with fewer hours prioritised.
    - `customWeights`: operator-defined additional signals stored in `operators.priority_weights` JSONB field
  - Each signal produces a normalised score between 0 and 1
  - Final priority score = weighted sum of normalised signal scores using operator-configured weights
  - Default weights used when operator has not configured custom weights
- Operator configuration endpoints in `apps/api`:
  - `GET /operators/me/priority-weights` — returns current weight configuration
  - `PUT /operators/me/priority-weights` — updates weight configuration, validates that weights are non-negative numbers
- Weight configuration stored in `operators.priority_weights` JSONB

**Scope Out**
- The actual waitlist use case handler that calls this engine — covered in PR 13
- Availability and constraint checking — covered per use case in PRs 13–16

**Technical Detail**
- Normalisation: each signal must be normalised to 0–1 before weighting. For `timeSinceLastFlight`, cap at 90 days (90 days = score 1.0; 0 days = score 0.0). Document the normalisation bounds for each signal.
- If a signal cannot be computed for a student (e.g. no flight history exists), assign a neutral score of 0.5 for that signal — do not exclude the student from ranking.
- The engine must be deterministic: given the same inputs and weights, it must always produce the same ranking. Use student ID as a tiebreaker when scores are equal.
- Weight updates take effect on the next suggestion generation cycle — there is no need to invalidate existing PENDING suggestions.

**Dependencies**
- PR 1
- PR 5
- PR 6
- PR 7

**Acceptance Criteria**
- Given two students where student A has not flown in 30 days and student B has not flown in 5 days, with `timeSinceLastFlight` as the only active weight, student A receives a higher priority score than student B
- When a signal cannot be computed for a student, the student still receives a score (not excluded)
- Given identical scores for two students, the student with the lower student ID sorts first (deterministic tiebreaker)
- `PUT /operators/me/priority-weights` with a negative weight value returns HTTP 400
- `PUT /operators/me/priority-weights` with valid weights persists the new configuration and is returned by the subsequent `GET` call
- The weight engine is covered by unit tests with synthetic student data covering all four signal types and edge cases (no flight history, tied scores, all signals active simultaneously)

---

### PR 12 — LLM Rationale Generator

**What**
Implement the LLM-based rationale generator that produces plain-English explanations for each suggestion, and the fallback template system used when the LLM is unavailable.

**Why**
Every suggestion surfaced to the scheduler must include a plain-English explanation of why this student, this slot, and these resources were chosen, and which constraints were checked. This is both a PRD requirement (Section 4.1 Explainability) and a key differentiator versus FSP's native scheduling.

**Scope In**
- LLM rationale generator in `apps/worker/src/llm/rationale-generator.ts`:
  - Accepts: student profile snippet, proposed slot details, constraint satisfaction results, priority score and breakdown, operator context
  - Calls Claude 3.5 Sonnet (`claude-3-5-sonnet-20241022`) via the Anthropic TypeScript SDK
  - System prompt instructs the model to produce a structured JSON object: `{ rationale: string, confidence: number, constraintsSatisfied: string[] }`
  - `rationale` is a 2–4 sentence plain-English explanation suitable for a scheduler to read at a glance
  - `confidence` is a float between 0.0 and 1.0 reflecting how strongly all constraints were satisfied
  - `constraintsSatisfied` is an array of human-readable strings describing each passing constraint check
  - `max_tokens` capped at 500 to control cost
  - Response validated against the expected JSON schema — if the model returns malformed JSON, the fallback template is used
- Fallback template system:
  - When the LLM is unavailable or returns malformed output, a deterministic template generates the rationale from the structured constraint data
  - Template format: `"Suggested [student name] for [slot time] — [top priority signal]. [Constraint summary]. Confidence: [score]."`
- LLM call cost and latency logged to Application Insights
- Unit tests covering: successful LLM response, malformed LLM response triggering fallback, LLM timeout triggering fallback

**Scope Out**
- The use case handlers that call this generator — covered in PRs 13–16
- LLM calls for any purpose other than rationale generation

**Technical Detail**
- The LLM must never be in the critical path for constraint checking. Constraints are checked deterministically first; the LLM only generates the explanation after all constraints pass.
- The Anthropic SDK call must have a timeout of 10 seconds. If the LLM does not respond within 10 seconds, use the fallback template.
- Never include raw FSP API response data in the LLM prompt. Only pass sanitised, structured fields to prevent prompt injection from FSP data containing crafted strings.
- The `confidence` score produced by the LLM must be cross-checked against the deterministic constraint results. If the LLM produces a confidence score above 0.8 but fewer than 80% of constraints passed, override the LLM confidence with the deterministic score.

**Dependencies**
- PR 1
- PR 3
- PR 10

**Acceptance Criteria**
- The rationale generator returns a valid `{ rationale, confidence, constraintsSatisfied }` object for a well-formed input
- The `rationale` string is between 50 and 400 characters
- When the LLM returns malformed JSON, the fallback template is used and no error is thrown to the caller
- When the LLM times out (simulated in tests), the fallback template is used within 10 seconds
- LLM call latency and token usage are logged to Application Insights on every call
- The LLM prompt contains no raw FSP API response fields — only sanitised structured data
- Unit tests cover all three paths: successful LLM response, malformed response, timeout

---

### PR 13 — Use Case A: Waitlist Automation

**What**
Implement the waitlist automation handler — the component that detects a schedule opening, identifies eligible candidates, ranks them using the priority weight engine, validates the top candidate against all constraints, generates a suggestion with rationale, and surfaces it to the approval queue.

**Why**
This is the highest-priority use case in the PRD. Faster slot refill directly increases weekly flight hours and recovers the $30,000–$50,000 annual loss from unfilled slots.

**Scope In**
- Waitlist handler in `apps/worker/src/suggestions/use-cases/waitlist.handler.ts`
- Triggered by `NEW_OPENING` `ChangeEventMessage` from the `change-events` queue
- Handler flow:
  1. Parse the opening from the `ChangeEventMessage`: extract `locationId`, `startTime`, `endTime`, `aircraftId` if known
  2. Call Find-a-Time (§12) to confirm the slot is still available and retrieve eligible aircraft and instructor options
  3. Call civil twilight API (§18) for the slot's location and date — if the slot falls outside civil twilight, skip and log
  4. Fetch all students at the location with active enrollments using schedulable events (§10)
  5. For each candidate student: call availability batch API (§8) to verify the student is available at the slot time
  6. Filter candidates to only those whose next required lesson (from enrollment, §15) matches the activity type available in the opening
  7. Rank filtered candidates using the priority weight engine (PR 11)
  8. For the top-ranked candidate, call FSP validateOnly reservation (§13) to confirm no conflicts
  9. If validate passes: call the LLM rationale generator (PR 12), then call `createSuggestion` (PR 10)
  10. If validate fails: try the second-ranked candidate; repeat up to 3 candidates maximum
  11. If no candidate passes validation: log to Application Insights and exit without creating a suggestion
- Suggestion `candidate_payload` must include: `studentId`, `instructorId`, `aircraftId`, `locationId`, `slotStart`, `slotEnd`, `activityTypeId`, `enrollmentId`, `lessonId`

**Scope Out**
- Batch proposals (proposing a group of students to reduce approval volume) — deferred post-MVP
- The approval flow after the suggestion is created — covered in PR 10
- Email/SMS notification to the student — covered in PR 17. This handler only creates the suggestion.

**Technical Detail**
- The handler must complete within 30 seconds end-to-end. All FSP API calls within the handler should be made with a combined timeout budget of 25 seconds (5 seconds reserved for database writes and LLM call).
- Availability checks for candidates must be batched — use the batch availability API (§8) rather than calling availability for each student individually. This is critical for rate limit compliance.
- If more than 20 eligible candidates exist after filtering, only the top 20 by preliminary signal score are passed through the full validation loop to stay within the time budget.
- Aircraft squawks (§4) must be checked before including an aircraft in the proposal. An aircraft with open squawks must not be proposed.

**Dependencies**
- PR 6
- PR 7
- PR 9
- PR 10
- PR 11
- PR 12

**Acceptance Criteria**
- When a `NEW_OPENING` event is received, a PENDING suggestion is created in the database within 30 seconds
- The suggested student is available at the proposed slot time (verified via FSP availability API)
- The suggested slot is within civil twilight hours for the location
- The proposed aircraft has no open squawks
- The suggested lesson matches the student's next required training event from their enrollment
- When the top-ranked candidate fails FSP validation, the second-ranked candidate is tried
- When no candidate passes validation after 3 attempts, no suggestion is created and the event is logged
- An aircraft with open squawks is never included in a suggestion
- The `candidate_payload` on the created suggestion contains all required fields
- Unit tests cover: successful suggestion creation, candidate falling outside daylight, all candidates failing validation, no eligible candidates

---

### PR 14 — Use Case B: Reschedule on Cancellation

**What**
Implement the reschedule handler — when a reservation is cancelled, generate the top N compatible alternative slots for the affected student and surface them as suggestions for scheduler approval.

**Scope In**
- Reschedule handler in `apps/worker/src/suggestions/use-cases/reschedule.handler.ts`
- Triggered by `CANCELLATION` `ChangeEventMessage` from the `change-events` queue
- Handler flow:
  1. Parse the cancelled reservation from `ChangeEventMessage`: extract `studentId`, `instructorId`, `aircraftId`, `locationId`, `activityTypeId`, `originalStart`, `originalEnd`
  2. Determine the search window: operator-configured number of days from the cancellation date (stored in `operators.policy_config`)
  3. Call Find-a-Time (§12) with the student's activity type, preferred instructor (optional, operator-configured), preferred aircraft (optional), and search window
  4. Call civil twilight (§18) for each candidate slot's date — filter out slots outside daylight hours if the activity type requires it
  5. Call availability API (§8) to verify the student is available at each candidate slot
  6. Call FSP validateOnly (§13) for each candidate slot
  7. For the top N passing candidates (N = operator-configured, default 3): call rationale generator (PR 12) and call `createSuggestion` (PR 10), creating one suggestion per alternative
  8. If no candidates pass validation: log and exit without creating suggestions

**Scope Out**
- Automatically sending the rescheduled slot to the student — covered in PR 17 (notification is sent after scheduler approval)

**Technical Detail**
- The search window default is 7 days. The operator can configure this in `operators.policy_config.rescheduleWindowDays`.
- Instructor continuity preference: if the operator has `policy_config.preferSameInstructor: true`, the Find-a-Time call must first try to find slots with the same instructor. If no slots are found with the same instructor within the search window, retry without the instructor constraint.
- All N suggestions for the same cancellation event share the same `change_event_id` reference in their `candidate_payload` so the console can group them visually.
- N suggestions are created but only one can be approved — approving one must automatically reject the others for the same cancellation event. This logic lives in the approval flow (PR 10).

**Dependencies**
- PR 6
- PR 7
- PR 9
- PR 10
- PR 12

**Acceptance Criteria**
- When a `CANCELLATION` event is received for a student reservation, up to N PENDING suggestions are created within 30 seconds
- All suggested slots are within the operator-configured search window
- All suggested slots pass FSP validateOnly check
- When `preferSameInstructor` is true and same-instructor slots exist, they are prioritised
- When `preferSameInstructor` is true but no same-instructor slots exist, slots with any instructor are proposed
- Approving one reschedule suggestion for a cancellation event automatically rejects the other suggestions for the same event
- When no valid slots are found, no suggestions are created and the event is logged
- Unit tests cover: successful multi-suggestion creation, same-instructor preference, no available slots, instructor fallback

---

### PR 15 — Use Case C: Discovery Flight Booking

**What**
Implement the discovery flight handler — when a prospect submits a discovery flight request, generate available options respecting daylight-only constraints and eligible instructor and aircraft pairings.

**Scope In**
- Discovery flight handler in `apps/worker/src/suggestions/use-cases/discovery.handler.ts`
- Prospect intake endpoint in `apps/api`: `POST /discovery/prospects` — creates a `discovery_prospects` record and triggers suggestion generation
- Handler flow:
  1. Receive prospect record from the intake endpoint via the `change-events` queue (use `changeType: 'DISCOVERY_REQUEST'`)
  2. Call civil twilight (§18) for the operator's location and the prospect's preferred dates — discovery flights are daylight-only, no exceptions
  3. Call Find-a-Time (§12) restricted to daylight hours only, with activity type set to discovery flight
  4. Filter results to instructor and aircraft pairings eligible for discovery flights (stored in `operators.policy_config.discoveryEligibleInstructorIds` and `discoveryEligibleAircraftIds`)
  5. For each eligible slot within the operator-configured search window: call FSP validateOnly (§13)
  6. Create up to N passing suggestions (default N = 3) with rationale
  7. All suggestions link back to the `discovery_prospects` record via `candidate_payload.prospectId`

**Scope Out**
- Payment processing — handled externally, this system only tracks `payment_status` as a flag
- The prospect-facing booking confirmation UI — out of scope for Phase 1

**Technical Detail**
- Discovery flights are strictly daylight-only. The civil twilight check is a hard constraint — no operator configuration can override it.
- If the prospect's preferred dates are not provided, use the operator-configured default search window from `operators.policy_config.discoverySearchWindowDays` (default 14 days from request date).
- The `discovery_prospects` record must exist before suggestions are created. The `candidate_payload.prospectId` links the suggestion back to the prospect.
- FSP may not have all required fields for discovery flight reservations. Any fields not available in FSP are stored in the `discovery_prospects` record and included in the `candidate_payload`.

**Dependencies**
- PR 6
- PR 7
- PR 9
- PR 10
- PR 12

**Acceptance Criteria**
- `POST /discovery/prospects` creates a `discovery_prospects` record and triggers suggestion generation
- All suggested slots are within civil twilight hours — no exceptions
- All suggested slots use only instructor and aircraft IDs from the operator's eligible pairings list
- All suggested slots pass FSP validateOnly
- Suggestions link back to the `discovery_prospects` record via `candidate_payload.prospectId`
- A prospect request with preferred dates entirely outside civil twilight produces no suggestions and logs the reason
- Unit tests cover: successful discovery booking, all preferred dates in darkness, no eligible instructors, FSP validation failure

---

### PR 16 — Use Case D: Schedule Next Lesson on Completion

**What**
Implement the next lesson handler — when a training lesson is completed or a scheduled scan identifies students with pending unscheduled lessons, determine the next required training event from the student's enrollment and generate scheduling options.

**Scope In**
- Next lesson handler in `apps/worker/src/suggestions/use-cases/next-lesson.handler.ts`
- Two trigger mechanisms:
  1. `STATUS_CHANGE` `ChangeEventMessage` where a reservation transitions to completed status
  2. Scheduled job running every hour that calls schedulable events API (§10) to find students with pending unscheduled lessons
- Handler flow:
  1. Identify the student and their active enrollment
  2. Call enrollment progress (§15) to determine the next required lesson in the curriculum sequence
  3. Call availability API (§8) for the student and their preferred instructor (if configured)
  4. Determine whether to use Find-a-Time (§12) or AutoSchedule solver (§11):
     - If scheduling a single next lesson: use Find-a-Time
     - If the student has 3 or more pending lessons in their training queue: use AutoSchedule solver to place them optimally
  5. Call civil twilight (§18) for date-based daylight constraints if the lesson type requires it
  6. Call FSP validateOnly (§13) for each proposed slot
  7. Create suggestions for the top N passing slots with rationale

**Scope Out**
- Scheduling multiple students in bulk — AutoSchedule is used per-student only in this PR

**Technical Detail**
- Instructor continuity: if `operators.policy_config.preferContinuityInstructor` is true, the handler must first try to find slots with the instructor from the student's most recent completed lesson. Fall back to any eligible instructor if no slots are found.
- The AutoSchedule solver payload must include civil twilight bounds for each day in the scheduling window — fetch from civil twilight API (§18) per day.
- The scheduled scan job must be idempotent — if a student already has a PENDING suggestion for their next lesson, do not create a duplicate.
- AutoSchedule results may include duplicate `eventId` values — deduplicate before creating suggestions per the API appendix note.

**Dependencies**
- PR 6
- PR 7
- PR 9
- PR 10
- PR 12

**Acceptance Criteria**
- When a lesson completion status change is received, a suggestion for the next lesson is created within 30 seconds
- The suggested lesson matches the next item in the student's curriculum sequence from their enrollment
- The scheduled hourly scan identifies students with pending unscheduled lessons and creates suggestions for them
- The hourly scan does not create duplicate suggestions for students who already have a PENDING suggestion for their next lesson
- When the AutoSchedule solver is used (3+ pending lessons), the results are deduplicated by `eventId` before suggestions are created
- Instructor continuity preference is respected — same-instructor slots are prioritised when configured
- Unit tests cover: single lesson via Find-a-Time, multiple lessons via AutoSchedule, duplicate suggestion prevention, instructor continuity, deduplication of AutoSchedule results

---

### PR 17 — Email Notifications

**What**
Implement email notification dispatch using FSP's built-in email API and operator-branded templates for all notification events: suggestion offer to student, booking confirmation, and rescheduling offer.

**Scope In**
- Email notification service in `apps/worker/src/notifications/email.service.ts`
- Notification triggers (all triggered after scheduler approval, not on suggestion creation):
  - Student offer: sent when a suggestion is approved and a reservation is created in FSP — uses FSP's `sendEmailNotification: true` flag on the reservation creation call
  - Rescheduling offer: sent to a student when a reschedule suggestion is approved
  - Discovery flight confirmation: sent to a prospect when a discovery flight suggestion is approved
- Operator-branded templates stored in `operators.notification_config.emailTemplates` JSONB:
  - Each template has: `subject`, `bodyHtml`, `bodyText` with variable placeholders (`{{studentName}}`, `{{slotDate}}`, `{{instructorName}}`, `{{aircraftTailNumber}}`)
- Template rendering engine that replaces placeholders with actual values from the suggestion `candidate_payload`
- `communications` record created for every email dispatched with status SENT or FAILED
- Audit log entry written for every NOTIFICATION_SENT event
- Default templates used when operator has not configured custom templates

**Scope Out**
- SMS notifications — covered in PR 18
- Notification preferences UI — covered in PR 21

**Technical Detail**
- FSP's `sendEmailNotification: true` flag on the reservation creation call handles the primary booking confirmation email to all participants. Do not send a duplicate email via this service for the same event.
- This service only sends additional notifications not covered by FSP's built-in email — e.g. the initial offer email before the student has accepted, or rescheduling offer emails.
- All email content must be sanitised before rendering — no raw user-provided data rendered directly into HTML templates.
- Failed email attempts must not block the approval flow. If email dispatch fails, log the failure to Application Insights, create a FAILED `communications` record, and continue.

**Dependencies**
- PR 5
- PR 7
- PR 10

**Acceptance Criteria**
- When a suggestion is approved and a reservation is created in FSP, the student receives an email notification
- The email contains the correct student name, slot date/time, instructor name, and aircraft tail number
- A `communications` record with status SENT is created for each dispatched email
- A `communications` record with status FAILED is created when email dispatch fails — the approval flow is not blocked
- An audit log entry with `event_type: NOTIFICATION_SENT` is written for every dispatched email
- Operator-branded templates override default templates when configured
- Unit tests cover: successful dispatch, failed dispatch (approval flow not blocked), template rendering with all placeholder types

---

### PR 18 — SMS Notifications

**What**
Implement SMS notification dispatch using the `ISmsProvider` abstraction with two concrete implementations: Azure Communication Services and Twilio. The active provider is selected via the `SMS_PROVIDER` environment variable.

**Scope In**
- `ISmsProvider` interface in `packages/shared-types`:
  - `sendSms(to: string, body: string, operatorId: string): Promise<{ messageId: string, status: 'SENT' | 'FAILED' }>`
- `AzureCommunicationSmsProvider` implementing `ISmsProvider` using Azure Communication Services SDK
- `TwilioSmsProvider` implementing `ISmsProvider` using Twilio SDK
- `SmsProviderFactory` — reads `SMS_PROVIDER` env var and returns the correct implementation
- SMS notification service in `apps/worker/src/notifications/sms.service.ts` — same trigger events as email (PR 17)
- SMS templates stored in `operators.notification_config.smsTemplates` JSONB — shorter format than email, 160 character limit per message
- `communications` record created for every SMS dispatched
- Audit log entry written for every NOTIFICATION_SENT event via SMS
- Opt-in check: SMS is only sent if the student or prospect has opted in — opt-in status is stored in FSP and checked via the FSP client before sending

**Scope Out**
- Opt-in collection UI — out of scope for Phase 1

**Technical Detail**
- The `ISmsProvider` interface must be the only dependency injected into the SMS service — never import `TwilioSmsProvider` or `AzureCommunicationSmsProvider` directly in business logic.
- SMS body must not exceed 160 characters to avoid multi-part SMS charges. If a rendered template exceeds 160 characters, truncate at 157 characters and append `...`.
- Phone numbers must be in E.164 format before being passed to either provider. Validate and normalise before sending.
- Never log phone numbers or SMS body content to Application Insights — log only `messageId`, `status`, `operatorId`, and `communicationId`.

**Dependencies**
- PR 5
- PR 7
- PR 10
- PR 17

**Acceptance Criteria**
- Setting `SMS_PROVIDER=twilio` and calling `sendSms` routes to the Twilio implementation
- Setting `SMS_PROVIDER=azure` and calling `sendSms` routes to the Azure Communication Services implementation
- SMS is not sent to a student who has not opted in
- An SMS body exceeding 160 characters is truncated to 157 characters with `...` appended
- A phone number not in E.164 format is normalised before sending; if it cannot be normalised, the send is skipped and logged
- A `communications` record is created for every SMS attempt regardless of outcome
- Phone numbers and message body content do not appear in Application Insights logs
- Unit tests cover both provider implementations, opt-in check, 160-character truncation, E.164 normalisation

---

### PR 19 — Approval Queue UI

**What**
Implement the scheduler console approval queue — the primary interface where schedulers review, approve, and reject suggestions. Each suggestion is displayed as a card showing the proposed booking details and the plain-English rationale.

**Scope In**
- Approval queue page at `/queue` in `apps/web`
- Suggestion card component displaying:
  - Use case type badge (WAITLIST / RESCHEDULE / DISCOVERY / NEXT LESSON)
  - Student name, proposed slot date and time, instructor name, aircraft tail number, location
  - Plain-English rationale from `suggestions.rationale`
  - Confidence score visualised as a percentage bar
  - Constraint satisfaction list from `suggestions.constraint_results`
  - Time remaining before expiry
  - Approve button and Reject button
- Reject modal requiring a reason string before submission
- Filter bar: filter by `status`, `use_case_type`, date range
- Real-time updates: the queue polls `GET /suggestions` every 30 seconds to surface new suggestions without a full page reload
- Empty state when no PENDING suggestions exist
- Loading and error states
- The queue displays only PENDING suggestions by default; a toggle shows APPROVED, REJECTED, and EXPIRED history

**Scope Out**
- Bulk approve/decline — covered in PR 20
- Operator configuration UI — covered in PR 21
- Metrics dashboard — covered in PR 24

**Technical Detail**
- Use Next.js Server Components for the initial page render and Client Components only for interactive elements (approve/reject buttons, filter bar, real-time polling).
- The approval and rejection actions must be optimistic — the UI updates immediately on button click, then confirms or rolls back based on the API response.
- A suggestion card whose confidence score is below 0.6 must display a visible warning indicator to draw the scheduler's attention.
- The queue must be usable on mobile — single-column layout on screens narrower than 768px, with thumb-friendly approve/reject buttons.
- Dark mode must be supported — use CSS variables for all colours.

**Dependencies**
- PR 1
- PR 3
- PR 7
- PR 10

**Acceptance Criteria**
- The approval queue displays all PENDING suggestions for the authenticated operator
- Clicking Approve on a suggestion card calls `POST /suggestions/:id/approve` and moves the card to the approved state
- Clicking Reject without entering a reason prevents submission and shows a validation error
- A suggestion with confidence score below 0.6 displays a warning indicator
- The queue updates within 30 seconds when a new suggestion is created by the worker
- The queue is usable on a 375px-wide mobile screen with no horizontal scrolling
- An empty state is shown when no PENDING suggestions exist
- Suggestions from other operators are never visible in the queue

---

### PR 20 — Bulk Approve/Decline and Activity Feed

**What**
Add bulk approve/decline actions to the approval queue and implement the activity feed that shows a chronological log of all suggestion events for the operator.

**Scope In**
- Bulk selection: checkbox on each suggestion card, select-all checkbox in the filter bar
- Bulk approve button: approves all selected PENDING suggestions sequentially, showing progress
- Bulk reject button: opens a single modal where one rejection reason is applied to all selected suggestions
- Bulk approve/reject API endpoints:
  - `POST /suggestions/bulk-approve` — accepts array of suggestion IDs, processes sequentially
  - `POST /suggestions/bulk-reject` — accepts array of suggestion IDs and a single reason
- Activity feed panel (collapsible side panel on the queue page):
  - Displays recent audit log entries for the operator in chronological order
  - Entry types shown: SUGGESTION_CREATED, SUGGESTION_APPROVED, SUGGESTION_REJECTED, SUGGESTION_EXPIRED, RESERVATION_CREATED, NOTIFICATION_SENT
  - Each entry shows: event type, actor (scheduler name or "System"), timestamp, and a short description
  - Loads the last 50 entries on open; loads more on scroll

**Scope Out**
- Bulk actions across multiple operators — each bulk action is scoped to a single operator's suggestions only

**Technical Detail**
- Bulk approve processes suggestions sequentially, not in parallel, to avoid concurrent FSP validate-only calls exhausting the rate limit.
- If one suggestion in a bulk approve fails FSP validation, it is skipped and the rest continue. The result summary shows how many succeeded and how many were skipped with reasons.
- The activity feed reads from the `audit_log` table — it must never expose audit entries from other operators.

**Dependencies**
- PR 10
- PR 19

**Acceptance Criteria**
- Selecting 5 suggestions and clicking bulk approve calls `POST /suggestions/bulk-approve` and processes all 5
- If one suggestion in a bulk approve fails FSP validation, it is skipped and the remaining suggestions are processed
- The bulk reject modal accepts one reason and applies it to all selected suggestions
- The activity feed shows the last 50 audit log entries for the operator in reverse chronological order
- The activity feed never shows entries from other operators
- Bulk operations on more than 20 suggestions complete without timing out

---

### PR 21 — Operator Configuration UI

**What**
Implement the operator configuration interface where managers can configure priority weights, scheduling policy settings, and notification templates.

**Scope In**
- Configuration page at `/config` in `apps/web`
- Priority weights section:
  - Sliders or number inputs for each built-in weight signal (`timeSinceLastFlight`, `timeUntilNextScheduledFlight`, `totalFlightHours` with direction toggle)
  - Live preview showing how the current weights would rank a sample set of students
  - Save button calling `PUT /operators/me/priority-weights`
- Scheduling policy section:
  - `rescheduleWindowDays` — number input
  - `preferSameInstructor` — toggle
  - `preferContinuityInstructor` — toggle
  - `discoverySearchWindowDays` — number input
  - `discoveryEligibleInstructorIds` — multi-select from FSP instructor list
  - `discoveryEligibleAircraftIds` — multi-select from FSP aircraft list
  - Save button calling `PUT /operators/me/policy`
- Notification templates section:
  - Email template editor per notification type with variable placeholder guide
  - SMS template editor per notification type with live character count (160 char limit)
  - Save button calling `PUT /operators/me/notification-config`
- New policy config endpoint: `PUT /operators/me/policy` — validates and saves `operators.policy_config`
- New notification config endpoint: `PUT /operators/me/notification-config` — validates and saves `operators.notification_config`

**Scope Out**
- Operator bootstrap (adding a new FSP account) — covered in PR 7
- User management or role configuration — handled by FSP

**Dependencies**
- PR 7
- PR 11
- PR 19

**Acceptance Criteria**
- Saving priority weights with valid values persists the configuration and the change is reflected in the next suggestion generation cycle
- Saving a `rescheduleWindowDays` value of 0 returns HTTP 400
- The SMS template editor shows a live character count and warns when the template exceeds 160 characters
- The discovery eligible instructors multi-select is populated from the live FSP instructor list for the operator
- All configuration sections display the current saved values on page load
- Saving any configuration section writes an audit log entry with the actor ID and the previous and new values

---

### PR 22 — Immutable Audit Log

**What**
Implement the audit log API endpoints that expose the immutable event history to the scheduler console and verify the append-only constraint is enforced at every layer.

**Why**
The audit log is a compliance requirement aligned with FAA AC 120-78B. It must be queryable by operators and must be provably immutable — no record can be altered or deleted after creation.

**Scope In**
- Audit log query endpoints in `apps/api`:
  - `GET /audit` — paginated audit log for the current operator, filterable by `event_type`, `actor_id`, `suggestion_id`, date range
  - `GET /audit/:id` — single audit log entry
- Prisma middleware already established in PR 5 that throws on any `update` or `delete` on `AuditLog` — this PR adds integration tests that verify it
- Database-level protection: a PostgreSQL trigger that prevents UPDATE and DELETE on the `audit_log` table, implemented as a migration
- Audit log retention: entries older than 1 year are archived (moved to a separate `audit_log_archive` table) by a monthly scheduled job — they are never deleted
- Response format for each entry: `{ id, event_type, actor_id, suggestion_id, payload, created_at }`

**Scope Out**
- Audit log export (CSV download) — can be added post-MVP
- External SIEM integration — out of scope for Phase 1

**Technical Detail**
- The PostgreSQL trigger must fire on both UPDATE and DELETE attempts and raise an exception: `RAISE EXCEPTION 'audit_log records are immutable'`.
- The archive job copies rows older than 1 year to `audit_log_archive` in batches of 1,000, then deletes from `audit_log` only after confirming the archive copy succeeded.
- `GET /audit` uses cursor-based pagination on `created_at` — consistent with `GET /suggestions`.

**Dependencies**
- PR 5
- PR 7
- PR 10

**Acceptance Criteria**
- Attempting to update an `audit_log` record at the database level raises a PostgreSQL exception
- Attempting to delete an `audit_log` record at the database level raises a PostgreSQL exception
- Attempting to update an `audit_log` record via the Prisma client raises an application-level error
- `GET /audit` returns only entries for the authenticated operator
- `GET /audit` with a `suggestion_id` filter returns only entries related to that suggestion
- The monthly archive job copies entries older than 1 year to `audit_log_archive` and removes them from `audit_log` only after confirming the archive copy
- Integration tests verify the immutability constraint at both the database trigger level and the Prisma middleware level

---

### PR 23 — Azure Application Insights Integration

**What**
Implement comprehensive observability across all three applications: structured logging, custom metrics, and distributed traces covering the complete suggestion lifecycle from polling detection to scheduler approval.

**Scope In**
- Application Insights SDK configured in all three apps (`apps/api`, `apps/worker`, `apps/web`)
- Structured log format: every log entry includes `operatorId`, `correlationId`, `service`, `version`
- Custom metrics (all emitted from `apps/worker`):
  - `polling.calls_per_minute` — FSP API call rate
  - `polling.429_count` — rate limit hits
  - `polling.queue_depth` — number of poll jobs in queue
  - `polling.tier_distribution` — count of operators per tier
  - `detection.changes_per_poll` — changes detected per poll cycle
  - `detection.cancellations` — cancellations detected
  - `detection.new_openings` — new openings detected
  - `suggestions.created` — suggestions created per use case type
  - `suggestions.approved` — suggestions approved
  - `suggestions.rejected` — suggestions rejected
  - `suggestions.expired` — suggestions expired
  - `suggestions.acceptance_rate` — rolling 7-day acceptance rate per operator
  - `suggestions.time_to_fill_seconds` — seconds from opening detection to approved booking
  - `llm.call_latency_ms` — LLM call duration
  - `llm.token_usage` — tokens consumed per call
  - `notifications.sent` — notifications dispatched by channel
- Distributed trace context propagated from the `ChangeEventMessage` that triggers a suggestion through to the FSP reservation creation — so a single trace shows the complete lifecycle
- Alerts configured for: `polling.429_count > 3 per hour`, `suggestions.acceptance_rate < 0.5 over 24 hours`, `llm.call_latency_ms p95 > 8000`

**Scope Out**
- Operator-visible dashboard — covered in PR 24. This PR instruments the data; PR 24 surfaces it.

**Dependencies**
- PR 2
- PR 3
- All worker PRs (PR 8–18)

**Acceptance Criteria**
- Every log entry in Application Insights includes `operatorId` and `correlationId`
- A single distributed trace is visible in Application Insights showing the path from poll detection through suggestion creation to FSP reservation creation
- All custom metrics listed above are visible in Application Insights within 5 minutes of being emitted
- The `polling.429_count > 3 per hour` alert fires when simulated in a test environment
- No phone numbers, email addresses, student names, or FSP API keys appear in any log entry

---

### PR 24 — Operator Dashboard

**What**
Implement the operator performance dashboard showing key metrics: aircraft utilisation coefficient (C_util), suggestion acceptance rate, time-to-fill, and queue health — giving operators direct visibility into the value delivered by the scheduler.

**Scope In**
- Dashboard page at `/dashboard` in `apps/web`
- Metric cards:
  - **C_util** — aircraft utilisation coefficient: total flight hours booked / (fleet size × operational hours available), displayed as a percentage with a 7-day trend sparkline
  - **Acceptance rate** — percentage of suggestions approved without edits, 7-day rolling, with previous period comparison
  - **Time to fill** — average seconds from opening detection to approved booking, 7-day rolling
  - **Queue health** — current count of PENDING suggestions by use case type
  - **Weekly flight hours** — total flight hours from approved bookings this week vs previous week
- Dashboard data API endpoint: `GET /dashboard/metrics` — returns all metric values for the current operator, computed from the `suggestions` and `audit_log` tables plus FSP schedule data
- C_util calculation fetches fleet size and schedule data from FSP (aircraft list §4 and schedule §9) and combines with approved suggestion data from local DB
- 7-day trend data points for sparklines

**Scope Out**
- Per-student or per-instructor drill-down analytics — post-MVP
- CSV export of metrics — post-MVP

**Technical Detail**
- `GET /dashboard/metrics` results are cached for 5 minutes per operator — computing C_util requires FSP API calls and must not be called on every page load.
- C_util operational hours are derived from the operator's schedule display hours (FSP §9) — not a fixed assumption.
- All metric values displayed must be rounded to 2 decimal places maximum.

**Dependencies**
- PR 7
- PR 10
- PR 22
- PR 23
- PR 19

**Acceptance Criteria**
- The dashboard displays C_util, acceptance rate, time-to-fill, queue health, and weekly flight hours for the authenticated operator
- C_util is computed correctly: total approved flight hours / (fleet size × operational hours in period)
- Metric values from other operators are never returned by `GET /dashboard/metrics`
- `GET /dashboard/metrics` returns a cached result if called within 5 minutes of the previous call
- All displayed numbers are rounded to 2 decimal places
- The dashboard is accessible and renders correctly on screens from 375px to 1440px wide
- Unit tests cover the C_util calculation with synthetic fleet and schedule data

---

*End of PRD — Agentic Scheduler for Flight Schedule Pro (FSP) — Phase 1 MVP*
