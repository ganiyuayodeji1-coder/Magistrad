-- Phase 0 · Tamper-evident audit log.
-- The application role cannot INSERT, UPDATE or DELETE audit rows directly. It can only
-- call app.audit_append(), which computes the hash chain inside the database under a lock.

CREATE TYPE app.audit_outcome AS ENUM ('success', 'denied', 'failure');

CREATE TABLE app.audit_events (
  seq              bigint PRIMARY KEY,
  occurred_at      timestamptz NOT NULL,
  actor_id         uuid,
  action           text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.]{2,80}$'),
  outcome          app.audit_outcome NOT NULL,
  resource_type    text,
  resource_id      text,
  organisation_id  uuid,
  ip_address       text,
  metadata         jsonb,
  prev_hash        text NOT NULL,
  hash             text NOT NULL UNIQUE
);
CREATE INDEX audit_actor_idx ON app.audit_events (actor_id);
CREATE INDEX audit_org_idx ON app.audit_events (organisation_id);
CREATE INDEX audit_resource_idx ON app.audit_events (resource_type, resource_id);

-- Periodic snapshots of the chain head. Phase 2 copies each one to write-once storage,
-- so rewriting the whole chain (or deleting its tail) becomes detectable.
CREATE TABLE app.audit_checkpoints (
  id          bigserial PRIMARY KEY,
  seq         bigint NOT NULL,
  hash        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The exact bytes that are hashed. jsonb_build_array gives an unambiguous, canonical
-- encoding (no separator tricks), and jsonb normalises metadata key order.
CREATE FUNCTION app.audit_payload(e app.audit_events) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_array(
    e.seq,
    to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    e.actor_id, e.action, e.outcome, e.resource_type, e.resource_id,
    e.organisation_id, e.ip_address, e.metadata
  )::text
$$;

CREATE FUNCTION app.audit_hash(prev text, e app.audit_events) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(digest(prev || app.audit_payload(e), 'sha256'), 'hex')
$$;

CREATE FUNCTION app.audit_append(
  p_action text, p_outcome app.audit_outcome,
  p_resource_type text DEFAULT NULL, p_resource_id text DEFAULT NULL,
  p_organisation_id uuid DEFAULT NULL, p_ip text DEFAULT NULL, p_metadata jsonb DEFAULT NULL,
  p_actor uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
DECLARE
  e app.audit_events;
  last app.audit_events;
BEGIN
  -- Serialise appends so the chain can never fork.
  PERFORM pg_advisory_xact_lock(74201337);
  SELECT * INTO last FROM app.audit_events ORDER BY seq DESC LIMIT 1;
  e.seq := coalesce(last.seq, 0) + 1;
  e.prev_hash := coalesce(last.hash, repeat('0', 64));
  e.occurred_at := clock_timestamp();
  -- The actor is the authenticated user of this transaction. An explicit actor is
  -- accepted only when there is none (e.g. a failed sign-in for a known account).
  e.actor_id := coalesce(app.current_user_id(), p_actor);
  e.action := p_action;
  e.outcome := p_outcome;
  e.resource_type := p_resource_type;
  e.resource_id := p_resource_id;
  e.organisation_id := p_organisation_id;
  e.ip_address := left(p_ip, 64);
  e.metadata := p_metadata;
  e.hash := app.audit_hash(e.prev_hash, e);
  INSERT INTO app.audit_events VALUES (e.*);
  RETURN e.seq;
END $$;

-- Recomputes every hash. Returns the first broken sequence number, or NULL if intact.
CREATE FUNCTION app.audit_verify(OUT checked bigint, OUT first_broken_seq bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
DECLARE
  e app.audit_events;
  prev text := repeat('0', 64);
  expected_seq bigint := 1;
BEGIN
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

CREATE FUNCTION app.audit_checkpoint() RETURNS app.audit_checkpoints
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE c app.audit_checkpoints;
BEGIN
  IF NOT app.is_super_admin() THEN RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501'; END IF;
  INSERT INTO app.audit_checkpoints (seq, hash)
    SELECT seq, hash FROM app.audit_events ORDER BY seq DESC LIMIT 1
    RETURNING * INTO c;
  RETURN c;
END $$;

-- Append-only, even for the owner (short of disabling the trigger, which itself
-- requires the owner credential that the running application never holds).
CREATE FUNCTION app.audit_block_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER audit_no_update_delete BEFORE UPDATE OR DELETE ON app.audit_events
  FOR EACH ROW EXECUTE FUNCTION app.audit_block_changes();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON app.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.audit_block_changes();

-- Reading: super admins see platform-wide events; organisation admins see their organisation's.
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON app.audit_events FOR SELECT
  USING (app.is_super_admin() OR (organisation_id IS NOT NULL AND app.is_org_admin(organisation_id)));
ALTER TABLE app.audit_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY checkpoints_select ON app.audit_checkpoints FOR SELECT USING (app.is_super_admin());

GRANT SELECT ON app.audit_events, app.audit_checkpoints TO magistrad_app;
REVOKE EXECUTE ON FUNCTION app.audit_payload(app.audit_events), app.audit_hash(text, app.audit_events),
  app.audit_block_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.audit_append(text, app.audit_outcome, text, text, uuid, text, jsonb, uuid),
  app.audit_verify(), app.audit_checkpoint() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.audit_append(text, app.audit_outcome, text, text, uuid, text, jsonb, uuid),
  app.audit_verify(), app.audit_checkpoint() TO magistrad_app;
