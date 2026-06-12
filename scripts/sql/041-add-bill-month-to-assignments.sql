-- Add bill_month column (nullable — code sets it via currentMonth() on create)
ALTER TABLE daily_assignments ADD COLUMN bill_month text;

-- Index for filtered queries
CREATE INDEX IF NOT EXISTS idx_assignments_bill_month ON daily_assignments(bill_month);

-- Note: Existing rows were truncated during development.
-- In production, backfill: UPDATE daily_assignments SET bill_month = currentMonth();
