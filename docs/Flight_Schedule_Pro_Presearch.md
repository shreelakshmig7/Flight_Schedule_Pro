
**AGENTIC SCHEDULER**
for Flight Schedule Pro (FSP)
Pre-Search Checklist & Architecture Reference

**Phase 1 MVP — Suggest & Approve Model**
Stack: TypeScript or C#  |  Azure  |  PostgreSQL  |  Azure Service Bus
Use cases: Waitlist · Reschedule · Discovery flight · Next lesson

**PART 1 — DEFINE YOUR CONSTRAINTS**

| 1 | Domain Selection | Part 1 |
| --- | --- | --- |

| Domain | Aviation — flight school scheduling and training operations |
| --- | --- |
| Use cases (MVP) | A. Waitlist automation  \|  B. Reschedule on cancellation  \|  C. Discovery flight booking  \|  D. Schedule next lesson on completion |
| Verification requirements | All suggestions require human scheduler approval before any FSP reservation is created. The validate-then-create pattern (validateOnly: true first) is mandatory before writing to FSP. |
| Data sources | FSP APIs (reservations, students, aircraft, instructors, availability, enrollment, weather, civil twilight). Local PostgreSQL for derived data only (suggestions, audit log, operator config, discovery flight fields). |

| FSP is the source of truth This system NEVER modifies FSP data without explicit scheduler approval. It reads from FSP, generates suggestions, stores them locally, and writes back only on approval. FSP owns: reservations, students, aircraft, instructors, locations, enrollments, availability. We own: suggestions, rationale, audit log, operator policy config, discovery flight extra fields. |
| --- |

| 2 | Scale & Performance | Part 1 |
| --- | --- | --- |

| Expected query volume | ~1,300 operators · ~5,000 locations · ~80,000 students · ~20,000 daily flights. Polling architecture must handle all tenants within strict rate limits. |
| --- | --- |
| Acceptable latency | Schedule change detection: within minutes of trigger. Recommendation generation: < 30 seconds. UI responsiveness: modern web standards. Approved action execution: finalized within minutes. |
| Concurrent users | Multi-tenant. Each operator is isolated. Assume peak load during school operating hours (6am–9pm local time per location timezone). |
| Cost constraints | LLM calls for suggestion rationale generation must be minimised — batch where possible. Use structured prompts with capped output tokens. Suggestion generation should not block the polling loop. |

| CRITICAL: FSP Rate Limit — 60 calls / 60 seconds (RESOLVED) This is the single most important architectural constraint in the entire project. 1,300 operators polled every 60s = 1,300 calls/min = 21x over the limit. Naive polling will not work. Solution: Azure Service Bus rate-limited dispatcher with tiered polling cadence. Tier 1 (flights today / recent cancellations): poll every ~1 min Tier 2 (flights this week): poll every ~5 min Tier 3 (no upcoming flights): poll every ~30 min Dispatcher holds a token bucket capped at 55 calls/min (5 headroom for safety). 429 errors trigger exponential backoff and re-queue — never silent failure. |
| --- |

| 3 | Reliability Requirements | Part 1 |
| --- | --- | --- |

| Cost of a wrong suggestion | High. A bad scheduling suggestion accepted without scrutiny can create student-aircraft-instructor conflicts, compliance violations, or stranded students. Every suggestion must include a plain-English rationale. |
| --- | --- |
| Non-negotiable verification | 1. validate-only call to FSP before any reservation creation.  2. Scheduler must explicitly approve before any booking is made.  3. No auto-apply in Phase 1 — every change requires human confirmation. |
| Human-in-the-loop | Mandatory in Phase 1. All changes flow through the scheduler approval queue. Bulk approve/decline is supported but each suggestion is individually visible with rationale. |
| Audit / compliance needs | Immutable event log of all suggestions, approvals, rejections, bookings, and communications. Minimum 1-year retention. Aligned with FAA AC 120-78B electronic record-keeping standards. Non-repudiable: actor ID + timestamp on every event. |

| 4 | Team & Skill Constraints | Part 1 |
| --- | --- | --- |

