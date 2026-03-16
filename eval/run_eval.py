"""
run_eval.py
-----------
Agentic Scheduler — FSP Integration — Evaluation harness
---------------------------------------------------------
Loads golden_data.yaml, executes each test case against the running
agentic scheduler worker service, and scores results against must_contain,
must_not_contain, expected_suggestion_status, and confidence thresholds.

Saves a detailed results file to tests/results/ after every run.
A non-zero exit code is returned if any test case fails.

Key functions:
    load_dataset        — loads and validates golden_data.yaml
    run_test_case       — executes a single test case against the API
    score_result        — evaluates output against must_contain / must_not_contain
    save_results        — writes results to tests/results/
    main                — orchestrates the full eval run

Author: [Author name]
Project: Agentic Scheduler — FSP Integration
"""

import argparse
import json
import os
import sys
import time
import datetime
import requests
import yaml
from typing import Any


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_BASE_URL = os.environ.get("EVAL_API_BASE_URL", "http://localhost:3000")
EVAL_AUTH_TOKEN = os.environ.get("EVAL_AUTH_TOKEN", "mock-fsp-bearer-token-test-operator-001")
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "tests", "results")
DATASET_PATH = os.path.join(os.path.dirname(__file__), "golden_data.yaml")

PASS_COLOUR = "\033[92m"
FAIL_COLOUR = "\033[91m"
WARN_COLOUR = "\033[93m"
RESET_COLOUR = "\033[0m"


# ---------------------------------------------------------------------------
# Dataset loader
# ---------------------------------------------------------------------------

