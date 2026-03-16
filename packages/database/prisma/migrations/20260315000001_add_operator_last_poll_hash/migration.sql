-- PR-9 — Change Detection Engine
-- Adds lastPollHash column to operators table for deterministic change detection.
-- The column stores a SHA-256 hex hash of the sorted reservations response;
-- when it matches the new poll hash, no diff is run and no events are emitted.

ALTER TABLE "operators" ADD COLUMN "lastPollHash" TEXT;
