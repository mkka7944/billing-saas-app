-- Add payment_count to bills to track number of transactions summed into the record
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_count INTEGER DEFAULT 0;

-- Optional: Initialize existing records based on amount_paid
UPDATE bills SET payment_count = 1 WHERE amount_paid > 0 AND payment_count = 0;