| Agent frameworks | Phase 1 does not require a heavy agent framework (LangChain/LangGraph). The agent logic is deterministic: detect change → rank candidates → generate rationale via LLM → write suggestion. A lightweight custom orchestrator in TypeScript or C# is sufficient and more maintainable. |
| --- | --- |
| Domain experience | Aviation scheduling domain knowledge needed: understanding of FAA Part 61/141 requirements, daylight/civil twilight constraints, instructor duty-time rules, and aircraft airworthiness states. |
| Eval / testing | Eval framework needed from day one — scheduling suggestions must be testable against known-good outcomes. Mock FSP API responses required for unit tests (real FSP calls in integration tests only). |

| TS | Tech Stack | Part 1 |
| --- | --- | --- |

**PART 2 — ARCHITECTURE DISCOVERY**

| Layer | TypeScript path | C# path |
| --- | --- | --- |
| Language | TypeScript (strict mode) | C# 12 / .NET 8 |
| Backend framework | NestJS — modules, DI, guards, interceptors map cleanly to multi-tenant SaaS patterns | ASP.NET Core 8 — native Azure integration, stronger typing discipline, enterprise-grade DI |
| Scheduler / worker | BullMQ (Redis-backed) or Azure Service Bus SDK for Node | Azure Service Bus SDK for .NET — native, managed identity support |
| Frontend / console | Next.js 14 (App Router) — shared TypeScript types with backend in monorepo | Next.js 14 (App Router) — preferred for UI velocity regardless of backend choice |
| Database ORM | Prisma — type-safe, migration-first, excellent PostgreSQL support | Entity Framework Core 8 — code-first migrations, LINQ queries |
| Database | PostgreSQL on Azure Database for PostgreSQL (Flexible Server) | PostgreSQL on Azure Database for PostgreSQL (Flexible Server) |
| Message queue | Azure Service Bus (Standard tier) — polling dispatcher, change events, suggestion results | Azure Service Bus (Standard tier) — same topology for both paths |
| LLM client | Anthropic TypeScript SDK — @anthropic-ai/sdk — claude-3-5-sonnet-20241022 | Anthropic .NET SDK or HttpClient — claude-3-5-sonnet-20241022 |
| FSP API client | Typed fetch wrapper — one class per API section (19 total), shared DTOs | Typed HttpClient — one service class per API section (19 total), shared DTOs |
| Secrets | Azure Key Vault + @azure/keyvault-secrets + DefaultAzureCredential | Azure Key Vault + Azure.Security.KeyVault.Secrets + DefaultAzureCredential |
| Auth | FSP auth library + JWT middleware in NestJS guards | FSP auth library + JWT middleware in ASP.NET Core |
| Observability | Azure Application Insights SDK for Node.js | Azure Application Insights SDK for .NET |
| Testing | Vitest (unit) + Supertest (integration) + MSW (FSP API mocking) | xUnit (unit) + WireMock.Net (FSP mocking) + TestContainers (DB) |
| CI/CD | GitHub Actions — lint, test, build, deploy to Azure Container Apps | GitHub Actions — lint, test, build, deploy to Azure Container Apps |

| Decision: TypeScript (NestJS) We chose TypeScript with NestJS as the backend and Next.js 14 for the scheduler console. Reason 1 — Monorepo type safety: shared DTOs across NestJS backend and Next.js frontend eliminate DTO drift entirely. One type definition, two consumers. Reason 2 — LLM integration: Anthropic TypeScript SDK (@anthropic-ai/sdk) is the most mature and best-documented path for Claude 3.5 Sonnet structured output. Reason 3 — Multi-tenant DI: NestJS module system and dependency injection maps directly to per-tenant config injection — each operator's policy, weights, and FSP credentials are injected at the request level. Reason 4 — Iteration speed: scheduling logic will change frequently in Phase 1. TypeScript's fast feedback loop (ts-node, Vitest watch mode) reduces the cost of each iteration. The C# path comparison is retained above for reference — the architecture is identical if the team is .NET-first. |
| --- |

| 5 | Agent Framework Selection | Part 2 |
| --- | --- | --- |

