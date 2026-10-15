-- Idempotent deploy of guest listing enquiry RPC (production missed 005).
-- Includes AVAILABLE in public gate (aligned with 015 marketplace lite).

CREATE OR REPLACE FUNCTION submit_public_listing_enquiry(
  p_property_fe_id   TEXT,
  p_action           TEXT,
  p_first_name       TEXT,
  p_last_name        TEXT,
  p_email            TEXT,
  p_phone            TEXT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL,
  p_slot_fe_id       TEXT DEFAULT NULL,
  p_monthly_income   NUMERIC DEFAULT NULL,
  p_id_number        TEXT DEFAULT NULL,
  p_interest_type    TEXT DEFAULT 'RENT'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id       UUID;
  v_client_id     UUID;
  v_agent_id      UUID;
  v_slot_id       UUID;
  v_lead_id       UUID;
  v_booking_id    UUID;
  v_full_name     TEXT;
  v_stage         TEXT;
  v_interest      TEXT;
  v_value         NUMERIC;
  v_status_key    TEXT;
  v_listing_type  TEXT;
  v_slot_date     DATE;
  v_slot_time     TEXT;
  v_slot_cap      INT;
  v_slot_booked   INT;
  v_slot_status   TEXT;
  v_extra_notes   TEXT;
BEGIN
  IF p_property_fe_id IS NULL OR trim(p_property_fe_id) = '' THEN
    RAISE EXCEPTION 'property_required';
  END IF;

  IF p_action NOT IN ('lead', 'viewing') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  IF p_first_name IS NULL OR trim(p_first_name) = ''
     OR p_last_name IS NULL OR trim(p_last_name) = ''
     OR p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'contact_required';
  END IF;

  SELECT m.backend_id::uuid INTO v_unit_id
  FROM entity_id_map m
  WHERE m.entity_type IN ('unit', 'property')
    AND m.frontend_id = trim(p_property_fe_id)
  LIMIT 1;

  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;

  SELECT u.client_id, u.agent_id, u.status_config_key, u.listing_type,
         COALESCE(u.price, u.rent, 0)
  INTO v_client_id, v_agent_id, v_status_key, v_listing_type, v_value
  FROM units u
  WHERE u.id = v_unit_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;

  IF v_status_key NOT IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE') THEN
    RAISE EXCEPTION 'property_not_public';
  END IF;

  v_full_name := trim(p_first_name) || ' ' || trim(p_last_name);
  v_interest := CASE WHEN upper(coalesce(p_interest_type, 'RENT')) = 'BUY' THEN 'BUY' ELSE 'RENT' END;

  v_extra_notes := NULLIF(trim(coalesce(p_notes, '')), '');
  IF p_monthly_income IS NOT NULL THEN
    v_extra_notes := coalesce(v_extra_notes || E'\n', '') || 'Monthly income: ' || p_monthly_income::text;
  END IF;
  IF p_id_number IS NOT NULL AND trim(p_id_number) <> '' THEN
    v_extra_notes := coalesce(v_extra_notes || E'\n', '') || 'ID/Passport: ' || trim(p_id_number);
  END IF;

  IF p_action = 'lead' THEN
    v_stage := 'New Lead';
  ELSIF p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '' THEN
    v_stage := 'Viewing Scheduled';
  ELSE
    v_stage := 'Viewing Requested';
  END IF;

  v_lead_id := gen_random_uuid();
  INSERT INTO leads (
    id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
    interest_type, value_amount, notes, updated_at
  ) VALUES (
    v_lead_id, v_client_id, v_unit_id, v_agent_id, v_full_name,
    lower(trim(p_email)), NULLIF(trim(coalesce(p_phone, '')), ''),
    'Web Form', v_stage, v_interest, v_value, v_extra_notes, NOW()
  );

  IF p_action = 'viewing' AND p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '' THEN
    SELECT m.backend_id::uuid INTO v_slot_id
    FROM entity_id_map m
    WHERE m.entity_type = 'viewing_slot'
      AND m.frontend_id = trim(p_slot_fe_id)
    LIMIT 1;

    IF v_slot_id IS NULL THEN
      RAISE EXCEPTION 'slot_not_found';
    END IF;

    SELECT slot_date, slot_time, capacity, booked_count, status
    INTO v_slot_date, v_slot_time, v_slot_cap, v_slot_booked, v_slot_status
    FROM viewing_slots
    WHERE id = v_slot_id AND unit_id = v_unit_id AND client_id = v_client_id
    FOR UPDATE;

    IF v_slot_date IS NULL THEN
      RAISE EXCEPTION 'slot_not_found';
    END IF;

    IF v_slot_status <> 'OPEN' OR v_slot_booked >= v_slot_cap THEN
      RAISE EXCEPTION 'slot_unavailable';
    END IF;

    v_booking_id := gen_random_uuid();
    INSERT INTO bookings (
      id, client_id, unit_id, slot_id, agent_id, visitor_name, visitor_email, visitor_phone,
      starts_at, status, notes, updated_at
    ) VALUES (
      v_booking_id, v_client_id, v_unit_id, v_slot_id, v_agent_id, v_full_name,
      lower(trim(p_email)), NULLIF(trim(coalesce(p_phone, '')), ''),
      (v_slot_date::text || 'T' || v_slot_time || ':00')::timestamptz,
      'SCHEDULED', v_extra_notes, NOW()
    );

    UPDATE viewing_slots
    SET booked_count = booked_count + 1,
        status = CASE WHEN booked_count + 1 >= capacity THEN 'FULL' ELSE status END,
        updated_at = NOW()
    WHERE id = v_slot_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', v_lead_id,
    'booking_id', v_booking_id,
    'stage', v_stage
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_public_listing_enquiry(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION submit_public_listing_enquiry(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) TO anon, authenticated;
