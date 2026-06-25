-- Live GPS tracking: staff phones report position periodically
-- Rows auto-cleaned after 24 hours (cron job)

CREATE TABLE IF NOT EXISTS public.staff_locations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT DEFAULT 'gps'
);

CREATE INDEX IF NOT EXISTS idx_staff_locations_staff_id ON public.staff_locations(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_locations_captured_at ON public.staff_locations(captured_at);
CREATE INDEX IF NOT EXISTS idx_staff_locations_staff_captured ON public.staff_locations(staff_id, captured_at DESC);

-- Auto-cleanup: delete rows older than 24 hours
-- Run via: SELECT cleanup_staff_locations();
CREATE OR REPLACE FUNCTION cleanup_staff_locations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.staff_locations
  WHERE captured_at < NOW() - INTERVAL '24 hours';
END;
$$;