| Framework decision | Custom lightweight orchestrator — NOT LangChain/LangGraph for Phase 1. The scheduling logic is deterministic enough that a purpose-built pipeline outperforms a general-purpose agent framework in latency, debuggability, and cost. |
| --- | --- |
| Architecture | Single-agent per suggestion event. Each scheduling suggestion is generated independently. No multi-agent coordination needed in Phase 1. |
| State management | Suggestion state machine: PENDING → APPROVED / REJECTED / EXPIRED. Stored in PostgreSQL. Azure Service Bus manages async job queuing between polling and suggestion generation. |
| Tool integration complexity | Moderate. 8–10 FSP API endpoints per use case. All tool calls are synchronous HTTP with retry logic. No streaming or long-running tool calls. |

| 6 | LLM Selection | Part 2 |
| --- | --- | --- |

| Recommended model | Claude 3.5 Sonnet — claude-3-5-sonnet-20241022 (Anthropic). Outperforms GPT-4o for strict JSON formatting and adherence to complex system prompts — critical for generating typed { candidateId, rationale, confidence, constraintsSatisfied[] } output without hallucinating free-form text. |
| --- | --- |
| Function calling | Required for structured suggestion generation. The LLM must output a typed JSON object: { candidateId, rationale, confidence, constraintsSatisfied[] }. No free-form text output accepted. |
| Context window needs | Low-moderate. Each suggestion prompt includes: operator config, student profile snippet, available slots list (top 5), constraint checklist. Fits comfortably in 8k tokens. |
| Cost per query | Target < $0.01 per suggestion generated. Use capped max_tokens (500 for rationale). Batch low-priority suggestions where latency is acceptable (use case D — next lesson is less time-sensitive than waitlist fill). |

| 7 | Tool Design & API Mapping | Part 2 |
| --- | --- | --- |

Each use case maps to a specific set of FSP API calls. The table below defines the complete tool surface for Phase 1:

| Use case | Trigger / detection | FSP APIs required | Local DB needed? |
| --- | --- | --- | --- |
| A. Waitlist | Poll reservations list (§13)
Detect status change to cancelled | Schedule §9 · Find-a-Time §12
Availability batch §8 · Civil twilight §18
Reservation validate+create §13
Enrollment progress §15 | Priority weight config
Suggestion + rationale
Audit log entry |
| B. Reschedule | Poll reservations list (§13)
Detect cancellation event | Cancellation reasons §9
Find-a-Time §12
Availability + overrides §8
Reservation validate+create §13 | Suggestion + rationale
Audit log entry |
| C. Discovery | Prospect form submission
(stored locally) | Civil twilight §18 · Find-a-Time §12
Instructors §5 · Aircraft §4
Reservation create §13 | Prospect profile
Discovery flight fields
Suggestion + rationale |
| D. Next lesson | Scheduled job:
Scan training queue §10
Completed reservations §13 | Schedulable events §10
Enrollment progress §15
AutoSchedule solver §11
Availability §8 | Suggestion + rationale
Audit log entry |

| Find-a-Time vs AutoSchedule (RESOLVED) Find-a-Time (§12): Use for single-slot lookups — use cases A, B, C. Fast, lightweight, designed for one student + one activity type + date range. AutoSchedule solver (§11): Use for bulk scheduling — use case D only. Heavy payload (aircraft, instructors, students, daylight bounds, stagger groups). Use when scheduling multiple lessons across a date range for a student. Returns results in UTC — convert to local time using timeZoneOffset before creating reservations. |
| --- |

| Webhook support (RESOLVED — affects detection architecture) FSP does NOT offer public documented webhook support for reservation state changes. Polling is the mandatory path for all schedule change detection. Endpoint: POST /api/V1/operator/{operatorId}/operatorReservations/list Compare response against last-known state hash stored in local DB to detect changes. Detection-to-recommendation target: < 30 seconds end-to-end. |
| --- |

| 8 | Observability Strategy | Part 2 |
| --- | --- | --- |

