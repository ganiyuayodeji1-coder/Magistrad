-- Phase 0 · Identity, organisations and the row-level security base.
-- Runs as magistrad_owner. The application connects as magistrad_app, which owns
-- nothing and is subject to every policy below. Only the owner is exempt from
-- row-level security; the running application never holds the owner credential.

CREATE SCHEMA app;
GRANT USAGE ON SCHEMA app TO magistrad_app;

CREATE TYPE app.platform_role AS ENUM ('none', 'super_admin');
CREATE TYPE app.user_status AS ENUM ('invited', 'active', 'suspended');
CREATE TYPE app.organisation_type AS ENUM ('law_firm', 'chambers', 'court', 'tribunal', 'platform');
CREATE TYPE app.organisation_status AS ENUM ('active', 'suspended');
CREATE TYPE app.org_role AS ENUM ('org_admin', 'member');
CREATE TYPE app.membership_status AS ENUM ('active', 'removed');

CREATE TABLE app.organisations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  type          app.organisation_type NOT NULL,
  regulator_id  text CHECK (regulator_id IS NULL OR length(regulator_id) <= 64),
  status        app.organisation_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid
);

CREATE TABLE app.users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE CHECK (email = lower(email) AND email LIKE '%_@_%'),
  full_name      text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 200),
  platform_role  app.platform_role NOT NULL DEFAULT 'none',
  status         app.user_status NOT NULL DEFAULT 'invited',
  idp_issuer     text,
  idp_subject    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idp_issuer, idp_subject),
  CHECK ((idp_issuer IS NULL) = (idp_subject IS NULL))
);

CREATE TABLE app.memberships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES app.users(id),
  organisation_id  uuid NOT NULL REFERENCES app.organisations(id),
  org_role         app.org_role NOT NULL DEFAULT 'member',
  status           app.membership_status NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organisation_id)
);
CREATE INDEX memberships_org_idx ON app.memberships (organisation_id) WHERE status = 'active';

-- Sessions and in-flight sign-ins are never readable by the application role.
-- They are reached only through the SECURITY DEFINER functions further down.
CREATE TABLE app.sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES app.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  ip_address    text,
  user_agent    text
);
CREATE INDEX sessions_user_idx ON app.sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE app.auth_flows (
  state_hash     text PRIMARY KEY,
  code_verifier  text NOT NULL,
  nonce          text NOT NULL,
  return_to      text NOT NULL DEFAULT '/',
  expires_at     timestamptz NOT NULL
);

-- ── Request context ───────────────────────────────────────────────────
-- The API sets app.user_id with set_config(..., true) at the start of every
-- transaction. Unset means "nobody": every policy then denies.
CREATE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- Helpers run as owner so policies can consult memberships without recursion.
-- They only ever answer questions about the *current* user.
CREATE FUNCTION app.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM app.users
                 WHERE id = app.current_user_id() AND platform_role = 'super_admin' AND status = 'active')
$$;

CREATE FUNCTION app.is_org_member(org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM app.memberships m JOIN app.users u ON u.id = m.user_id
                 WHERE m.organisation_id = org AND m.user_id = app.current_user_id()
                   AND m.status = 'active' AND u.status = 'active')
$$;

CREATE FUNCTION app.is_org_admin(org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM app.memberships m JOIN app.users u ON u.id = m.user_id
                 WHERE m.organisation_id = org AND m.user_id = app.current_user_id()
                   AND m.status = 'active' AND m.org_role = 'org_admin' AND u.status = 'active')
$$;

CREATE FUNCTION app.shares_org_with(other uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM app.memberships mine
                 JOIN app.memberships theirs ON theirs.organisation_id = mine.organisation_id
                 WHERE mine.user_id = app.current_user_id() AND mine.status = 'active'
                   AND theirs.user_id = other)
$$;

CREATE FUNCTION app.is_any_org_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM app.memberships
                 WHERE user_id = app.current_user_id() AND status = 'active' AND org_role = 'org_admin')
$$;

-- ── Row-level security ────────────────────────────────────────────────
ALTER TABLE app.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.auth_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_select ON app.organisations FOR SELECT
  USING (app.is_super_admin() OR app.is_org_member(id));
