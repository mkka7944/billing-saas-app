-- Backfill: Replace direct Google Drive URLs with proxy endpoint URLs
-- Phase 1: uc?export=view → lh3 CDN (already backfilled in session 2026-06-08)
-- Phase 2: lh3 CDN → app proxy endpoint

UPDATE delivery_photos
SET photo_url = regexp_replace(
  photo_url,
  '^https://lh3\.googleusercontent\.com/d/',
  '/api/delivery/photo/'
)
WHERE photo_url LIKE 'https://lh3.googleusercontent.com/d/%';
