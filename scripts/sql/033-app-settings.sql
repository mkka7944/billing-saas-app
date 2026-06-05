-- ==========================================================
-- Migration 033: App Settings Table
-- 2026-06-05
--
-- Stores global app settings as key-value pairs (jsonb).
-- Admin only: updated via PATCH /api/settings.
-- Used for GPS enforcement toggle and threshold.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.app_settings (key, value) VALUES
  ('gps_enforcement', '{"enforce": true, "threshold": 50}')
ON CONFLICT (key) DO NOTHING;