CREATE POLICY org_insert ON app.organisations FOR INSERT
  WITH CHECK (app.is_super_admin());
CREATE POLICY org_update ON app.organisations FOR UPDATE
  USING (app.is_super_admin() OR app.is_org_admin(id))
  WITH CHECK (app.is_super_admin() OR app.is_org_admin(id));

CREATE POLICY users_select ON app.users FOR SELECT
  USING (id = app.current_user_id() OR app.is_super_admin() OR app.shares_org_with(id));
CREATE POLICY users_insert ON app.users FOR INSERT
  WITH CHECK (app.is_super_admin() OR app.is_any_org_admin());
CREATE POLICY users_update ON app.users FOR UPDATE
  USING (id = app.current_user_id() OR app.is_super_admin())
  WITH CHECK (id = app.current_user_id() OR app.is_super_admin());

-- Nobody can create or change their own membership: every grant is made by someone else.
CREATE POLICY memberships_select ON app.memberships FOR SELECT
  USING (app.is_super_admin() OR app.is_org_member(organisation_id) OR user_id = app.current_user_id());
CREATE POLICY memberships_insert ON app.memberships FOR INSERT
  WITH CHECK ((app.is_super_admin() OR app.is_org_admin(organisation_id))
              AND user_id <> app.current_user_id() AND created_by = app.current_user_id());
CREATE POLICY memberships_update ON app.memberships FOR UPDATE
  USING ((app.is_super_admin() OR app.is_org_admin(organisation_id)) AND user_id <> app.current_user_id())
  WITH CHECK ((app.is_super_admin() OR app.is_org_admin(organisation_id)) AND user_id <> app.current_user_id());
-- No DELETE policies anywhere: rows are retired by status, never removed.

-- ── Guard rails that policies cannot express ──────────────────────────
-- Guards run as the CALLING role (not SECURITY DEFINER), so current_user tells us
-- whether the change comes from the application role or from an owner-run function
-- such as auth_resolve_login (which activates an invited user at first sign-in).
CREATE FUNCTION app.guard_users() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE me uuid := app.current_user_id();
BEGIN
  IF current_user = 'magistrad_owner' THEN
    RETURN NEW; -- migrations, the bootstrap seed and owner-run auth functions
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.platform_role <> 'none' AND NOT app.is_super_admin() THEN
      RAISE EXCEPTION 'only a super administrator can create privileged users' USING ERRCODE = '42501';
    END IF;
    IF NEW.status <> 'invited' OR NEW.idp_subject IS NOT NULL THEN
      RAISE EXCEPTION 'new users must start as invited' USING ERRCODE = '42501';
    END IF;
    NEW.created_by := me;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF NEW.platform_role IS DISTINCT FROM OLD.platform_role
     AND (NOT app.is_super_admin() OR OLD.id = me) THEN
    RAISE EXCEPTION 'platform roles can only be changed by another super administrator' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND (NOT app.is_super_admin() OR OLD.id = me) THEN
    RAISE EXCEPTION 'account status can only be changed by a super administrator' USING ERRCODE = '42501';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email OR NEW.idp_subject IS DISTINCT FROM OLD.idp_subject
     OR NEW.idp_issuer IS DISTINCT FROM OLD.idp_issuer OR NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'identity fields cannot be changed here' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER users_guard BEFORE INSERT OR UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.guard_users();

CREATE FUNCTION app.guard_memberships() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
BEGIN
  IF current_user = 'magistrad_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.user_id <> OLD.user_id OR NEW.organisation_id <> OLD.organisation_id) THEN
    RAISE EXCEPTION 'a membership cannot be moved to another user or organisation' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER memberships_guard BEFORE INSERT OR UPDATE ON app.memberships
  FOR EACH ROW EXECUTE FUNCTION app.guard_memberships();

