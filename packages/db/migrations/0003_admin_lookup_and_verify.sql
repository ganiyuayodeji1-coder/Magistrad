-- Lets an administrator check whether an email already has an account (for example a
-- barrister who belongs to chambers) without being able to read other organisations'
-- user lists. Returns only an id, and only to super admins and organisation admins.
CREATE FUNCTION app.admin_find_user_by_email(p_email text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
BEGIN
  IF NOT (app.is_super_admin() OR app.is_any_org_admin()) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT id FROM app.users WHERE email = lower(trim(p_email)));
END $$;
REVOKE EXECUTE ON FUNCTION app.admin_find_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_find_user_by_email(text) TO magistrad_app;

-- Bring the database in line with the API: only super administrators may run a full
-- chain verification (it reveals the platform-wide event count).
CREATE OR REPLACE FUNCTION app.audit_verify(OUT checked bigint, OUT first_broken_seq bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
DECLARE
  e app.audit_events;
  prev text := repeat('0', 64);
  expected_seq bigint := 1;
BEGIN
  IF NOT app.is_super_admin() THEN RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501'; END IF;
  checked := 0;
  FOR e IN SELECT * FROM app.audit_events ORDER BY seq LOOP
    IF e.seq <> expected_seq OR e.prev_hash <> prev OR e.hash <> app.audit_hash(prev, e) THEN
      first_broken_seq := e.seq;
      RETURN;
    END IF;
    prev := e.hash;
    expected_seq := expected_seq + 1;
    checked := checked + 1;
  END LOOP;
END $$;

-- Action names follow the policy module's spelling (e.g. "member.changeRole").
ALTER TABLE app.audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE app.audit_events ADD CONSTRAINT audit_events_action_check CHECK (action ~ '^[a-z][A-Za-z0-9_.]{2,80}$');
