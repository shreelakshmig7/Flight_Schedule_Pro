# Agentic Scheduler for Flight Schedule Pro (FSP)
## Coding Standards

**For:** Cursor AI Agent  
**Project:** Agentic Scheduler — FSP Integration  
**Stack:** TypeScript · NestJS · Next.js 14 · PostgreSQL · Azure Service Bus · Azure Container Apps  
**Note:** This document is for development use only — not for submission

---

## 1. Test-Driven Development (TDD) — MANDATORY

Every single file must follow this exact sequence. No exceptions.

**Sequence:**
1. Write the test file first
2. Run tests — confirm they FAIL
3. Write the implementation file
4. Run tests — confirm they PASS
5. Save results to `tests/results/` with a descriptive filename

**Never write implementation before tests exist.**  
**Never skip saving results — they are proof of TDD.**

**Test file locations by app:**

| App / Package | Test location |
|---|---|
| `apps/api` | `apps/api/test/` |
| `apps/worker` | `apps/worker/test/` |
| `apps/web` | `apps/web/test/` |
| `packages/fsp-client` | `packages/fsp-client/test/` |
| `packages/shared-types` | `packages/shared-types/test/` |
| `packages/database` | `packages/database/test/` |

---

## 2. File Header Comment — Every File

The very first thing in every TypeScript file must be a comment block in this exact format:

```typescript
/**
 * filename.ts
 * -----------
 * Agentic Scheduler — FSP Integration — [One line description]
 * ------------------------------------------------------------
 * [2-3 sentences describing what this module does and why it exists.
 * Include which PR introduced this file.]
 *
 * Key exports: [List of key classes, functions, or interfaces]
 *
 * Author: [Author name]
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-[number] — [PR title]
 */
```

**Example:**

```typescript
/**
 * rationale-generator.ts
 * ----------------------
 * Agentic Scheduler — FSP Integration — LLM rationale generator
 * --------------------------------------------------------------
 * Calls Claude 3.5 Sonnet to produce plain-English rationale for each
 * scheduling suggestion. Falls back to a deterministic template when the
 * LLM is unavailable or returns malformed output.
 *
 * Key exports: RationaleGenerator, RationaleResult
 *
 * Author: [Author name]
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-12 — LLM Rationale Generator
 */
```

---

## 3. Function and Method Documentation — Every Function

Every function and class method must have a JSDoc comment in this exact format:

```typescript
/**
 * One sentence describing what this function does.
 *
 * @param param1 - What this parameter is and what values are valid
 * @param param2 - What this parameter is and what values are valid
 * @returns What the return value contains
 * @throws {ErrorType} When and why this is thrown (if applicable)
 */
async function functionName(param1: string, param2: number): Promise<ResultType> {
```

**Example:**

```typescript
/**
 * Ranks a list of waitlist candidates by priority score using the operator's configured weight signals.
 *
 * @param candidates - Array of student candidates with their FSP profile data
 * @param weights - Operator-configured weight configuration from operators.priority_weights
 * @param operatorId - FSP operatorId for tenant scoping
 * @returns Sorted array of candidates with computed priority scores, highest score first
 * @throws {WeightConfigError} When weight configuration contains invalid signal keys
 */
async function rankCandidates(
  candidates: WaitlistCandidate[],
  weights: PriorityWeightConfig,
  operatorId: string
): Promise<RankedCandidate[]> {
```

---

## 4. Type Annotations — Every Function and Variable

Every function parameter, return value, and module-level variable must have an explicit TypeScript type annotation. No `any` is permitted except in test mocks and explicitly documented exceptions.

**Required on:**
- All function parameters
- All return values (including `Promise<T>` — never `Promise<any>`)
- All class properties
- All module-level constants
- All NestJS injectable class properties

**Prohibited:**
- `any` in production code — use `unknown` and narrow with type guards
- Implicit `any` from missing type annotations
- Type assertions (`as SomeType`) without a comment explaining why

**Accepted patterns for FSP API responses that have optional fields:**
```typescript
// Use explicit optional typing — never suppress with any
type FspReservation = {
  reservationId: string;
  pilotId: string;
  instructorId?: string | null;
  aircraftId?: string | null;
  status: ReservationStatus;
};
```

---

## 5. Error Handling — Every Function

