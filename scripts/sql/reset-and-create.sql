-- ============================================================
-- BILLING SAAS APP — Full Schema Reset + Create + Indexes + RLS
-- ============================================================
-- Run this entire block in Supabase SQL Editor (one shot)

-- Drop all tables (order matters for FK)
DROP TABLE IF EXISTS public.staff_sync_logs CASCADE;
DROP TABLE IF EXISTS public.verified_houses CASCADE;
DROP TABLE IF EXISTS public.bills CASCADE;
DROP TABLE IF EXISTS public.survey_units CASCADE;
DROP TABLE IF EXISTS public.saved_routes CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.staff CASCADE;

-- Enable uuid-ossp extension (if not already)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. app_settings
CREATE TABLE public.app_settings (
  key text NOT NULL,
  value text,
  description text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_settings_pkey PRIMARY KEY (key)
);

-- 2. survey_units
CREATE TABLE public.survey_units (
  survey_id text NOT NULL,
  status text DEFAULT 'ACTIVE'::text CHECK (status = ANY (ARRAY['ACTIVE'::text, 'ARCHIVED'::text])),
  city_district text,
  tehsil text,
  uc_name text,
  uc_type text,
  consumer_name text,
  address text,
  house_type text,
  unit_type text,
  surveyor_name text,
  survey_date date,
  survey_time time without time zone,
  lat double precision,
  lng double precision,
  image_urls text[],
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  is_biller boolean DEFAULT false,
  monthly_fee integer DEFAULT 0,
  billing_category text DEFAULT 'UNKNOWN'::text,
  category text,
  sub_category text,
  CONSTRAINT survey_units_pkey PRIMARY KEY (survey_id)
);

-- 3. bills
CREATE TABLE public.bills (
  psid text NOT NULL,
  bill_month text NOT NULL,
  survey_id text,
  amount_due numeric,
  amount_paid numeric DEFAULT 0,
  fine numeric DEFAULT 0,
  total_payable numeric,
  payment_status text DEFAULT 'UNPAID'::text,
  paid_date date,
  payment_method text,
  is_primary boolean DEFAULT true,
  recon_notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  is_issued boolean DEFAULT false,
  current_bill numeric DEFAULT 0,
  arrears numeric DEFAULT 0,
  category text,
  sub_category text,
  billing_category text,
  start_month text,
  deleted_in_portal text,
  payment_count integer DEFAULT 0,
  CONSTRAINT bills_pkey PRIMARY KEY (psid, bill_month),
  CONSTRAINT bills_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey_units(survey_id)
);

-- 4. profiles (links to auth.users)
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  role text DEFAULT 'user'::text,
  permissions jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

-- 5. staff (links to auth.users)
CREATE TABLE public.staff (
  id uuid NOT NULL,
  email text,
  role text CHECK (role = ANY (ARRAY['admin'::text, 'staff'::text, 'viewer'::text])),
  full_name text,
  assigned_city text,
  assigned_ucs text[],
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT staff_pkey PRIMARY KEY (id),
  CONSTRAINT staff_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

-- 6. saved_routes
CREATE TABLE public.saved_routes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  route_name text NOT NULL,
  created_by text,
  route_data jsonb NOT NULL,
  delivery_feb2026 jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT saved_routes_pkey PRIMARY KEY (id)
);

-- 7. verified_houses
CREATE TABLE public.verified_houses (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  survey_id character varying NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  surveyor_name character varying,
  route_name character varying,
  default_lat numeric,
  default_lng numeric,
  verified_at timestamp with time zone DEFAULT now(),
  billing_month text,
  verified_by text,
  street_no text,
  is_right boolean DEFAULT false,
  sequence_no integer,
  is_delivered boolean DEFAULT false,
  delivered_at timestamp with time zone,
  CONSTRAINT verified_houses_pkey PRIMARY KEY (id)
);

-- 8. staff_sync_logs (fixed IDENTITY — no nextval)
CREATE TABLE public.staff_sync_logs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  email text NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text),
  upload_count integer NOT NULL,
  synced_at timestamp with time zone DEFAULT now(),
  survey_id text,
  file_id text UNIQUE,
  CONSTRAINT staff_sync_logs_pkey PRIMARY KEY (id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_survey_city ON survey_units(city_district);
CREATE INDEX IF NOT EXISTS idx_survey_tehsil ON survey_units(tehsil);
CREATE INDEX IF NOT EXISTS idx_survey_uc ON survey_units(uc_name);
CREATE INDEX IF NOT EXISTS idx_survey_surveyor ON survey_units(surveyor_name);
CREATE INDEX IF NOT EXISTS idx_bills_month ON bills(bill_month);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_bills_survey_id ON bills(survey_id);
CREATE INDEX IF NOT EXISTS idx_verified_survey_id ON verified_houses(survey_id);

-- ============================================================
-- ROW LEVEL SECURITY (public read for all)
-- ============================================================
ALTER TABLE survey_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all" ON survey_units;
CREATE POLICY "select_all" ON survey_units FOR SELECT USING (true);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all" ON bills;
CREATE POLICY "select_all" ON bills FOR SELECT USING (true);

ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all" ON saved_routes;
CREATE POLICY "select_all" ON saved_routes FOR SELECT USING (true);

ALTER TABLE verified_houses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all" ON verified_houses;
CREATE POLICY "select_all" ON verified_houses FOR SELECT USING (true);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all" ON profiles;
CREATE POLICY "select_all" ON profiles FOR SELECT USING (true);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all" ON staff;
CREATE POLICY "select_all" ON staff FOR SELECT USING (true);
