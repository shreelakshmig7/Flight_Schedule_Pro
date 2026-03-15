# Eval Dataset — Agentic Scheduler

Test cases are defined in `golden_data.yaml` following the format in `CODING_STANDARDS.md §12`.

## Adding Test Cases

Each test case must include: `id`, `category`, `pr`, `use_case`, `description`, `trigger`, `expected_fsp_calls`, `must_contain`, `must_not_contain`, `expected_suggestion_status`, `difficulty`.

## Categories

| Category | Description |
|---|---|
| `happy_path` | Standard successful flow |
| `edge_case` | Boundary conditions, optional fields absent |
| `adversarial` | Bad input, prompt injection attempt |
| `constraint_violation` | Daylight, availability conflict, squawk, FSP failure |
| `rate_limit` | 429 handling, token bucket exhaustion |
| `fallback` | LLM timeout, malformed output, FSP unavailable |

## Running

```bash
python eval/run_eval.py
```

Results are saved to `tests/results/eval-<date>.txt`.
