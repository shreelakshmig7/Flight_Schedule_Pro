-- migration.sql
-- --------------
-- Agentic Scheduler — FSP Integration — Suggestion state machine fields
-- -----------------------------------------------------------------------
-- Adds fields required by PR-10 (Suggestion State Machine):
--   - candidatePayload  JSON payload captured at generation time for FSP
--                       validateOnly and use-case handler execution
--   - expiresAt         Timestamp after which PENDING → EXPIRED cron fires
--   - rejectionReason   Optional operator-supplied reason for rejection
--   - resolvedBy        userId of operator who approved/rejected
--   - resolvedAt        Timestamp of the approval/rejection action
-- Also adds composite indexes to support expiry queries and audit lookups.
--
-- PR: PR-10 — Suggestion State Machine

-- Add new columns to suggestions table
ALTER TABLE "suggestions" ADD COLUMN "candidatePayload" JSONB;
ALTER TABLE "suggestions" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "suggestions" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "suggestions" ADD COLUMN "resolvedBy" TEXT;
ALTER TABLE "suggestions" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Index to support expiry cron (batch-finds PENDING rows where expiresAt < now)
CREATE INDEX "suggestions_status_expiresAt_idx" ON "suggestions"("status", "expiresAt");

-- Index to support cursor-based pagination ordered by createdAt
CREATE INDEX "suggestions_operatorId_createdAt_idx" ON "suggestions"("operatorId", "createdAt");
