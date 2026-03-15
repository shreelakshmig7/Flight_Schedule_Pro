#!/usr/bin/env python3
"""
run_eval.py
-----------
Agentic Scheduler — FSP Integration — Evaluation runner
--------------------------------------------------------
Loads test cases from golden_data.yaml and runs them against the worker
service. Results are saved to tests/results/ with a timestamped filename.

Usage:
    python eval/run_eval.py

Results are saved to:
    tests/results/eval-<YYYY-MM-DD>.txt

PR: PR-1 — Monorepo Setup (placeholder — full implementation in PR-13+)
"""

import sys
import os
import yaml
from datetime import date

GOLDEN_DATA_PATH = os.path.join(os.path.dirname(__file__), "golden_data.yaml")
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "tests", "results")


def load_test_cases() -> list:
    """Load test cases from golden_data.yaml."""
    with open(GOLDEN_DATA_PATH, "r") as f:
        data = yaml.safe_load(f)
    return data.get("test_cases") or []


def run_eval() -> None:
    """Run all eval test cases and save results."""
    test_cases = load_test_cases()

    if not test_cases:
        print("No test cases found in golden_data.yaml — skipping eval.")
        print("Add test cases as use case handlers are implemented (PRs 13-16).")
        result_lines = [
            f"Eval run: {date.today().isoformat()}",
            "Test cases: 0",
            "Result: SKIPPED — no test cases defined yet",
        ]
    else:
        passed = 0
        failed = 0
        result_lines = [f"Eval run: {date.today().isoformat()}"]

        for case in test_cases:
            case_id = case.get("id", "unknown")
            print(f"Running: {case_id}")
            # Full eval execution logic is implemented in PR-13+
            result_lines.append(f"PENDING: {case_id} — runner not yet implemented")

        result_lines.append(f"Passed: {passed} | Failed: {failed}")

    # Save results
    os.makedirs(RESULTS_DIR, exist_ok=True)
    result_filename = os.path.join(RESULTS_DIR, f"eval-{date.today().isoformat()}.txt")
    with open(result_filename, "w") as f:
        f.write("\n".join(result_lines) + "\n")

    print(f"Results saved to: {result_filename}")


if __name__ == "__main__":
    run_eval()
    sys.exit(0)
