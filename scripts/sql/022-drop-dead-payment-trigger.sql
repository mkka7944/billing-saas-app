-- 022-drop-dead-payment-trigger.sql
-- Drops the broken trigger and function that reference the non-existent payment_summary table.
-- This is a production blocker — any INSERT/UPDATE/DELETE on payment_history throws an error.

DROP TRIGGER IF EXISTS trg_payment_history_refresh_summary ON payment_history;
DROP FUNCTION IF EXISTS refresh_payment_summary();