Every function that calls an external service (FSP API, LLM, database, Service Bus) must handle failures explicitly. Raw exceptions must never propagate to the caller unhandled.

**Pattern for service methods:**

```typescript
async function callFspApi(operatorId: string, payload: RequestPayload): Promise<ServiceResult<ResponseType>> {
  try {
    const response = await fspClient.someMethod(payload);
    return { success: true, data: response };
  } catch (error) {
    if (error instanceof FspRateLimitError) {
      this.logger.warn('FSP rate limit hit', { operatorId, retryAfter: error.retryAfter });
      return { success: false, error: 'FSP rate limit reached — retry after 60 seconds', data: null };
    }
    if (error instanceof FspValidationError) {
      this.logger.error('FSP validation error', { operatorId, errors: error.errors });
      return { success: false, error: error.message, data: null, fspErrors: error.errors };
    }
    this.logger.error('Unexpected FSP error', { operatorId, error: String(error) });
    return { success: false, error: 'Unexpected error contacting FSP', data: null };
  }
}
```

**Rules:**
- Always catch the most specific exception first
- Always catch generic `Error` as final fallback
- Always return a typed `ServiceResult<T>` — never throw to the caller from a service method
- Error messages must be human-readable — no raw stack traces
- Every caught error must be logged with `operatorId` and `correlationId` in the log context
- Never swallow errors silently — always log before returning

**`ServiceResult<T>` type — defined in `packages/shared-types`:**

```typescript
type ServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string; data: null; fspErrors?: FspError[] };
```

---

## 6. Hardcoded Scheduling Rules — Never Use Magic Numbers

These values must be used exactly as written. Define them as constants in `packages/shared-types/src/constants.ts` and import from there. Never inline these values.

**FSP rate limiting:**
```typescript
export const FSP_RATE_LIMIT_CALLS_PER_MINUTE = 60;
export const FSP_RATE_LIMIT_SAFE_CALLS_PER_MINUTE = 55; // 5-call safety headroom
export const FSP_RATE_LIMIT_PAUSE_SECONDS = 60;
export const FSP_MAX_RETRIES = 3;
export const FSP_RETRY_BACKOFF_MS = [1000, 2000, 4000]; // exponential backoff
```

**Polling tiers:**
```typescript
export const POLLING_TIER1_INTERVAL_SECONDS = 60;    // flights today / recent cancellation
export const POLLING_TIER2_INTERVAL_SECONDS = 300;   // flights this week
export const POLLING_TIER3_INTERVAL_SECONDS = 1800;  // no flights in 7 days
export const POLLING_TIER_RECLASSIFY_INTERVAL_HOURS = 1;
export const POLLING_TIER1_RECENT_CANCELLATION_HOURS = 2;
export const POLLING_TIER1_UPCOMING_FLIGHT_HOURS = 24;
export const POLLING_TIER2_UPCOMING_FLIGHT_DAYS = 7;
```

**Suggestion engine:**
```typescript
export const SUGGESTION_EXPIRY_DEFAULT_HOURS = 24;
export const SUGGESTION_LOW_CONFIDENCE_THRESHOLD = 0.6; // warn scheduler below this
export const SUGGESTION_MAX_CANDIDATES_TO_VALIDATE = 3; // max FSP validateOnly attempts per event
export const SUGGESTION_MAX_CANDIDATES_TO_RANK = 20;    // max candidates through full ranking
export const SUGGESTION_MAX_RESCHEDULE_OPTIONS = 3;     // default N alternatives per cancellation
export const SUGGESTION_MAX_DISCOVERY_OPTIONS = 3;      // default N options per discovery request
```

**Priority weight normalisation:**
```typescript
export const WEIGHT_TIME_SINCE_LAST_FLIGHT_CAP_DAYS = 90; // 90 days = score 1.0
export const WEIGHT_NEUTRAL_SCORE = 0.5; // score when signal cannot be computed
```

**LLM:**
```typescript
export const LLM_MODEL = 'claude-3-5-sonnet-20241022';
export const LLM_MAX_TOKENS = 500;
export const LLM_TIMEOUT_MS = 10000;
export const LLM_MIN_RATIONALE_CHARS = 50;
export const LLM_MAX_RATIONALE_CHARS = 400;
export const LLM_CONFIDENCE_OVERRIDE_THRESHOLD = 0.8;  // override LLM confidence if deterministic score disagrees
export const LLM_CONFIDENCE_OVERRIDE_CONSTRAINT_PCT = 0.8; // 80% constraints must pass for high confidence
```

