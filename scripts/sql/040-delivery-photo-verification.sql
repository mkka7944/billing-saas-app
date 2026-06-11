-- ==========================================================
-- Migration 040: Delivery Photo Verification
-- Created: 2026-06-11
--
-- Adds admin verification columns to delivery_photos so
-- failed-upload records can be formally verified by admin
-- without deleting the historical record.
-- ==========================================================

ALTER TABLE public.delivery_photos
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_delivery_photos_verified
  ON public.delivery_photos(verified_by)
  WHERE verified_by IS NULL;

COMMENT ON COLUMN public.delivery_photos.verified_by IS
  'Admin user ID who verified this delivery despite missing photo upload. NULL = unverified.';
COMMENT ON COLUMN public.delivery_photos.verified_at IS
  'Timestamp when admin verified this delivery. NULL = unverified.';
