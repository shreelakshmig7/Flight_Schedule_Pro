"""
__init__.py
-----------
Agentic Scheduler — FSP Integration — Eval package
---------------------------------------------------
Exports the evaluation runner and golden dataset loader used to validate
agent behaviour against the 42-case golden_data.yaml suite.

The eval harness scores suggestions against:
  - must_contain / must_not_contain string checks on the response body
  - expected_suggestion_status (PENDING / APPROVED / REJECTED / EXPIRED)
  - expected_suggestion_count (number of suggestions created)
  - expected_confidence_min / expected_confidence_max thresholds
  - expected_fsp_calls (FSP API endpoints that must have been called)
  - expected_fsp_calls_excluded (endpoints that must NOT have been called)

Author: [Author name]
Project: Agentic Scheduler — FSP Integration
"""