**SMS:**
```typescript
export const SMS_MAX_LENGTH_CHARS = 160;
export const SMS_TRUNCATE_LENGTH_CHARS = 157; // leave room for '...'
```

**Audit log:**
```typescript
export const AUDIT_LOG_RETENTION_YEARS = 1;
export const AUDIT_LOG_ARCHIVE_BATCH_SIZE = 1000;
```

**Tenant isolation:**
```typescript
export const TOKEN_REFRESH_BUFFER_MINUTES = 5; // refresh when < 5 min remaining
export const DEAD_LETTER_MAX_DELIVERY_COUNT = 5;
export const DEAD_LETTER_SWEEP_INTERVAL_MINUTES = 15;
```

---

## 7. Tenant Isolation — MANDATORY on Every Database Query

Every database query in every service must include the `operatorId` from `TenantContext` in the `where` clause. This is the application-layer tenant isolation mechanism.

**Correct:**
```typescript
const suggestion = await this.prisma.suggestion.findFirst({
  where: {
    id: suggestionId,
    operatorId: this.tenantContext.operatorId, // ALWAYS include this
  },
});
```

**Incorrect — never do this:**
```typescript
// Missing operatorId — allows cross-tenant data access
const suggestion = await this.prisma.suggestion.findFirst({
  where: { id: suggestionId },
});
```

**Rule:** If a database query does not include `operatorId: this.tenantContext.operatorId` in its `where` clause, it is a security bug. The only exception is the `operators` table lookup by `fspOperatorId` during bootstrap and authentication.

---

## 8. FSP API Client Usage Rules

The FSP API client in `packages/fsp-client` is the only place in the codebase that makes HTTP calls to FSP. No other file may import `axios` or make direct HTTP calls to FSP URLs.

**Correct:**
```typescript
import { ReservationsService } from '@fsp-scheduler/fsp-client';

const result = await this.reservationsService.validateReservation(operatorId, payload);
```

**Incorrect — never do this:**
```typescript
// Never make direct HTTP calls to FSP outside the fsp-client package
import axios from 'axios';
const response = await axios.post('https://api-develop.flightschedulepro.com/api/V2/Reservation', payload);
```

**Reservation creation rules:**
- Always call `validateReservation({ ...payload, validateOnly: true })` before `createReservation({ ...payload, validateOnly: false })`
- `start` and `end` fields must be in local time (no timezone suffix) — never convert to UTC before passing to the FSP client
- Always check `result.errors` on the validate response before proceeding to create

---

## 9. LLM Prompt Safety Rules

The LLM prompt must never contain raw FSP API response data. Only pass sanitised, structured fields.

**Correct:**
```typescript
const prompt = {
  studentName: candidate.firstName, // structured field
  slotDate: formatDate(slot.startTime), // formatted value
  constraintsSatisfied: constraintResults.passed, // structured list
  priorityScore: score.toFixed(3), // formatted number
};
```

**Incorrect — never do this:**
```typescript
// Never inject raw FSP response data into prompts — prompt injection risk
const prompt = `Here is the FSP reservation data: ${JSON.stringify(rawFspResponse)}`;
```

**Additional LLM rules:**
- The LLM is never in the critical path for constraint checking — all constraints are checked deterministically first
- If the LLM returns a `confidence` score above `LLM_CONFIDENCE_OVERRIDE_THRESHOLD` but fewer than `LLM_CONFIDENCE_OVERRIDE_CONSTRAINT_PCT` of constraints passed, override the LLM confidence with the deterministic score
- Always validate LLM JSON output against the expected schema before using it — malformed output triggers the fallback template, not an error

---

## 10. Audit Log Rules — Append-Only

The `audit_log` table is append-only. No code may call `prisma.auditLog.update()` or `prisma.auditLog.delete()`. Every state-changing action must write an audit log entry.

