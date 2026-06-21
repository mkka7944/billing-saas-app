-- Add new flag reasons for staff GPS OOR delivery flow
-- Staff can flag as: unsent (bill not deliverable here), duplicate_psid (same PSID mapped twice), duplicate_sid (same survey ID mapped twice)

ALTER TABLE flagged_psids DROP CONSTRAINT IF EXISTS flagged_psids_reason_check;

ALTER TABLE flagged_psids ADD CONSTRAINT flagged_psids_reason_check
  CHECK (reason IN (
    'field_deleted',
    'portal_deleted',
    'psid_duplicate_orphan',
    'psid_duplicate_superseded',
    'psid_duplicate_monthly',
    'staff_flagged',
    'admin_flagged',
    'unsent',
    'duplicate_psid',
    'duplicate_sid'
  ));
