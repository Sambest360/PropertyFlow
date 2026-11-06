-- 041: leases where the agency is the lessor (no landlord) are complete once
-- the tenant signs.
--
-- Until now the signing step counted the missing landlord part as "pending",
-- so such a lease stayed "partially_signed" after the tenant signed, and
-- approving the Lease stage was refused ("inspection_scheduled needs
-- landlord_signed ... it shows tenant_signed"). The signing step now marks
-- them completed; this repairs the ones signed before.
--
-- Only touches a lease with no landlord_id, no landlord block, a signed
-- tenant block and status partially_signed. Safe to run more than once.

UPDATE leases
   SET metadata = jsonb_set(metadata, '{eSign,status}', '"completed"'::jsonb),
       updated_at = NOW()
 WHERE landlord_id IS NULL
   AND metadata->'eSign'->>'status' = 'partially_signed'
   AND metadata->'eSign'->'tenant'->>'status' = 'signed'
   AND (metadata->'eSign'->'landlord' IS NULL OR jsonb_typeof(metadata->'eSign'->'landlord') = 'null');
