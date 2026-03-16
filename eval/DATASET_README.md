# Agentic Scheduler — FSP Integration
## Eval Benchmark Suite v1.0

A structured evaluation dataset for the Agentic Scheduler — a multi-tenant
AI scheduling agent that integrates with Flight Schedule Pro (FSP).
All student names, operator names, and flight data are entirely fictional —
safe for public use.

---

## Dataset Overview

| Field | Value |
|---|---|
| **Dataset name** | Agentic Scheduler FSP Benchmark Suite v1.0 |
| **Total cases** | 42 |
| **Format** | YAML (`golden_data.yaml`) |
| **Eval harness** | `run_eval.py` |
| **Author** | [Author name] |
| **License** | MIT |
| **Privacy** | All names and identifiers are fictional — no real student or operator data |

---

## Categories

### 1. Happy Path — 10 cases (fsp-001 to fsp-010)

Standard successful flows covering all four MVP use cases.

**What is tested:**
- Waitlist automation: opening detected → candidate ranked → suggestion created within 30 seconds
- Reschedule on cancellation: up to 3 compatible alternatives generated
- Discovery flight: daylight-only slots proposed with eligible instructor and aircraft pairings
- Next lesson on completion: correct next lesson identified from enrollment progress
- Priority weight ranking: student with longest gap since last flight ranked highest
- Instructor continuity: same instructor prioritised when preference is configured
- Approve flow: FSP validateOnly called before reservation creation

**Example triggers:**
- `changeType: NEW_OPENING` — slot opens at loc-001, Tyler Brooks is top candidate
- `changeType: CANCELLATION` — res-005 cancelled, 3 alternatives generated
- `changeType: STATUS_CHANGE` — lesson marked complete, next lesson proposed
- `changeType: DISCOVERY_REQUEST` — prospect submits request, daylight slots generated

---

### 2. Edge Cases — 12 cases (fsp-011 to fsp-022)

Boundary conditions, optional configuration, and idempotency checks.

**What is tested:**
- Identical poll response produces no ChangeEventMessage (hash match)
- Duplicate FSP reservation entries deduplicated before change detection
- Maintenance block cancellation does not trigger suggestion generation
- Double-approval attempt returns HTTP 409 with no duplicate reservation
- Expired suggestion transitions correctly with audit log entry
- Student with no flight history receives neutral score (0.5), not excluded
- Tied priority scores broken deterministically by student ID
- Same-instructor preference with no same-instructor availability falls back correctly
- Discovery request with no eligible aircraft produces no suggestions
- Duplicate suggestion prevention during hourly scan (idempotency)
- Cross-tenant access returns empty results (no data leakage)
- Reject without reason returns HTTP 400

---

### 3. Adversarial — 6 cases (fsp-023 to fsp-028)

Security, injection, and failure resilience tests.

**What is tested:**
- Cross-tenant suggestion approval attempt returns HTTP 404 (no resource leak)
- HTML injection in student name is sanitised before email template rendering
- Email dispatch failure does not block the approval flow
- SMS not sent to student without opt-in — no communications record created
- SMS body truncated at 157 characters with `...` appended when over 160
- Direct audit_log UPDATE attempt raises PostgreSQL immutability exception

---

### 4. Constraint Violations — 8 cases (fsp-029 to fsp-036)

Cases where scheduling constraints prevent valid suggestions from being created.

**What is tested:**
- Top-ranked candidate unavailable → agent skips and tries next candidate
- Only available aircraft has open squawk → aircraft excluded, no suggestion created
- All 3 candidates fail FSP validateOnly → no suggestion created after 3 attempts
- No reschedule slots found within search window → no suggestion created
- Discovery request all preferred times outside civil twilight → no suggestion created
- Discovery eligible instructor filter applied correctly
- AutoSchedule duplicate eventIds deduplicated before suggestion creation
- Application Insights alert fires when 429 count exceeds threshold

---

### 5. Rate Limit — 2 cases (fsp-037 to fsp-038)

FSP rate limit enforcement tests.

**What is tested:**
- Token bucket exhausted: dispatcher waits for refill, no FSP call made while empty
- FSP returns 429: dispatcher pauses 60 seconds, re-enqueues poll job, logs to Application Insights

---

### 6. Fallback — 4 cases (fsp-039 to fsp-042)

LLM unavailability and confidence override tests.

**What is tested:**
- Anthropic API returns 500: fallback template used, suggestion still created
- Anthropic returns malformed JSON: schema validation detects it, fallback template used
- Anthropic API times out (10 second limit): fallback template used within timeout
- LLM returns high confidence (0.9) but only 50% of constraints pass: confidence overridden with deterministic score