-- ── Authentication functions (the only way to touch sessions) ─────────
-- Find the account for a verified sign-in. Binds the identity-provider subject on
-- first sign-in of an invited user. Returns nothing for unknown or suspended users.
CREATE FUNCTION app.auth_resolve_login(p_issuer text, p_subject text, p_email text, p_email_verified boolean)
RETURNS TABLE (user_id uuid, status app.user_status)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
#variable_conflict use_column
DECLARE u app.users;
BEGIN
  SELECT * INTO u FROM app.users WHERE idp_issuer = p_issuer AND idp_subject = p_subject;
  IF NOT FOUND THEN
    IF NOT p_email_verified THEN RETURN; END IF;
    SELECT * INTO u FROM app.users
      WHERE email = lower(p_email) AND status = 'invited' AND idp_subject IS NULL
      FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    UPDATE app.users SET idp_issuer = p_issuer, idp_subject = p_subject, status = 'active', updated_at = now()
      WHERE id = u.id RETURNING * INTO u;
  END IF;
  user_id := u.id; status := u.status;
  RETURN NEXT;
END $$;

CREATE FUNCTION app.auth_create_session(p_user uuid, p_token_hash text, p_ttl interval, p_ip text, p_ua text)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = app, pg_temp AS $$
  INSERT INTO app.sessions (token_hash, user_id, expires_at, ip_address, user_agent)
  VALUES (p_token_hash, p_user, now() + p_ttl, left(p_ip, 64), left(p_ua, 512))
  RETURNING id
$$;

-- Resolves a session token hash, enforcing revocation, expiry, idle timeout and account status.
CREATE FUNCTION app.auth_resolve_session(p_token_hash text, p_idle interval)
RETURNS TABLE (session_id uuid, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
#variable_conflict use_column
DECLARE s app.sessions;
BEGIN
  SELECT * INTO s FROM app.sessions
    WHERE token_hash = p_token_hash AND revoked_at IS NULL AND expires_at > now()
      AND last_seen_at > now() - p_idle;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM app.users WHERE id = s.user_id AND status = 'active') THEN RETURN; END IF;
  IF s.last_seen_at < now() - interval '1 minute' THEN
    UPDATE app.sessions SET last_seen_at = now() WHERE id = s.id;
  END IF;
  session_id := s.id; user_id := s.user_id;
  RETURN NEXT;
END $$;

CREATE FUNCTION app.auth_revoke_session(p_token_hash text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = app, pg_temp AS $$
  UPDATE app.sessions SET revoked_at = now()
  WHERE token_hash = p_token_hash AND revoked_at IS NULL
  RETURNING user_id
$$;

-- Suspending an account ends every session at once. Callable only by a super admin.
CREATE FUNCTION app.auth_revoke_user_sessions(p_user uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF NOT app.is_super_admin() AND p_user IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;
  UPDATE app.sessions SET revoked_at = now() WHERE user_id = p_user AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION app.auth_begin_flow(p_state_hash text, p_verifier text, p_nonce text, p_return_to text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = app, pg_temp AS $$
  DELETE FROM app.auth_flows WHERE expires_at < now();
  INSERT INTO app.auth_flows (state_hash, code_verifier, nonce, return_to, expires_at)
  VALUES (p_state_hash, p_verifier, p_nonce, p_return_to, now() + interval '10 minutes');
$$;

-- Single use: the flow row is deleted as it is read.
CREATE FUNCTION app.auth_take_flow(p_state_hash text)
RETURNS TABLE (code_verifier text, nonce text, return_to text)
LANGUAGE sql SECURITY DEFINER SET search_path = app, pg_temp AS $$
  DELETE FROM app.auth_flows WHERE state_hash = p_state_hash AND expires_at > now()
  RETURNING code_verifier, nonce, return_to
$$;

-- ── Grants ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON app.organisations, app.users, app.memberships TO magistrad_app;
REVOKE ALL ON app.sessions, app.auth_flows FROM magistrad_app;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_user_id(), app.is_super_admin(), app.is_org_member(uuid),
  app.is_org_admin(uuid), app.shares_org_with(uuid), app.is_any_org_admin(),
  app.auth_resolve_login(text, text, text, boolean), app.auth_create_session(uuid, text, interval, text, text),
  app.auth_resolve_session(text, interval), app.auth_revoke_session(text), app.auth_revoke_user_sessions(uuid),
  app.auth_begin_flow(text, text, text, text), app.auth_take_flow(text)
  TO magistrad_app;
