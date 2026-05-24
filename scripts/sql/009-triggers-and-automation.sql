-- ==========================================================
-- Migration 009: Triggers & Automation
-- Created: 2026-05-24
--
-- Automates data integrity for ongoing imports:
--   1. Auto-populate bill_items.tehsil on INSERT
--   2. Refresh payment_summary on payment_history changes
--
-- These triggers ensure tehsil + payment_summary stay in
-- sync regardless of the import script used.
-- ==========================================================

-- ── 1. Auto-populate bill_items.tehsil ────────────────────
-- When a new bill_items row is inserted without tehsil,
-- look it up from survey_units via survey_id FK.
CREATE OR REPLACE FUNCTION set_bill_items_tehsil()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tehsil IS NULL THEN
    SELECT tehsil INTO NEW.tehsil FROM survey_units WHERE survey_id = NEW.survey_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_items_set_tehsil ON bill_items;
CREATE TRIGGER trg_bill_items_set_tehsil
BEFORE INSERT ON bill_items
FOR EACH ROW
EXECUTE FUNCTION set_bill_items_tehsil();

COMMENT ON TRIGGER trg_bill_items_set_tehsil ON bill_items IS
  'Auto-populates bill_items.tehsil from survey_units on INSERT. Allows override if tehsil is explicitly provided.';

-- ── 2. Refresh payment_summary on payment changes ────────
-- After any INSERT/UPDATE/DELETE on payment_history,
-- recompute the summary for the affected bill_month.
CREATE OR REPLACE FUNCTION refresh_payment_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_month text;
BEGIN
  affected_month := COALESCE(NEW.bill_month, OLD.bill_month);
  IF affected_month IS NULL THEN RETURN NULL; END IF;

  INSERT INTO payment_summary (bill_month, total_paid, total_collected, updated_at)
  SELECT
    affected_month,
    COUNT(DISTINCT psid)::integer,
    COALESCE(SUM(amount_paid), 0)::numeric(12,2),
    now()
  FROM payment_history
  WHERE bill_month = affected_month AND payment_status = 'paid'
  ON CONFLICT (bill_month) DO UPDATE SET
    total_paid = EXCLUDED.total_paid,
    total_collected = EXCLUDED.total_collected,
    updated_at = now();

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_history_refresh_summary ON payment_history;
CREATE TRIGGER trg_payment_history_refresh_summary
AFTER INSERT OR UPDATE OR DELETE ON payment_history
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_payment_summary();

COMMENT ON TRIGGER trg_payment_history_refresh_summary ON payment_history IS
  'Auto-refreshes payment_summary for the affected bill_month after any payment_history change. Statement-level to batch updates.';
