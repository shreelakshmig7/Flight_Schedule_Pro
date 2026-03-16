-- Migration: 20260315000004_add_operator_policy_config
-- PR-14 — Use Case B — Reschedule
-- Adds a nullable policyConfig JSON column to the operators table to store
-- operator-specific scheduling policies (e.g. preferSameInstructor).
-- Null value means the service falls back to RESCHEDULE_DEFAULT_POLICY_CONFIG.

ALTER TABLE "operators" ADD COLUMN "policyConfig" JSONB;
