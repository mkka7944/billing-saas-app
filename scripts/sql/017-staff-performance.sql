-- 017-staff-performance.sql
-- Staff performance notes + rating (Phase C.2)

CREATE TABLE IF NOT EXISTS public.staff_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id),
  assigned_date date NOT NULL,
  rating smallint CHECK (rating >= 1 AND rating <= 5),
  notes text,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (staff_id, assigned_date)
);

ALTER TABLE public.staff_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read staff_performance"
  ON public.staff_performance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert staff_performance"
  ON public.staff_performance FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update staff_performance"
  ON public.staff_performance FOR UPDATE
  TO authenticated
  USING (true);