| Observability stack | Azure Monitor + Application Insights (natural fit given Azure hosting). Centralised logs, metrics, and distributed traces across polling jobs, suggestion generation, and approval queue. |
| --- | --- |
| Key metrics to track | Suggestion acceptance rate (accepted vs total generated)  \|  Time-to-fill (opening detected → booking confirmed)  \|  Queue depth (pending approvals per operator)  \|  FSP API call rate vs 60-call limit  \|  LLM call latency and cost per suggestion  \|  Aircraft utilization coefficient (C_util) per operator |
| Operator-visible dashboard | Queue health · Suggestion acceptance rate · Time-to-fill trend · Weekly flight hours delta vs baseline. This is a key value demonstration — show operators the ROI directly. |
| Real-time monitoring | Alert on: polling queue lag > 5 min for Tier 1 tenants, FSP 429 rate > 5% of calls, approval queue depth > 50 pending per operator, LLM error rate > 1%. |
| Cost tracking | Track LLM API spend per tenant per day. Surface in operator dashboard. Enables per-tenant billing model in future phases. |

| 9 | Evaluation Approach | Part 2 |
| --- | --- | --- |

| Measuring correctness | Primary metric: scheduler acceptance rate without edits. A suggestion accepted with zero modifications = correct. A suggestion rejected or heavily edited = incorrect. Track both at operator level and use-case level. |
| --- | --- |
| Ground truth data | Historical FSP scheduling data from consenting operators. Replay past cancellations and measure whether the system would have suggested the same student the human actually booked. |
| Automated vs human eval | Both. Automated: constraint satisfaction checks (daylight, availability, activity type match) — these are binary pass/fail. Human: rationale quality and suggestion relevance — sampled weekly by product team. |
| CI integration | Eval suite runs on every PR against a mock FSP dataset. Must pass: 100% constraint satisfaction, > 80% top-1 match with historical ground truth on waitlist use case. |

| 10 | Verification Design | Part 2 |
| --- | --- | --- |

| Claims that must be verified | 1. Student is available at the proposed time.  2. Instructor is available and qualified.  3. Aircraft is airworthy and not double-booked.  4. Slot is within daylight hours (where required).  5. Activity type matches student's next required lesson.  6. Reservation passes FSP validate-only check. |
| --- | --- |
| Verification data sources | FSP availability API §8 (students + instructors) · Aircraft squawks §4 and maintenance reminders §4 · Civil twilight §18 · Schedulable events §10 · FSP validateOnly reservation call §13 |
| Confidence thresholds | Each suggestion carries a confidence score (0–1) based on: number of constraints satisfied, quality of availability match, instructor continuity score. Suggestions below 0.6 are flagged for extra review in the queue. |
| Escalation triggers | Suggest human review if: aircraft has open squawks, instructor availability is an override (not regular schedule), student has missed 2+ consecutive lessons (may indicate dropout risk), or slot is within 2 hours of civil twilight boundary. |

**PART 3 — POST-STACK REFINEMENT**

| 11 | Failure Mode Analysis | Part 3 |
| --- | --- | --- |

| Tool / API failures | All FSP API calls wrapped in retry logic with exponential backoff (3 retries, max 30s). On permanent failure: mark suggestion as GENERATION_FAILED, log error, alert operator. Never silently skip. |
| --- | --- |
| FSP 429 rate limit hit | Dispatcher token bucket prevents this in normal operation. If hit: pause all polling for 60s, re-queue affected jobs at back of Tier 1 queue, log incident, alert if frequency > 3 per hour. |
| Ambiguous scheduling conflict | If validate-only returns conflicts: surface them in the suggestion card as warnings, not blockers. Scheduler sees the conflict and decides. Never auto-override FSP validation errors. |
| LLM unavailability | Rationale generation fails gracefully. Suggestion is still created with a template-based fallback rationale ("Suggested based on availability match and priority score"). LLM is for UX, not correctness. |
| Stale availability data | Availability is fetched fresh for every suggestion generation cycle, never cached. If fetch fails, suggestion is deferred 5 minutes and retried once before failing. |

| 12 | Security Considerations | Part 3 |
| --- | --- | --- |

| Prompt injection prevention | Scheduling data from FSP (student names, comments, notes) must be sanitised before insertion into LLM prompts. Use structured templating — never raw string concatenation of FSP data into prompts. |
| --- | --- |
| Data leakage risks | Strict tenant isolation at all layers: database row-level security by operatorId, API middleware validates operatorId on every request, LLM prompts must never include cross-tenant data. US data residency required. |
| API key management | FSP subscription key in Azure Key Vault (not environment variables in production). LLM API key rotated quarterly. All secrets accessed via managed identity, not hardcoded. |
| Audit logging requirements | Every API call to FSP logged (method, endpoint, operatorId, timestamp, response status). Every suggestion generated, approved, or rejected logged with actor ID. Logs immutable — append-only store, 1-year minimum retention. SOC 2 Type 2 adherence required. |
| Auth model | FSP auth library for API access (Bearer token per operator session). Least-privilege scopes. Token refresh handled by background service. Scheduler console uses FSP SSO — no separate credential store. |

