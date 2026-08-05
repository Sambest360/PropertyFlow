-- Remove seeded demo applications so staff see an empty Applicants list.
-- Safe to run multiple times. Leases keep rows but lose application_id links (ON DELETE SET NULL).

DELETE FROM applications;