**Every audit log entry must include:**
```typescript
await this.prisma.auditLog.create({
  data: {
    operatorId: this.tenantContext.operatorId,
    eventType: AuditEventType.SUGGESTION_APPROVED, // use enum — never inline strings
    actorId: actorId ?? null, // null for system events
    suggestionId: suggestionId ?? null,
    payload: {
      // include enough context to reconstruct what happened
      previousStatus: 'PENDING',
      newStatus: 'APPROVED',
      fspReservationId: reservationId,
    },
  },
});
```

**Audit event types — defined as enum in `packages/shared-types`:**
```typescript
export enum AuditEventType {
  SUGGESTION_CREATED = 'SUGGESTION_CREATED',
  SUGGESTION_APPROVED = 'SUGGESTION_APPROVED',
  SUGGESTION_REJECTED = 'SUGGESTION_REJECTED',
  SUGGESTION_EXPIRED = 'SUGGESTION_EXPIRED',
  RESERVATION_CREATED = 'RESERVATION_CREATED',
  NOTIFICATION_SENT = 'NOTIFICATION_SENT',
  OPERATOR_CONFIG_UPDATED = 'OPERATOR_CONFIG_UPDATED',
  POLLING_429_RECEIVED = 'POLLING_429_RECEIVED',
  CHANGE_DETECTED = 'CHANGE_DETECTED',
}
```

---

## 11. Logging Rules — What Never Goes in Logs

The following must never appear in any log statement, Application Insights event, or console output:

- Student names, prospect names, or any personal name
- Email addresses
- Phone numbers
- FSP API subscription keys or tokens
- Anthropic API keys
- Database connection strings
- SMS message body content
- Any field from `operators.notification_config` that contains template content

**Correct:**
```typescript
this.logger.log('SMS dispatched', {
  operatorId: this.tenantContext.operatorId,
  communicationId: communication.id,
  channel: 'SMS',
  status: 'SENT',
  // recipient address and body NOT logged
});
```

**Incorrect — never do this:**
```typescript
this.logger.log(`SMS sent to ${phoneNumber}: ${messageBody}`); // PII in logs
```

**Every log entry must include:**
- `operatorId` — for tenant context
- `correlationId` — for distributed tracing
- `service` — which app/module produced the log

---

## 12. Eval Test Case Format

All test cases must follow the project YAML format exactly.

**File location:** `eval/golden_data.yaml`

**Format:**
```yaml
test_cases:
  - id: "fsp-001"
    category: "happy_path"
    pr: "PR-13"
    use_case: "waitlist"
    description: "One sentence describing the scenario being tested"
    trigger:
      changeType: "NEW_OPENING"
      operatorId: "test-operator-001"
      locationId: "loc-123"
      slotStart: "2025-10-15T14:00:00Z"
      slotEnd: "2025-10-15T16:00:00Z"
    expected_fsp_calls:
      - FindATimeService.getAvailableSlots
      - CivilTwilightService.getCivilTwilight
      - AvailabilityService.getBatchAvailability
      - ReservationsService.validateReservation
    must_contain:
      - suggestion created
      - status: PENDING
      - confidence_score
    must_not_contain:
      - error
      - uncaught exception
      - undefined
    expected_suggestion_status: "PENDING"
    expected_confidence_min: 0.6
    difficulty: "happy_path"
```

**Required fields:** `id`, `category`, `pr`, `use_case`, `description`, `trigger`, `expected_fsp_calls`, `must_contain`, `must_not_contain`, `expected_suggestion_status`, `difficulty`

**`must_not_contain` must always include at minimum:**
- `"error"`
- `"uncaught exception"`
- `"undefined"`
- Any domain-specific incorrect output relevant to the test case (e.g. `"open squawk"` for a test where aircraft should be valid)

**Categories used in this project:**
- `happy_path` — standard successful flow
- `edge_case` — boundary conditions, optional fields absent, search window edge
- `adversarial` — bad input, malicious data in FSP response, prompt injection attempt
- `constraint_violation` — daylight constraint, availability conflict, aircraft squawk, FSP validation failure
- `rate_limit` — 429 handling, token bucket exhaustion
- `fallback` — LLM timeout, LLM malformed output, FSP unavailable

---

## 13. Regression Testing Rule

After every new PR is implemented, run the full eval suite before moving on.

**Command:**
```bash
python eval/run_eval.py
```

