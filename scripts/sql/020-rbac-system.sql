-- ==========================================================
-- Migration 020: RBAC System — Roles + User Management
-- Created: 2026-05-27
--
-- Adds:
--   1. roles table (super_admin, admin, field_staff)
--   2. username + role_id + suspension + soft-delete to profiles
--   3. Seed data
-- ==========================================================

-- ── 1. roles table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id          int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text,
  created_at  timestamptz DEFAULT now()
);

-- ── 2. Seed roles ──────────────────────────────────────────
INSERT INTO public.roles (name, description) VALUES
  ('super_admin', 'Full system access — can manage users, roles, and all data'),
  ('admin',       'Can manage assignments, view stats, routes, and dashboard'),
  ('field_staff', 'Mobile delivery staff — can only access deliver flow')
ON CONFLICT (name) DO NOTHING;

-- ── 3. Add columns to profiles ─────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username      text UNIQUE,
  ADD COLUMN IF NOT EXISTS role_id       int8 REFERENCES public.roles(id),
  ADD COLUMN IF NOT EXISTS suspended_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz;

-- Create index for fast username lookup
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Drop legacy columns (no longer needed)
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS permissions;

-- ── 4. Staff table merging ─────────────────────────────────
-- Add role_id and username to staff for consistency
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS role_id  int8 REFERENCES public.roles(id);

-- ── 5. RLS ─────────────────────────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all" ON public.roles;
CREATE POLICY "select_all" ON public.roles FOR SELECT USING (true);

-- Allow authenticated users to insert/update/delete roles
DROP POLICY IF EXISTS "insert_all" ON public.roles;
CREATE POLICY "insert_all" ON public.roles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "update_all" ON public.roles;
CREATE POLICY "update_all" ON public.roles FOR UPDATE USING (true);
DROP POLICY IF EXISTS "delete_all" ON public.roles;
CREATE POLICY "delete_all" ON public.roles FOR DELETE USING (true);

-- Ensure profiles RLS policies allow authenticated users
DROP POLICY IF EXISTS "select_all" ON public.profiles;
CREATE POLICY "select_all" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert_all" ON public.profiles;
CREATE POLICY "insert_all" ON public.profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "update_all" ON public.profiles;
CREATE POLICY "update_all" ON public.profiles FOR UPDATE USING (true);
