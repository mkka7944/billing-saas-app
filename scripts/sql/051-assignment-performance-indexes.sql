-- ==========================================================
-- Migration 051: Assignment Performance Indexes
-- Created: 2026-06-27
--
-- Covering indexes for the staff_daily_stats trigger to
-- avoid full table scans on bulk insert (6293+ rows).
-- Also speeds up notification count queries.
-- ==========================================================

-- Covering index for trigger aggregate: allows index-only scan
-- when counting items by assignment and status
CREATE INDEX IF NOT EXISTS idx_assignment_items_assignment_status
  ON public.assignment_items(assignment_id)
  INCLUDE (status);

-- Covering index for trigger JOIN: allows index-only scan
-- when resolving staff_id + date from assignment_id
CREATE INDEX IF NOT EXISTS idx_daily_assignments_staff_date_id
  ON public.daily_assignments(staff_id, issued_at)
  INCLUDE (id);

-- Partial index for notification count queries (pending + processing)
CREATE INDEX IF NOT EXISTS idx_assignment_items_pending_processing
  ON public.assignment_items(status)
  WHERE status IN ('pending', 'processing');
