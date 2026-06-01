-- 025-drop-dead-rpcs.sql
-- Drops RPCs/functions that reference the dropped bill_items table.

DROP FUNCTION IF EXISTS get_billing_summary(text, text, text);
DROP FUNCTION IF EXISTS get_billing_group_stats(text, text, text, text);
DROP FUNCTION IF EXISTS set_bill_items_tehsil();
