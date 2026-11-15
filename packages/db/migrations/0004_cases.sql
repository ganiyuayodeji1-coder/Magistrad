-- Phase 1 · Cases, sides, parties, participants, spaces and the case timeline.
--
-- The separation rules live here, in row-level security, so they hold even if the API
-- has a bug. The API checks the same rules first (packages/policy) and the permission
-- matrix tests both layers.

CREATE TYPE app.case_category AS ENUM ('commercial', 'chancery', 'technology_construction', 'kings_bench', 'county_court', 'other');
CREATE TYPE app.case_status AS ENUM ('pre_action', 'issued', 'stayed', 'settled', 'closed');
CREATE TYPE app.side_kind AS ENUM ('claimant', 'defendant');
CREATE TYPE app.case_role AS ENUM ('judge', 'court_staff', 'party', 'solicitor', 'barrister', 'expert', 'external');
CREATE TYPE app.participant_status AS ENUM ('active', 'removed');
CREATE TYPE app.space_kind AS ENUM ('side_private', 'shared', 'court_record');
CREATE TYPE app.event_visibility AS ENUM ('case', 'side');

CREATE SEQUENCE app.case_reference_seq;

CREATE TABLE app.cases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference              text NOT NULL UNIQUE,
  claim_number           text CHECK (claim_number IS NULL OR length(claim_number) BETWEEN 3 AND 40),
  title                  text NOT NULL CHECK (length(title) BETWEEN 3 AND 300),
  court_name             text NOT NULL CHECK (length(court_name) BETWEEN 2 AND 200),
  court_organisation_id  uuid REFERENCES app.organisations(id),
  category               app.case_category NOT NULL,
  status                 app.case_status NOT NULL DEFAULT 'pre_action',
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NOT NULL REFERENCES app.users(id),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.sides (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                 uuid NOT NULL REFERENCES app.cases(id),
  kind                    app.side_kind NOT NULL,
  acting_organisation_id  uuid REFERENCES app.organisations(id),
  UNIQUE (case_id, kind),
  UNIQUE (id, case_id)
);

CREATE TABLE app.parties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL,
  side_id     uuid NOT NULL,
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 300),
  party_type  text NOT NULL CHECK (party_type IN ('individual', 'organisation')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  FOREIGN KEY (side_id, case_id) REFERENCES app.sides (id, case_id)
);

CREATE TABLE app.participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES app.cases(id),
  user_id     uuid NOT NULL REFERENCES app.users(id),
  case_role   app.case_role NOT NULL,
  side_id     uuid,
  status      app.participant_status NOT NULL DEFAULT 'active',
  added_by    uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, user_id),
  FOREIGN KEY (side_id, case_id) REFERENCES app.sides (id, case_id),
  -- Court roles belong to no side; everyone else belongs to exactly one.
  CHECK ((case_role IN ('judge', 'court_staff')) = (side_id IS NULL))
);
CREATE INDEX participants_user_idx ON app.participants (user_id) WHERE status = 'active';