---

## PR Coverage

| PR | Test cases |
|---|---|
| PR-8 Polling Dispatcher | fsp-037, fsp-038 |
| PR-9 Change Detection | fsp-011, fsp-012, fsp-013 |
| PR-10 Suggestion State Machine | fsp-014, fsp-015, fsp-023 |
| PR-11 Priority Weight Engine | fsp-016, fsp-017 |
| PR-12 LLM Rationale Generator | fsp-039, fsp-040, fsp-041, fsp-042 |
| PR-13 Use Case A — Waitlist | fsp-001, fsp-002, fsp-003, fsp-029, fsp-030, fsp-031 |
| PR-14 Use Case B — Reschedule | fsp-004, fsp-005, fsp-018, fsp-032 |
| PR-15 Use Case C — Discovery | fsp-006, fsp-007, fsp-019, fsp-033, fsp-034 |
| PR-16 Use Case D — Next Lesson | fsp-008, fsp-009, fsp-010, fsp-020, fsp-035 |
| PR-17 Email Notifications | fsp-024, fsp-025 |
| PR-18 SMS Notifications | fsp-026, fsp-027 |
| PR-19 Approval Queue | fsp-021, fsp-022 |
| PR-22 Audit Log | fsp-028 |
| PR-23 Observability | fsp-036 |

---

## Usage

### How to run

```bash
cd fsp-agentic-scheduler

# Run the full suite
python eval/run_eval.py

# Run only cases for a specific PR
python eval/run_eval.py --filter-pr PR-13

# Run only a specific category
python eval/run_eval.py --filter-category happy_path

# Run with a custom label for the results file
python eval/run_eval.py --label pr-13-waitlist
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `EVAL_API_BASE_URL` | Base URL of the running API | `http://localhost:3000` |
| `EVAL_AUTH_TOKEN` | FSP Bearer token for eval requests | `mock-fsp-bearer-token-test-operator-001` |

### YAML case structure

Each case follows this schema:

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
      fspOperatorId: 1001
      locationId: "loc-001"
      slotStart: "2025-10-16T14:00:00Z"
      slotEnd: "2025-10-16T16:00:00Z"
      aircraftId: "ac-001"
    expected_fsp_calls:
      - FindATimeService.getAvailableSlots
      - ReservationsService.validateReservation
    must_contain:
      - "PENDING"
      - "rationale"
    must_not_contain:
      - "error"
      - "uncaught exception"
      - "undefined"
    expected_suggestion_status: "PENDING"
    expected_confidence_min: 0.6
    difficulty: "happy_path"
```

### Required fields

`id`, `category`, `pr`, `use_case`, `description`, `trigger`, `must_contain`, `must_not_contain`, `difficulty`

### Optional fields

| Field | Description |
|---|---|
| `expected_fsp_calls` | FSP service methods that must have been called |
| `expected_fsp_calls_excluded` | FSP service methods that must NOT have been called |
| `expected_suggestion_status` | Required suggestion status after the trigger |
| `expected_suggestion_count` | Exact number of suggestions that must be created |
| `expected_confidence_min` | Pass if confidence_score >= this value |
| `expected_confidence_max` | Pass if confidence_score <= this value |

### Extending the dataset

Add new cases to `golden_data.yaml` following the schema above. Use the next sequential ID (e.g. `fsp-043`). Update the header comment block at the top of the file with a PR note describing what was added.

`must_not_contain` must always include at minimum:
- `"error"`
- `"uncaught exception"`
- `"undefined"`
- Any domain-specific incorrect output relevant to the test case

---

## Regression testing rule

After every PR is merged, run the full suite before moving on:

```bash
python eval/run_eval.py
```

If any previously passing test case now fails — stop. Fix the regression before proceeding. Results are saved to `tests/results/` automatically.

---

## Privacy

All student names, operator names, identifiers, and flight data in this dataset are **entirely fictional** and generated solely for testing purposes. Synthetic IDs (`usr-student-001`, `res-001`, `enroll-001`) follow the same principle.

This dataset contains **no real student or operator data** and is safe for public repositories.

---

## Related files

| File | Description |
|---|---|
| `golden_data.yaml` | Full benchmark dataset (42 cases as of v1.0) |
| `run_eval.py` | Eval harness that executes cases and scores results |
| `__init__.py` | Package init |
| `../mock_data/` | Synthetic FSP API response fixtures |
| `../mock_data/fsp.handlers.ts` | MSW handler wiring all 19 FSP API sections to mock data |
| `../PRD.md` | Product requirements document — 24 PRs |
| `../CODING_STANDARDS.md` | Coding standards for the project |
