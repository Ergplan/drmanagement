-- Rules the database itself enforces (invariants 1 and 7) and monthly partitions for reading_1m.

-- Monthly partitions for 1-minute readings; the edge/cloud calls ensure_reading_partitions() ahead of time.
CREATE OR REPLACE FUNCTION ensure_reading_partitions(from_month date, to_month date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m date := date_trunc('month', from_month);
BEGIN
  WHILE m <= to_month LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF reading_1m FOR VALUES FROM (%L) TO (%L)',
      'reading_1m_' || to_char(m, 'YYYY_MM'), m::timestamptz AT TIME ZONE 'UTC', (m + interval '1 month')::timestamptz AT TIME ZONE 'UTC');
    m := m + interval '1 month';
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reading_1m_default PARTITION OF reading_1m DEFAULT;
--> statement-breakpoint
SELECT ensure_reading_partitions(date '2025-11-01', date '2027-12-01');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reading_1m_ts_idx ON reading_1m (ts);
--> statement-breakpoint

-- Invariant 7: append-only record. UPDATE and DELETE are refused; corrections are new rows.
CREATE OR REPLACE FUNCTION refuse_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %: % is not allowed (insert a correcting row instead)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log', 'approval', 'command', 'dr_event_log', 'interlock_event', 'notification'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION refuse_mutation()', t || '_append_only', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_no_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION refuse_mutation()', t || '_no_truncate', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Invariant 1: clinical exclusion. No command row may target a protected, critical or meter-only asset.
CREATE OR REPLACE FUNCTION refuse_excluded_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c dr_class;
BEGIN
  SELECT dr_class INTO c FROM asset WHERE id = NEW.asset_id;
  IF c IS NULL OR c IN ('protected', 'critical', 'meter') THEN
    RAISE EXCEPTION 'clinical exclusion: asset % (class %) can never be commanded', NEW.asset_id, coalesce(c::text, 'unknown')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS command_clinical_exclusion ON command;
--> statement-breakpoint
CREATE TRIGGER command_clinical_exclusion BEFORE INSERT ON command FOR EACH ROW EXECUTE FUNCTION refuse_excluded_command();
