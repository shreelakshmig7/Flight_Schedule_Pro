-- migration.sql
-- --------------
-- Agentic Scheduler — FSP Integration — Operator priority weights field
-- -----------------------------------------------------------------------
-- Adds priorityWeights JSONB column to the operators table for PR-11
-- (Priority Weight Engine). This column stores the operator-configured
-- signal weights consumed by the PriorityWeightEngine in the worker.
-- A NULL value signals the engine to apply DEFAULT_PRIORITY_WEIGHTS.
--
-- PR: PR-11 — Priority Weight Engine

ALTER TABLE "operators" ADD COLUMN "priorityWeights" JSONB;
