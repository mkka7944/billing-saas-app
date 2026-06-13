-- 036: Add index on daily_assignments.created_at DESC for listing queries
CREATE INDEX IF NOT EXISTS idx_daily_assignments_created
  ON public.daily_assignments (created_at DESC);