def load_dataset(path: str) -> list[dict]:
    """
    Load and parse the golden_data.yaml evaluation dataset.

    Args:
        path: Absolute or relative path to the golden_data.yaml file

    Returns:
        list[dict]: List of test case dictionaries

    Raises:
        FileNotFoundError: When the dataset file does not exist
        yaml.YAMLError: When the file contains invalid YAML
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Dataset not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    cases = data.get("test_cases", [])
    if not cases:
        raise ValueError("Dataset contains no test_cases")
    return cases


# ---------------------------------------------------------------------------
# API interaction
# ---------------------------------------------------------------------------

def trigger_test_case(case: dict) -> dict:
    """
    POST the trigger payload to the eval endpoint and return the response body.

    Args:
        case: Single test case dictionary from golden_data.yaml

    Returns:
        dict: JSON response body from the eval endpoint, or error dict on failure
    """
    url = f"{API_BASE_URL}/eval/trigger"
    headers = {
        "Authorization": f"Bearer {EVAL_AUTH_TOKEN}",
        "Content-Type": "application/json",
        "x-eval-mode": "true",
    }
    payload = {
        "testCaseId": case["id"],
        "trigger": case["trigger"],
        "expectedFspCalls": case.get("expected_fsp_calls", []),
        "expectedFspCallsExcluded": case.get("expected_fsp_calls_excluded", []),
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        return {"error": "Request timed out after 60 seconds", "output": ""}
    except requests.exceptions.ConnectionError:
        return {"error": f"Cannot connect to API at {API_BASE_URL}", "output": ""}
    except requests.exceptions.HTTPError as e:
        return {"error": f"HTTP {e.response.status_code}: {e.response.text}", "output": ""}
    except Exception as e:
        return {"error": f"Unexpected error: {str(e)}", "output": ""}


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def score_result(case: dict, response: dict) -> dict:
    """
    Score the response from the eval endpoint against the test case criteria.

    Args:
        case: Single test case dictionary from golden_data.yaml
        response: JSON response body from trigger_test_case

    Returns:
        dict: Score result with keys: passed, failures, warnings, details
    """
    failures: list[str] = []
    warnings: list[str] = []
    details: list[str] = []

    output_str = json.dumps(response).lower()

    # Check for API-level error
    if "error" in response and response.get("error"):
        failures.append(f"API error: {response['error']}")
        return {"passed": False, "failures": failures, "warnings": warnings, "details": details}

    # must_contain checks
    for term in case.get("must_contain", []):
        if term.lower() not in output_str:
            failures.append(f"must_contain FAILED: '{term}' not found in response")
        else:
            details.append(f"must_contain PASS: '{term}'")

    # must_not_contain checks
    for term in case.get("must_not_contain", []):
        if term.lower() in output_str:
            failures.append(f"must_not_contain FAILED: '{term}' found in response")
        else:
            details.append(f"must_not_contain PASS: '{term}'")

    # expected_suggestion_status check
    expected_status = case.get("expected_suggestion_status")
    if expected_status:
        actual_status = response.get("suggestionStatus") or response.get("status", "")
        if actual_status.upper() != expected_status.upper():
            failures.append(
                f"expected_suggestion_status FAILED: expected '{expected_status}', got '{actual_status}'"
            )
        else:
            details.append(f"expected_suggestion_status PASS: '{expected_status}'")

    # expected_suggestion_count check
    expected_count = case.get("expected_suggestion_count")
    if expected_count is not None:
        actual_count = response.get("suggestionCount", 0)
        if actual_count != expected_count:
            failures.append(
                f"expected_suggestion_count FAILED: expected {expected_count}, got {actual_count}"
            )
        else:
            details.append(f"expected_suggestion_count PASS: {expected_count}")

    # expected_confidence_min check
    conf_min = case.get("expected_confidence_min")
    if conf_min is not None:
        actual_conf = response.get("confidenceScore")
        if actual_conf is None:
            warnings.append("expected_confidence_min: confidence_score not present in response")
        elif actual_conf < conf_min:
            failures.append(
                f"expected_confidence_min FAILED: expected >= {conf_min}, got {actual_conf}"
            )
        else:
            details.append(f"expected_confidence_min PASS: {actual_conf} >= {conf_min}")

    # expected_confidence_max check
    conf_max = case.get("expected_confidence_max")
    if conf_max is not None:
        actual_conf = response.get("confidenceScore")
        if actual_conf is None:
            warnings.append("expected_confidence_max: confidence_score not present in response")
        elif actual_conf > conf_max:
            failures.append(
                f"expected_confidence_max FAILED: expected <= {conf_max}, got {actual_conf}"
            )
        else:
            details.append(f"expected_confidence_max PASS: {actual_conf} <= {conf_max}")

    # expected_fsp_calls check
    expected_calls = case.get("expected_fsp_calls", [])
    actual_calls = response.get("fspCallsMade", [])
    for call in expected_calls:
        if call not in actual_calls:
            failures.append(f"expected_fsp_calls FAILED: '{call}' was not called")
        else:
            details.append(f"expected_fsp_calls PASS: '{call}' was called")

    # expected_fsp_calls_excluded check
    excluded_calls = case.get("expected_fsp_calls_excluded", [])
    for call in excluded_calls:
        if call in actual_calls:
            failures.append(f"expected_fsp_calls_excluded FAILED: '{call}' was called but should not have been")
        else:
            details.append(f"expected_fsp_calls_excluded PASS: '{call}' was not called")

    passed = len(failures) == 0
    return {"passed": passed, "failures": failures, "warnings": warnings, "details": details}


# ---------------------------------------------------------------------------
# Results persistence
# ---------------------------------------------------------------------------

def save_results(
    results: list[dict],
    dataset_path: str,
    duration_seconds: float,
    label: str | None = None,
) -> str:
    """
    Save the full eval results to tests/results/ with a timestamped filename.

    Args:
        results: List of scored test case result dicts
        dataset_path: Path to the golden_data.yaml file used
        duration_seconds: Total wall-clock time for the eval run
        label: Optional label to include in the filename (e.g. 'pr-13-waitlist')

    Returns:
        str: Absolute path to the saved results file
    """
    os.makedirs(RESULTS_DIR, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M")
    suffix = f"-{label}" if label else ""
    filename = f"eval{suffix}-{timestamp}.txt"
    filepath = os.path.join(RESULTS_DIR, filename)

    total = len(results)
    passed = sum(1 for r in results if r["score"]["passed"])
    failed = total - passed

    lines = [
        "=" * 72,
        "Agentic Scheduler — FSP Integration — Eval Results",
        "=" * 72,
        f"Dataset  : {dataset_path}",
        f"Run at   : {datetime.datetime.now().isoformat()}",
        f"Duration : {duration_seconds:.1f}s",
        f"Total    : {total}",
        f"Passed   : {passed}",
        f"Failed   : {failed}",
        f"Pass rate: {(passed / total * 100):.1f}%" if total > 0 else "Pass rate: N/A",
        "=" * 72,
        "",
    ]

    for r in results:
        status = "PASS" if r["score"]["passed"] else "FAIL"
        lines.append(f"[{status}] {r['id']} — {r['category']} — PR: {r['pr']} — {r['use_case']}")
        lines.append(f"  Description: {r['description'].strip()}")
        if r["score"]["failures"]:
            for f in r["score"]["failures"]:
                lines.append(f"  FAILURE: {f}")
        if r["score"]["warnings"]:
            for w in r["score"]["warnings"]:
                lines.append(f"  WARNING: {w}")
        if r["score"]["details"]:
            for d in r["score"]["details"]:
                lines.append(f"  OK: {d}")
        lines.append("")

    lines.append("=" * 72)
    lines.append(f"End of results — {passed}/{total} passed")
    lines.append("=" * 72)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return filepath


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    """
    Orchestrate the full eval run: load dataset, run cases, score, save, report.

    Returns:
        int: Exit code — 0 if all tests passed, 1 if any failed
    """
    parser = argparse.ArgumentParser(description="Agentic Scheduler FSP Eval Harness")
    parser.add_argument("--dataset", default=DATASET_PATH, help="Path to golden_data.yaml")
    parser.add_argument("--filter-pr", default=None, help="Only run cases for a specific PR (e.g. PR-13)")
    parser.add_argument("--filter-category", default=None, help="Only run cases of a category (e.g. happy_path)")
    parser.add_argument("--label", default=None, help="Label for the results filename (e.g. pr-13-waitlist)")
    args = parser.parse_args()

    print(f"\nAgentic Scheduler — FSP Eval Harness")
    print(f"Dataset : {args.dataset}")
    print(f"API     : {API_BASE_URL}\n")

    try:
        cases = load_dataset(args.dataset)
    except (FileNotFoundError, ValueError) as e:
        print(f"{FAIL_COLOUR}Dataset error: {e}{RESET_COLOUR}")
        return 1

    # Apply filters
    if args.filter_pr:
        cases = [c for c in cases if c.get("pr") == args.filter_pr]
        print(f"Filtered to PR: {args.filter_pr} — {len(cases)} cases\n")

    if args.filter_category:
        cases = [c for c in cases if c.get("category") == args.filter_category]
        print(f"Filtered to category: {args.filter_category} — {len(cases)} cases\n")

    if not cases:
        print(f"{WARN_COLOUR}No test cases match the specified filters.{RESET_COLOUR}")
        return 0

    results = []
    start_time = time.time()

    for i, case in enumerate(cases, 1):
        case_id = case.get("id", f"unknown-{i}")
        pr = case.get("pr", "?")
        category = case.get("category", "?")
        description = case.get("description", "").strip().replace("\n", " ")[:80]

        print(f"[{i:02d}/{len(cases)}] {case_id} ({pr} · {category})")
        print(f"         {description}...")

        case_start = time.time()
        response = trigger_test_case(case)
        case_duration = time.time() - case_start

        score = score_result(case, response)
        status_label = f"{PASS_COLOUR}PASS{RESET_COLOUR}" if score["passed"] else f"{FAIL_COLOUR}FAIL{RESET_COLOUR}"
        print(f"         {status_label} ({case_duration:.1f}s)")

        if not score["passed"]:
            for failure in score["failures"]:
                print(f"         {FAIL_COLOUR}✗ {failure}{RESET_COLOUR}")
        if score["warnings"]:
            for warning in score["warnings"]:
                print(f"         {WARN_COLOUR}⚠ {warning}{RESET_COLOUR}")

        print()

        results.append({
            "id": case_id,
            "pr": pr,
            "category": category,
            "use_case": case.get("use_case", "?"),
            "description": case.get("description", ""),
            "duration_seconds": case_duration,
            "response": response,
            "score": score,
        })

    total_duration = time.time() - start_time
    total = len(results)
    passed = sum(1 for r in results if r["score"]["passed"])
    failed = total - passed

    print("=" * 72)
    print(f"Results: {passed}/{total} passed  ({failed} failed)  {total_duration:.1f}s total")
    print("=" * 72)

    results_path = save_results(results, args.dataset, total_duration, args.label)
    print(f"\nResults saved to: {results_path}")

    if failed > 0:
        print(f"\n{FAIL_COLOUR}{failed} test case(s) failed. Fix regressions before proceeding.{RESET_COLOUR}")
        return 1

    print(f"\n{PASS_COLOUR}All {total} test cases passed.{RESET_COLOUR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
