-- Resolve verification targets by frontend_id, UUID, or entity_id_map (E2E / bootstrap users).

CREATE OR REPLACE FUNCTION public.admin_update_user_verification(
  p_frontend_user_id TEXT,
  p_status TEXT,
  p_reject_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target users%ROWTYPE;
  meta JSONB;
  verification JSONB;
  reviewer_fe TEXT;
BEGIN
  IF NOT is_super_admin() AND NOT is_agency_staff() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT u.* INTO target
  FROM users u
  WHERE u.metadata->>'frontend_id' = p_frontend_user_id
     OR u.id::text = p_frontend_user_id
     OR EXISTS (
       SELECT 1 FROM entity_id_map m
       WHERE m.entity_type = 'user'
         AND m.frontend_id = p_frontend_user_id
         AND m.backend_id = u.id
     )
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF NOT is_super_admin() AND target.client_id IS DISTINCT FROM current_app_client_id() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT metadata->>'frontend_id' INTO reviewer_fe
  FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  meta := COALESCE(target.metadata, '{}'::jsonb);
  verification := COALESCE(meta->'verification', '{}'::jsonb);
  verification := verification || jsonb_build_object(
    'status', p_status,
    'reviewedAt', to_jsonb(NOW()),
    'reviewerId', reviewer_fe,
    'rejectNote', CASE WHEN p_status = 'rejected' THEN to_jsonb(p_reject_note) ELSE verification->'rejectNote' END
  );
  meta := meta || jsonb_build_object('verification', verification);

  UPDATE users SET metadata = meta, updated_at = NOW()
  WHERE id = target.id;

  RETURN meta;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_verification(TEXT, TEXT, TEXT) TO authenticated;