| 13 | Testing Strategy | Part 3 |
| --- | --- | --- |

| Unit tests | Each FSP API wrapper function tested with mocked HTTP responses. Suggestion ranking algorithm tested with synthetic student datasets covering edge cases: no eligible candidates, tie-breaking, daylight boundary edge. |
| --- | --- |
| Integration tests | End-to-end flow tests against FSP sandbox environment. Cover: cancellation detected → suggestion generated → approve → reservation created in FSP. All 4 use cases covered. |
| Adversarial testing | Test with: malformed FSP responses, 429 errors mid-flow, LLM timeout, concurrent approvals of the same slot by two schedulers (race condition), student availability changes between suggestion generation and approval. |
| Regression testing | Snapshot tests on suggestion output for a fixed set of historical scenarios. Any change to ranking algorithm must justify delta in snapshot output. Run on every PR. |

| 14 | Open Source Planning | Part 3 |
| --- | --- | --- |

| What to release | FSP API client library (TypeScript/C#) — the typed wrapper around all 19 API sections from the appendix. This is genuinely useful to any FSP developer and creates community goodwill. |
| --- | --- |
| Licensing | MIT for the FSP API client. Core scheduler logic (ranking algorithm, suggestion engine) remains proprietary. |
| Documentation | API client: auto-generated from TypeScript types + hand-written usage examples for each of the 19 API sections. README with quickstart, authentication guide, rate limit handling. |
| Community | Not a priority for Phase 1. Revisit after launch with real operator feedback. |

| 15 | Deployment & Operations | Part 3 |
| --- | --- | --- |

| Hosting | Azure (PRD-specified). App Service or Azure Container Apps for the API + scheduler engine. Azure Service Bus for the polling queue. PostgreSQL on Azure Database for PostgreSQL. Azure Key Vault for secrets. |
| --- | --- |
| CI/CD | GitHub Actions pipeline: lint → unit tests → integration tests (FSP sandbox) → eval suite → deploy to staging → promote to production on manual approval. Feature flags via Azure App Configuration for per-tenant rollout. |
| Monitoring & alerting | Azure Monitor + Application Insights. PagerDuty or Azure alerts for: polling queue lag, FSP 429 spike, LLM error rate, approval queue backlog, database connection pool exhaustion. |
| Rollback strategy | Blue-green deployment. Any production issue: instant rollback to previous container image. Database migrations are always backwards-compatible (no destructive schema changes without a dual-read period). |
| Environment config | Three environments: develop (FSP dev sandbox, development-fsp.azure-api.net), staging (FSP staging), production. Environment variables managed via Azure App Configuration + Key Vault references. |

| 16 | Iteration Planning | Part 3 |
| --- | --- | --- |

| User feedback collection | In-app: schedulers can rate each suggestion (thumbs up/down) and leave a short reason on rejection. This data feeds directly into ranking algorithm improvement. Monthly review of top rejection reasons. |
| --- | --- |
| Eval-driven improvement | Every sprint: review acceptance rate by use case. If use case A acceptance rate drops below 70%, investigate top rejection reasons before adding new features. Metrics drive the roadmap. |
| Feature prioritisation | Priority order for next-iteration candidates: (1) improve suggestion accuracy on existing use cases, (2) reduce time-to-fill metric, (3) add Phase 2 features. New use cases only after existing ones hit >80% acceptance rate. |
| Long-term maintenance | FSP API versioning: monitor for breaking changes (V1 vs V2 endpoints already mixed in docs). Maintain a compatibility layer so FSP API updates don't break the scheduler. Quarterly dependency audit. |

**ADDITIONAL SECTIONS — PROJECT-SPECIFIC**

| 17 | Polling Architecture Detail | Additional |
| --- | --- | --- |

Because FSP has no webhooks and enforces a 60-call/60-second rate limit, the polling design is the most critical infrastructure decision in the project.

| Rate budget allocation | 55 calls/min reserved for polling (5 headroom). With 1,300 tenants: average poll interval = 55/1300 * 60 = ~2.5 seconds per tenant on average. Tier 1 tenants get more frequent slots; Tier 3 get fewer. |
| --- | --- |
| Tier classification | Tier 1: operator has flights scheduled today or a cancellation in the last 2 hours. Tier 2: operator has flights this week. Tier 3: no flights in the next 7 days. Re-classified every hour. |
| Change detection | Store a hash of the last-seen reservations response per operator. On each poll, compare new response hash. If changed: diff the two responses to identify specific reservation state changes, then trigger the appropriate use-case handler. |
| Queue technology | Azure Service Bus with separate queues for: PollJobs (rate-limited dispatcher reads from here), ChangeEvents (detected changes awaiting suggestion generation), SuggestionResults (completed suggestions awaiting queue display). |

| 18 | Core Data Model (Local DB) | Additional |
| --- | --- | --- |

The following entities live in our PostgreSQL database. FSP data is never duplicated here — only our derived artifacts.

| operators | operatorId (FSP) · policy config (JSON) · priority weights · polling tier · last_polled_at · subscription_key (encrypted ref) |
| --- | --- |
| suggestions | id · operator_id · use_case_type (A/B/C/D) · status (PENDING/APPROVED/REJECTED/EXPIRED) · candidate_payload (JSON) · rationale (text) · confidence_score · fsp_validate_result · created_at · resolved_at · resolved_by |
| audit_log | id · operator_id · event_type · actor_id · suggestion_id · payload (JSON) · timestamp — append-only, no deletes |
| discovery_prospects | id · operator_id · first_name · last_name · email · phone · preferred_dates (JSON) · consent_marketing · payment_status · source · created_at — stores fields FSP does not support |
| communications | id · operator_id · suggestion_id · channel (email/SMS) · recipient_id · template_id · sent_at · status · provider_message_id |

| 19 | Standout Differentiators vs FSP Native Scheduling | Additional |
| --- | --- | --- |

Based on the competitive research, these are the features that make this scheduler stand out against FSP's native tools and competitors like Aviatize:

| Feature | What it does | Competitive edge |
| --- | --- | --- |
| Explainable suggestions | Every suggestion card shows plain-English rationale: why this student, why this slot, which constraints were checked. | FSP has no rationale. Schedulers currently guess why a slot was suggested. |
| 4-layer validation | Before proposing: check student docs, activity type, aircraft tail, syllabus sequence. Prevents compliance errors. | Aviatize does this — FSP does not. Prevents solo bookings with expired medicals. |
| Utilization dashboard (C_util) | Real-time aircraft utilization coefficient per operator. Shows ROI of the scheduler directly. | No competing scheduler shows this metric. Quantifies the $30-50k/yr revenue recovery. |
| Priority weight config | Operators tune waitlist ranking: time since last flight, hours toward checkride, custom signals. | FSP has no configurable waitlist ranking. First-come-first-served only. |
| Weather-aware ranking | METAR/TAF feeds into suggestion confidence. VFR slots deprioritised in IFR forecast. | No scheduler currently surfaces weather confidence on suggestion cards. |
| Immutable audit trail | Full AC 120-78B aligned log of every suggestion, approval, booking, and communication. | Directly addresses FSP's weakest compliance story for Part 141 schools. |

| 20 | SMS Provider Decision | Additional |
| --- | --- | --- |

| Decision status | OPEN — PRD requires SMS as a reusable external service. No provider specified. |
| --- | --- |
| Option A: Azure Communication Services | Pros: native Azure integration, single vendor, managed identity auth, no extra billing account. Cons: less mature than Twilio, fewer global carrier partnerships. |
| Option B: Twilio | Pros: industry standard, best global deliverability, excellent reliability track record, rich SDK. Cons: additional third-party dependency, separate billing. |
| Recommendation | Build an SMS service interface (ISmsProvider) from day one. Inject either implementation. This means the provider choice is swappable without changing business logic — decide at deployment time per operator region. |

*End of Pre-Search Checklist*
Agentic Scheduler for Flight Schedule Pro — Phase 1 MVP
