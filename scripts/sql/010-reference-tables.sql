-- ==========================================================
-- Migration 010: Reference Tables for Filter Dropdowns
-- Created: 2026-05-24
--
-- Three small reference tables that replace SELECT DISTINCT
-- on 212K-row tables. Filter dropdowns query these instead,
-- avoiding PostgREST's 1000-row limit entirely.
--
--   1. hierarchy   — distinct (city_district, tehsil, uc_name)
--   2. surveyors   — distinct surveyor names
--   3. bill_months — distinct bill months from bill_items
--
-- Plus a trigger to keep `hierarchy` in sync with survey_units.
-- ==========================================================

-- ── 1. Hierarchy (filter dropdowns) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.hierarchy (
  id SERIAL PRIMARY KEY,
  city_district text NOT NULL,
  tehsil text NOT NULL,
  uc_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (city_district, tehsil, uc_name)
);

-- Seed from existing survey_units (idempotent — ON CONFLICT DO NOTHING)
INSERT INTO public.hierarchy (city_district, tehsil, uc_name)
  SELECT DISTINCT city_district, tehsil, uc_name
  FROM public.survey_units
  WHERE status = 'ACTIVE'
    AND city_district IS NOT NULL
    AND tehsil IS NOT NULL
    AND uc_name IS NOT NULL
ON CONFLICT (city_district, tehsil, uc_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_hierarchy_district ON public.hierarchy(city_district);
CREATE INDEX IF NOT EXISTS idx_hierarchy_tehsil ON public.hierarchy(tehsil);
CREATE INDEX IF NOT EXISTS idx_hierarchy_uc ON public.hierarchy(uc_name);

COMMENT ON TABLE public.hierarchy IS
  'Reference table for filter dropdowns. Populated from survey_units DISTINCT values. Maintained by trigger trg_survey_units_upsert_hierarchy and import scripts.';

-- ── 2. Surveyors (filter dropdown + staff reference) ─────────
CREATE TABLE IF NOT EXISTS public.surveyors (
  id SERIAL PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.surveyors (name)
  SELECT DISTINCT surveyor_name
  FROM public.survey_units
  WHERE status = 'ACTIVE'
    AND surveyor_name IS NOT NULL
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_surveyors_name ON public.surveyors(name);

COMMENT ON TABLE public.surveyors IS
  'Reference table for surveyor filter dropdown. Populated from survey_units DISTINCT values.';

-- ── 3. Bill months (month filter dropdown) ───────────────────
CREATE TABLE IF NOT EXISTS public.bill_months (
  month text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- Seed from payment_history (more complete historical record than bill_items)
INSERT INTO public.bill_months (month)
  SELECT DISTINCT bill_month
  FROM public.payment_history
  ORDER BY bill_month DESC
ON CONFLICT (month) DO NOTHING;

COMMENT ON TABLE public.bill_months IS
  'Reference table for month filter dropdown. Populated from bill_items DISTINCT bill_months.';

-- ── 4. Trigger: keep hierarchy in sync with survey_units ─────
CREATE OR REPLACE FUNCTION public.sync_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _city_district text;
  _tehsil text;
  _uc_name text;
BEGIN
  -- Determine which hierarchy row to affect based on operation
  IF TG_OP = 'DELETE' THEN
    _city_district := OLD.city_district;
    _tehsil := OLD.tehsil;
    _uc_name := OLD.uc_name;
  ELSE
    _city_district := NEW.city_district;
    _tehsil := NEW.tehsil;
    _uc_name := NEW.uc_name;
  END IF;

  -- Only process if hierarchy columns are non-null
  IF _city_district IS NOT NULL AND _tehsil IS NOT NULL AND _uc_name IS NOT NULL THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'ACTIVE' THEN
      -- New ACTIVE unit — ensure hierarchy row exists
      INSERT INTO public.hierarchy (city_district, tehsil, uc_name)
      VALUES (NEW.city_district, NEW.tehsil, NEW.uc_name)
      ON CONFLICT (city_district, tehsil, uc_name) DO UPDATE
        SET updated_at = now();

    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'ACTIVE' AND NEW.status != 'ACTIVE' THEN
        -- Unit deactivated — remove if no other ACTIVE unit uses this combo
        DELETE FROM public.hierarchy
        WHERE city_district = OLD.city_district
          AND tehsil = OLD.tehsil
          AND uc_name = OLD.uc_name
          AND NOT EXISTS (
            SELECT 1 FROM public.survey_units
            WHERE status = 'ACTIVE'
              AND city_district = OLD.city_district
              AND tehsil = OLD.tehsil
              AND uc_name = OLD.uc_name
              AND survey_id != OLD.survey_id
          );
      ELSIF OLD.status != 'ACTIVE' AND NEW.status = 'ACTIVE' THEN
        -- Unit reactivated — ensure hierarchy row exists
        INSERT INTO public.hierarchy (city_district, tehsil, uc_name)
        VALUES (NEW.city_district, NEW.tehsil, NEW.uc_name)
        ON CONFLICT (city_district, tehsil, uc_name) DO NOTHING;

      ELSIF (OLD.city_district != NEW.city_district OR OLD.tehsil != NEW.tehsil OR OLD.uc_name != NEW.uc_name) THEN
        -- Hierarchy columns changed — remove old combo if no other unit uses it, add new
        IF OLD.status = 'ACTIVE' THEN
          DELETE FROM public.hierarchy
          WHERE city_district = OLD.city_district
            AND tehsil = OLD.tehsil
            AND uc_name = OLD.uc_name
            AND NOT EXISTS (
              SELECT 1 FROM public.survey_units
              WHERE status = 'ACTIVE'
                AND city_district = OLD.city_district
                AND tehsil = OLD.tehsil
                AND uc_name = OLD.uc_name
                AND survey_id != OLD.survey_id
            );
        END IF;
        IF NEW.status = 'ACTIVE' THEN
          INSERT INTO public.hierarchy (city_district, tehsil, uc_name)
          VALUES (NEW.city_district, NEW.tehsil, NEW.uc_name)
          ON CONFLICT (city_district, tehsil, uc_name) DO NOTHING;
        END IF;
      END IF;

    ELSIF TG_OP = 'DELETE' AND OLD.status = 'ACTIVE' THEN
      -- Unit deleted — remove combo if no other ACTIVE unit uses it
      DELETE FROM public.hierarchy
      WHERE city_district = OLD.city_district
        AND tehsil = OLD.tehsil
        AND uc_name = OLD.uc_name
        AND NOT EXISTS (
          SELECT 1 FROM public.survey_units
          WHERE status = 'ACTIVE'
            AND city_district = OLD.city_district
            AND tehsil = OLD.tehsil
            AND uc_name = OLD.uc_name
        );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_survey_units_upsert_hierarchy ON public.survey_units;

CREATE TRIGGER trg_survey_units_upsert_hierarchy
  AFTER INSERT OR UPDATE OR DELETE ON public.survey_units
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_hierarchy();

COMMENT ON FUNCTION public.sync_hierarchy IS
  'Maintains hierarchy reference table on survey_units changes. Adds new (district, tehsil, uc) combos on INSERT/REACTIVATE, removes orphaned combos on DELETE/DEACTIVATE.';
