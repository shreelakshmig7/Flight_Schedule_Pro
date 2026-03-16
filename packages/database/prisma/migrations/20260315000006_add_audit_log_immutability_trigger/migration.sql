-- PR-22: Immutable audit log trigger and archive table
-- Prevents UPDATE and DELETE operations on audit_log table
-- Creates archive table for retention policy

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log records are immutable';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutability_trigger
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- Archive table for audit retention
CREATE TABLE IF NOT EXISTS audit_log_archive (LIKE audit_log INCLUDING ALL);