**Rule:** If any test case that previously passed now fails — stop. Fix the regression before proceeding. Do not move forward with a regression present.

**Results must be saved** to `tests/results/` with a descriptive filename after every run.

**Naming convention for result files:**
```
tests/results/pr-13-waitlist-automation-[YYYY-MM-DD].txt
tests/results/pr-14-reschedule-regression-[YYYY-MM-DD].txt
```

---

## 14. File Naming Conventions

| File type | Convention | Example |
|---|---|---|
| TypeScript modules | `kebab-case.ts` | `rationale-generator.ts` |
| NestJS modules | `kebab-case.module.ts` | `suggestions.module.ts` |
| NestJS services | `kebab-case.service.ts` | `polling-dispatcher.service.ts` |
| NestJS controllers | `kebab-case.controller.ts` | `suggestions.controller.ts` |
| NestJS guards | `kebab-case.guard.ts` | `fsp-auth.guard.ts` |
| Use case handlers | `kebab-case.handler.ts` | `waitlist.handler.ts` |
| Type definition files | `kebab-case.types.ts` | `fsp.types.ts` |
| Constant files | `kebab-case.constants.ts` | `scheduling.constants.ts` |
| Test files | `kebab-case.spec.ts` | `waitlist.handler.spec.ts` |
| Next.js pages | `page.tsx` in route folder | `app/queue/page.tsx` |
| Next.js components | `PascalCase.tsx` | `SuggestionCard.tsx` |
| Eval data | descriptive name | `golden_data.yaml` |
| Test results | `pr-[n]-[description]-[date].txt` | `pr-13-waitlist-2025-10-15.txt` |

---

## 15. What Never Goes in Code

- FSP subscription keys, API keys, or tokens — always in `.env` via Azure Key Vault references, never hardcoded
- Anthropic API keys — always in `.env`, never hardcoded
- Magic numbers for scheduling thresholds — always use constants from `packages/shared-types/src/constants.ts`
- Student names, email addresses, or phone numbers in log statements
- Raw FSP API response data in LLM prompts
- Direct HTTP calls to FSP URLs outside of `packages/fsp-client`
- Database queries without `operatorId` scoping (except bootstrap and auth)
- `TODO` comments in committed code — finish it or remove it
- `console.log` in production code — always use the NestJS `Logger` service
- `any` type in production code — use `unknown` and narrow with type guards

---

## 16. NestJS Patterns — Required Conventions

**Module structure:** Every feature must be a NestJS module with its own `module.ts`, `service.ts`, and `controller.ts` (where applicable). No business logic in controllers — controllers only handle HTTP concerns.

**Dependency injection:** Always inject dependencies via constructor injection. Never instantiate services directly with `new`.

```typescript
// Correct
@Injectable()
export class WaitlistHandler {
  constructor(
    private readonly fspClient: FspClientModule,
    private readonly priorityWeightEngine: PriorityWeightEngine,
    private readonly rationaleGenerator: RationaleGenerator,
    private readonly suggestionService: SuggestionService,
    private readonly logger: Logger,
  ) {}
}
```

**Request scoping:** `TenantContext` is request-scoped. Any service that uses `TenantContext` must be declared `@Injectable({ scope: Scope.REQUEST })` or receive `operatorId` as an explicit parameter.

**Guards:** Auth guard must be applied globally in `apps/api/src/main.ts` — not per-controller. Controllers opt out with `@Public()` decorator, not opt in.

---

## 17. Service Bus Message Rules

Every message published to a Service Bus queue must:
- Use the typed message schema from `packages/shared-types` — never publish raw objects
- Include a `correlationId` field for distributed tracing
- Be JSON-serialisable — no circular references, no `Date` objects (use ISO string)
- Set `contentType: 'application/json'` on the message

```typescript
// Correct
const message: PollJobMessage = {
  operatorId: operator.id,
  fspOperatorId: operator.fspOperatorId,
  tier: operator.pollingTier,
  scheduledAt: new Date().toISOString(), // ISO string — not Date object
  correlationId: crypto.randomUUID(),
};
await this.serviceBusSender.sendMessages({ body: message, contentType: 'application/json' });
```

---

*End of Coding Standards — Agentic Scheduler for Flight Schedule Pro (FSP)*
