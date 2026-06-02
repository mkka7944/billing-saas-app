-- Check what uc_name values exist for MC-1 pattern
SELECT uc_name, count(*) as cnt
FROM survey_units
WHERE uc_name ILIKE '%MC-1%'
GROUP BY uc_name
ORDER BY cnt DESC;

-- Check if hierarchy values match survey_units values (case difference?)
SELECT DISTINCT h.uc_name as hierarchy_uc, su.uc_name as survey_uc
FROM hierarchy h
JOIN survey_units su ON LOWER(h.uc_name) = LOWER(su.uc_name)
WHERE h.uc_name ILIKE '%MC-1%'
  AND h.uc_name != su.uc_name;

-- Count total active survey_units matching MC-1 pattern
SELECT count(*) as total_active_mc1
FROM survey_units
WHERE status = 'ACTIVE' AND uc_name ILIKE '%MC-1%';
