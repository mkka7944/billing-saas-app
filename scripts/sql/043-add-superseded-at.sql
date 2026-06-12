-- 043-add-superseded-at.sql
-- Add superseded_at column to delivery_photos for audit trail
-- When a new photo replaces an old one (e.g. after revoke+redelivery),
-- the old photo gets superseded_at set instead of being deleted.

ALTER TABLE delivery_photos ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- Index for finding active (non-superseded) photos
CREATE INDEX IF NOT EXISTS idx_delivery_photos_active
  ON delivery_photos(assignment_item_id)
  WHERE superseded_at IS NULL;
