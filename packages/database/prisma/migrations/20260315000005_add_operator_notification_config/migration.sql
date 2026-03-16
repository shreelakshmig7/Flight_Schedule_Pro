-- PR-17: Add notificationConfig column to operators table
-- Stores email/SMS notification preferences, branding, and template overrides
ALTER TABLE "operators" ADD COLUMN "notificationConfig" JSONB;
