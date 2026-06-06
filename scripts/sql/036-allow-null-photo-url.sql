-- ─────────────────────────────────────────────────────────────
-- Migration 036: Allow NULL photo_url in delivery_photos
-- 
-- The GAS webhook can fail or time out, leaving gdrive_file_id
-- and photo_url null. The NOT NULL constraint causes a 500 error
-- even though the delivery succeeded. We still want to save the
-- record (synced_to_drive = false) so the offline queue can
-- retry the Drive upload later.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.delivery_photos
  ALTER COLUMN photo_url DROP NOT NULL;
