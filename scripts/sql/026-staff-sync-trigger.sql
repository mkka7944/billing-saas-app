-- 026-staff-sync-trigger.sql
-- Auto-sync field_staff profiles to staff table.
-- New/updated field_staff in profiles → automatically appear in staff.
-- This ensures /settings user creation flows into the assignments system.

-- ── 1. Trigger function ──────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_profile_to_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER AS
$$
DECLARE
  v_field_staff_id CONSTANT int8 := (SELECT id FROM public.roles WHERE name = 'field_staff');
BEGIN
  -- INSERT: new field_staff profile → create staff row
  IF TG_OP = 'INSERT' AND NEW.role_id = v_field_staff_id THEN
    INSERT INTO public.staff (id, full_name, username, role_id, is_active)
    VALUES (NEW.id, NEW.full_name, NEW.username, NEW.role_id, true)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      username  = EXCLUDED.username,
      role_id   = EXCLUDED.role_id,
      is_active = true;
    RETURN NEW;
  END IF;

  -- UPDATE: field_staff row changed → sync fields
  IF TG_OP = 'UPDATE' AND NEW.role_id = v_field_staff_id THEN
    UPDATE public.staff SET
      full_name  = NEW.full_name,
      username   = NEW.username,
      role_id    = NEW.role_id,
      is_active  = CASE WHEN NEW.deleted_at IS NOT NULL OR NEW.suspended_at IS NOT NULL THEN false ELSE true END
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- UPDATE: role changed away from field_staff → deactivate
  IF TG_OP = 'UPDATE' AND OLD.role_id = v_field_staff_id AND (NEW.role_id IS DISTINCT FROM v_field_staff_id) THEN
    UPDATE public.staff SET is_active = false WHERE id = OLD.id;
    RETURN NEW;
  END IF;

  -- DELETE: hard-delete of field_staff → soft-deactivate staff
  IF TG_OP = 'DELETE' AND OLD.role_id = v_field_staff_id THEN
    UPDATE public.staff SET is_active = false WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 2. Trigger on profiles ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_profile_to_staff ON public.profiles;
CREATE TRIGGER trg_sync_profile_to_staff
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION sync_profile_to_staff();

-- ── 3. One-time backfill ─────────────────────────────────────
-- Insert any existing field_staff profiles that aren't already in staff.
INSERT INTO public.staff (id, full_name, username, role_id, is_active)
SELECT p.id, p.full_name, p.username, p.role_id, true
FROM public.profiles p
WHERE p.role_id = (SELECT id FROM public.roles WHERE name = 'field_staff')
  AND p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = p.id)
ON CONFLICT (id) DO NOTHING;