CREATE TABLE app.spaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES app.cases(id),
  kind        app.space_kind NOT NULL,
  side_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (side_id, case_id) REFERENCES app.sides (id, case_id),
  CHECK ((kind = 'side_private') = (side_id IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (case_id, kind, side_id)
);

CREATE TABLE app.case_events (
  id           bigserial PRIMARY KEY,
  case_id      uuid NOT NULL REFERENCES app.cases(id),
  occurred_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id     uuid,
  kind         text NOT NULL CHECK (kind ~ '^[a-z][A-Za-z0-9_.]{2,80}$'),
  summary      text NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  visibility   app.event_visibility NOT NULL,
  side_id      uuid,
  metadata     jsonb,
  FOREIGN KEY (side_id, case_id) REFERENCES app.sides (id, case_id),
  CHECK ((visibility = 'side') = (side_id IS NOT NULL))
);
CREATE INDEX case_events_case_idx ON app.case_events (case_id, id DESC);

-- ── "Who am I in this case?" (owner-run so policies don't recurse) ────
CREATE FUNCTION app.my_case_role(p_case uuid) RETURNS app.case_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT p.case_role FROM app.participants p JOIN app.users u ON u.id = p.user_id
  WHERE p.case_id = p_case AND p.user_id = app.current_user_id() AND p.status = 'active' AND u.status = 'active'
$$;

CREATE FUNCTION app.my_case_side(p_case uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT p.side_id FROM app.participants p JOIN app.users u ON u.id = p.user_id
  WHERE p.case_id = p_case AND p.user_id = app.current_user_id() AND p.status = 'active' AND u.status = 'active'
$$;

CREATE FUNCTION app.is_case_participant(p_case uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT app.my_case_role(p_case) IS NOT NULL
$$;

-- The court's registry (admins of the court organisation the case is linked to) can see
-- that a case exists and assign judges, without seeing any case material.
CREATE FUNCTION app.is_case_court_admin(p_case uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM app.cases c WHERE c.id = p_case
                 AND c.court_organisation_id IS NOT NULL AND app.is_org_admin(c.court_organisation_id))
$$;

-- THE separation rule. Private spaces: only the owning side's party, solicitors and counsel.
-- Never the other side, never the court, never a super administrator.
-- Experts and external participants get nothing by default; Phase 2 adds per-folder grants.
CREATE FUNCTION app.can_read_space(p_space uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT CASE s.kind
    WHEN 'side_private' THEN app.my_case_role(s.case_id) IN ('party', 'solicitor', 'barrister')
                             AND app.my_case_side(s.case_id) = s.side_id
    ELSE app.my_case_role(s.case_id) IN ('judge', 'court_staff', 'party', 'solicitor', 'barrister')
  END
  FROM app.spaces s WHERE s.id = p_space
$$;

-- Who appears in whose members list: everyone sees the court and the people "on the record"
-- (parties and solicitors). A side's counsel, experts and other helpers are visible to that
-- side and to the court only.
CREATE FUNCTION app.can_see_participant(p_case uuid, p_role app.case_role, p_side uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT app.is_case_participant(p_case) AND (
    p_user = app.current_user_id()
    OR app.my_case_role(p_case) IN ('judge', 'court_staff')
    OR p_role IN ('judge', 'court_staff', 'party', 'solicitor')
    OR p_side = app.my_case_side(p_case)
  )
$$;

-- Who may add or remove whom. Nobody changes their own participation.
CREATE FUNCTION app.can_manage_participant(p_case uuid, p_role app.case_role, p_side uuid, p_target uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  me_role app.case_role := app.my_case_role(p_case);
  me_side uuid := app.my_case_side(p_case);
  court uuid;
BEGIN
  IF p_target = app.current_user_id() THEN RETURN false; END IF;
  SELECT court_organisation_id INTO court FROM app.cases WHERE id = p_case;

  IF p_role IN ('judge', 'court_staff') THEN
    -- Only the linked court, and only its own members.
    RETURN court IS NOT NULL
      AND (me_role = 'court_staff' OR app.is_org_admin(court))
      AND EXISTS (SELECT 1 FROM app.memberships m WHERE m.organisation_id = court
                  AND m.user_id = p_target AND m.status = 'active');
  END IF;

  IF p_side IS NULL THEN RETURN false; END IF;
  IF me_role = 'court_staff' THEN RETURN true; END IF;
  IF me_role = 'solicitor' AND me_side = p_side THEN RETURN true; END IF;
  -- Bringing the other side in: a solicitor may invite the first solicitor (or a litigant
  -- in person) for the other side, but only while that side has nobody on the case yet.
  RETURN me_role = 'solicitor' AND me_side <> p_side AND p_role IN ('solicitor', 'party')
    AND NOT EXISTS (SELECT 1 FROM app.participants x WHERE x.case_id = p_case AND x.side_id = p_side AND x.status = 'active');
END $$;

CREATE FUNCTION app.can_see_user_via_case(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM app.participants t
                 WHERE t.user_id = p_user AND app.can_see_participant(t.case_id, t.case_role, t.side_id, t.user_id))
$$;

CREATE FUNCTION app.is_case_manager_anywhere() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM app.participants p JOIN app.users u ON u.id = p.user_id
                 WHERE p.user_id = app.current_user_id() AND p.status = 'active' AND u.status = 'active'
                   AND p.case_role IN ('solicitor', 'court_staff'))
$$;

-- ── Row-level security ────────────────────────────────────────────────
ALTER TABLE app.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sides ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cases_select ON app.cases FOR SELECT
  USING (app.is_case_participant(id) OR app.is_case_court_admin(id));
CREATE POLICY cases_update ON app.cases FOR UPDATE
  USING (app.my_case_role(id) IN ('solicitor', 'court_staff'))
  WITH CHECK (app.my_case_role(id) IN ('solicitor', 'court_staff'));

CREATE POLICY sides_select ON app.sides FOR SELECT
  USING (app.is_case_participant(case_id) OR app.is_case_court_admin(case_id));

CREATE POLICY parties_select ON app.parties FOR SELECT
  USING (app.is_case_participant(case_id) OR app.is_case_court_admin(case_id));
CREATE POLICY parties_insert ON app.parties FOR INSERT
  WITH CHECK (created_by = app.current_user_id() AND (
    app.my_case_role(case_id) = 'court_staff'
    OR (app.my_case_role(case_id) = 'solicitor' AND app.my_case_side(case_id) = side_id)));

CREATE POLICY participants_select ON app.participants FOR SELECT
  USING (app.can_see_participant(case_id, case_role, side_id, user_id) OR app.is_case_court_admin(case_id) AND case_role IN ('judge', 'court_staff'));
CREATE POLICY participants_insert ON app.participants FOR INSERT
  WITH CHECK (added_by = app.current_user_id() AND app.can_manage_participant(case_id, case_role, side_id, user_id));
CREATE POLICY participants_update ON app.participants FOR UPDATE
  USING (app.can_manage_participant(case_id, case_role, side_id, user_id))
  WITH CHECK (app.can_manage_participant(case_id, case_role, side_id, user_id));

CREATE POLICY spaces_select ON app.spaces FOR SELECT USING (app.can_read_space(id));

CREATE POLICY case_events_select ON app.case_events FOR SELECT
  USING (app.is_case_participant(case_id)
         AND (visibility = 'case' OR side_id = app.my_case_side(case_id)));

-- Users: also visible to people who can see them on a shared case.
DROP POLICY users_select ON app.users;
CREATE POLICY users_select ON app.users FOR SELECT
  USING (id = app.current_user_id() OR app.is_super_admin() OR app.shares_org_with(id) OR app.can_see_user_via_case(id));
-- Solicitors and court staff can invite new people (e.g. a client or an expert) into their cases.
DROP POLICY users_insert ON app.users;
CREATE POLICY users_insert ON app.users FOR INSERT
  WITH CHECK (app.is_super_admin() OR app.is_any_org_admin() OR app.is_case_manager_anywhere());

-- Courts and tribunals are a public directory, so parties can link their case to one.
CREATE FUNCTION app.list_courts() RETURNS TABLE (id uuid, name text, type app.organisation_type)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT id, name, type FROM app.organisations WHERE type IN ('court', 'tribunal') AND status = 'active' ORDER BY name
$$;

-- ── Guards ────────────────────────────────────────────────────────────
CREATE FUNCTION app.guard_cases() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
BEGIN
  IF current_user = 'magistrad_owner' THEN RETURN NEW; END IF;
  IF NEW.id <> OLD.id OR NEW.reference <> OLD.reference OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'case identity fields cannot be changed' USING ERRCODE = '42501';
  END IF;
  -- Linking a court: solicitors may link one once; only the court can change it afterwards.
  IF NEW.court_organisation_id IS DISTINCT FROM OLD.court_organisation_id THEN
    IF OLD.court_organisation_id IS NOT NULL AND app.my_case_role(OLD.id) <> 'court_staff' THEN
      RAISE EXCEPTION 'only the court can change the court a case is linked to' USING ERRCODE = '42501';
    END IF;
    IF NEW.court_organisation_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.list_courts() lc WHERE lc.id = NEW.court_organisation_id) THEN
      RAISE EXCEPTION 'a case can only be linked to an active court or tribunal' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER cases_guard BEFORE UPDATE ON app.cases FOR EACH ROW EXECUTE FUNCTION app.guard_cases();

CREATE FUNCTION app.guard_participants() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
BEGIN
  IF current_user = 'magistrad_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.case_id <> OLD.case_id OR NEW.user_id <> OLD.user_id
     OR NEW.case_role <> OLD.case_role OR NEW.side_id IS DISTINCT FROM OLD.side_id OR NEW.added_by <> OLD.added_by) THEN
    RAISE EXCEPTION 'a participant''s case, person, role and side cannot be changed; remove and re-add instead' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER participants_guard BEFORE INSERT OR UPDATE ON app.participants
  FOR EACH ROW EXECUTE FUNCTION app.guard_participants();

CREATE FUNCTION app.case_events_block_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'case_events is append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER case_events_append_only BEFORE UPDATE OR DELETE ON app.case_events
  FOR EACH ROW EXECUTE FUNCTION app.case_events_block_changes();
CREATE TRIGGER case_events_no_truncate BEFORE TRUNCATE ON app.case_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.case_events_block_changes();

-- ── Functions the API calls ───────────────────────────────────────────
-- Opening a case: the one place a person becomes a participant of their own accord,
-- because they are creating the matter. They join as solicitor for the side they act for
-- (law firm), or as court staff (court). Sides, spaces and both parties are created together.
CREATE FUNCTION app.create_case(
  p_organisation uuid, p_title text, p_court_name text, p_category app.case_category, p_claim_number text,
  p_acting_for app.side_kind, p_claimant_name text, p_claimant_type text, p_defendant_name text, p_defendant_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  me uuid := app.current_user_id();
  org app.organisations;
  case_id uuid := gen_random_uuid();
  claimant_side uuid := gen_random_uuid();
  defendant_side uuid := gen_random_uuid();
  ref text;
BEGIN
  SELECT * INTO org FROM app.organisations WHERE id = p_organisation AND status = 'active';
  IF me IS NULL OR org.id IS NULL OR NOT app.is_org_member(p_organisation) OR org.type NOT IN ('law_firm', 'court', 'tribunal') THEN
    RAISE EXCEPTION 'cases can only be opened by members of a law firm, court or tribunal' USING ERRCODE = '42501';
  END IF;
  IF org.type = 'law_firm' AND p_acting_for IS NULL THEN
    RAISE EXCEPTION 'say which side your firm acts for' USING ERRCODE = '22023';
  END IF;

  ref := 'MAG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('app.case_reference_seq')::text, 6, '0');
  INSERT INTO app.cases (id, reference, claim_number, title, court_name, court_organisation_id, category, created_by)
  VALUES (case_id, ref, nullif(trim(p_claim_number), ''), trim(p_title), trim(p_court_name),
          CASE WHEN org.type IN ('court', 'tribunal') THEN org.id END, p_category, me);
  INSERT INTO app.sides (id, case_id, kind, acting_organisation_id) VALUES
    (claimant_side, case_id, 'claimant', CASE WHEN org.type = 'law_firm' AND p_acting_for = 'claimant' THEN org.id END),
    (defendant_side, case_id, 'defendant', CASE WHEN org.type = 'law_firm' AND p_acting_for = 'defendant' THEN org.id END);
  INSERT INTO app.parties (case_id, side_id, name, party_type, created_by) VALUES
    (case_id, claimant_side, trim(p_claimant_name), p_claimant_type, me),
    (case_id, defendant_side, trim(p_defendant_name), p_defendant_type, me);
  INSERT INTO app.spaces (case_id, kind, side_id) VALUES
    (case_id, 'shared', NULL), (case_id, 'court_record', NULL),
    (case_id, 'side_private', claimant_side), (case_id, 'side_private', defendant_side);
  INSERT INTO app.participants (case_id, user_id, case_role, side_id, added_by)
  VALUES (case_id, me,
          CASE WHEN org.type = 'law_firm' THEN 'solicitor'::app.case_role ELSE 'court_staff'::app.case_role END,
          CASE WHEN org.type = 'law_firm' THEN (CASE p_acting_for WHEN 'claimant' THEN claimant_side ELSE defendant_side END) END,
          me);
  INSERT INTO app.case_events (case_id, actor_id, kind, summary, visibility)
  VALUES (case_id, me, 'case.opened', 'Case opened on Magistrad', 'case');
  RETURN case_id;
END $$;

-- Writes to the case timeline. Side-only events are visible only to that side.
CREATE FUNCTION app.case_log(p_case uuid, p_kind text, p_summary text, p_visibility app.event_visibility, p_side uuid, p_metadata jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE new_id bigint;
BEGIN
  IF NOT (app.is_case_participant(p_case) OR app.is_case_court_admin(p_case)) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;
  IF p_visibility = 'side' AND p_side IS DISTINCT FROM app.my_case_side(p_case) THEN
    RAISE EXCEPTION 'you can only record private events for your own side' USING ERRCODE = '42501';
  END IF;
  INSERT INTO app.case_events (case_id, actor_id, kind, summary, visibility, side_id, metadata)
  VALUES (p_case, app.current_user_id(), p_kind, p_summary, p_visibility, CASE WHEN p_visibility = 'side' THEN p_side END, p_metadata)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- Looks up an account by email for someone allowed to manage this case's members.
CREATE FUNCTION app.case_find_user_by_email(p_case uuid, p_email text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
BEGIN
  IF NOT (app.my_case_role(p_case) IN ('solicitor', 'court_staff') OR app.is_case_court_admin(p_case)) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT id FROM app.users WHERE email = lower(trim(p_email)));
END $$;

-- ── Grants ────────────────────────────────────────────────────────────
GRANT SELECT ON app.cases, app.sides, app.parties, app.participants, app.spaces, app.case_events TO magistrad_app;
GRANT UPDATE (claim_number, status, court_organisation_id, title) ON app.cases TO magistrad_app;
GRANT INSERT ON app.parties, app.participants TO magistrad_app;
GRANT UPDATE (status) ON app.participants TO magistrad_app;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.my_case_role(uuid), app.my_case_side(uuid), app.is_case_participant(uuid), app.is_case_court_admin(uuid),
  app.can_read_space(uuid), app.can_see_participant(uuid, app.case_role, uuid, uuid),
  app.can_manage_participant(uuid, app.case_role, uuid, uuid), app.can_see_user_via_case(uuid),
  app.is_case_manager_anywhere(),
  app.create_case(uuid, text, text, app.case_category, text, app.side_kind, text, text, text, text),
  app.case_log(uuid, text, text, app.event_visibility, uuid, jsonb),
  app.case_find_user_by_email(uuid, text), app.list_courts()
  TO magistrad_app;
