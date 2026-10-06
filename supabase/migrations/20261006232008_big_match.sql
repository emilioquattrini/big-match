-- BIG MATCH v1. All application data is private; only Edge may execute public RPCs.
-- Supabase provides auth.users, anon, authenticated and service_role.
BEGIN;

CREATE SCHEMA IF NOT EXISTS big_match;
CREATE SCHEMA IF NOT EXISTS big_match_contacts;
REVOKE ALL ON SCHEMA big_match, big_match_contacts FROM PUBLIC, anon, authenticated;

CREATE TABLE big_match.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 500),
  deck_version text NOT NULL CHECK (deck_version ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  contact_enabled boolean NOT NULL DEFAULT false,
  collection_ready boolean NOT NULL DEFAULT false,
  privacy_version text NOT NULL DEFAULT '',
  privacy_notice text NOT NULL DEFAULT '',
  controller_name text NOT NULL DEFAULT '',
  controller_email text NOT NULL DEFAULT '',
  retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  data_revision bigint NOT NULL DEFAULT 0 CHECK (data_revision >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, deck_version),
  CHECK (ends_at > starts_at),
  CHECK (NOT collection_ready OR (
    length(btrim(privacy_version)) > 0 AND length(btrim(privacy_notice)) >= 40
    AND length(btrim(controller_name)) >= 2
    AND controller_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  )),
  CHECK (status <> 'open' OR collection_ready),
  CHECK (NOT contact_enabled OR collection_ready)
);

CREATE TABLE big_match.cards (
  deck_version text NOT NULL,
  id integer NOT NULL CHECK (id BETWEEN 1 AND 1000),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  image text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal = id),
  PRIMARY KEY (deck_version, id),
  UNIQUE (deck_version, slug),
  UNIQUE (deck_version, ordinal)
);

CREATE TABLE big_match.event_cards (
  event_id uuid NOT NULL,
  deck_version text NOT NULL,
  card_id integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (event_id, card_id),
  FOREIGN KEY (event_id, deck_version) REFERENCES big_match.events(id, deck_version),
  FOREIGN KEY (deck_version, card_id) REFERENCES big_match.cards(deck_version, id)
);

-- There is one mobile session/actor per Auth UID and event.
-- A tombstone survives erasure until retention, so a late PUT cannot resurrect a response.
CREATE TABLE big_match.actors (
  event_id uuid NOT NULL REFERENCES big_match.events(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (event_id, actor_id)
);

CREATE TABLE big_match.auth_subjects (
  actor_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE big_match.participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  card_a integer NOT NULL,
  card_b integer NOT NULL,
  card_c integer NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  last_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, actor_id),
  FOREIGN KEY (event_id, actor_id) REFERENCES big_match.actors(event_id, actor_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id, card_a) REFERENCES big_match.event_cards(event_id, card_id),
  FOREIGN KEY (event_id, card_b) REFERENCES big_match.event_cards(event_id, card_id),
  FOREIGN KEY (event_id, card_c) REFERENCES big_match.event_cards(event_id, card_id),
  CHECK (card_a < card_b AND card_b < card_c)
);
CREATE INDEX participations_trio ON big_match.participations(event_id, card_a, card_b, card_c);

CREATE TABLE big_match.receipts (
  event_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('put', 'delete')),
  payload jsonb NOT NULL,
  ack jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, actor_id, request_id),
  FOREIGN KEY (event_id, actor_id) REFERENCES big_match.actors(event_id, actor_id) ON DELETE CASCADE
);

CREATE TABLE big_match.archived_mind (
  event_id uuid PRIMARY KEY REFERENCES big_match.events(id),
  snapshot jsonb NOT NULL,
  archived_at timestamptz NOT NULL
);

CREATE TABLE big_match.rate_limits (
  scope text NOT NULL,
  subject text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY (scope, subject, window_start)
);

-- No participation/actor foreign key or tracking identifier exists in this schema.
CREATE TABLE big_match_contacts.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES big_match.events(id),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  name text CHECK (length(name) <= 120),
  privacy_version text NOT NULL,
  purpose text NOT NULL DEFAULT 'catalogue' CHECK (purpose = 'catalogue'),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'fulfilled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  UNIQUE (event_id, email),
  CHECK (email = lower(btrim(email))),
  CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);
CREATE TABLE big_match_contacts.receipts (
  event_id uuid NOT NULL REFERENCES big_match.events(id),
  request_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES big_match_contacts.requests(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  ack jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, request_id)
);

-- Defense in depth: no client table policies or table grants are added.
ALTER TABLE big_match.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match.event_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match.actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match.auth_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match.participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match.archived_mind ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match_contacts.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match_contacts.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA big_match, big_match_contacts FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA big_match, big_match_contacts REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA big_match, big_match_contacts REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE FUNCTION big_match.bump_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE big_match.events SET data_revision = data_revision + 1
  WHERE id = COALESCE(NEW.event_id, OLD.event_id) AND archived_at IS NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER participation_revision AFTER INSERT OR UPDATE OR DELETE
ON big_match.participations FOR EACH ROW EXECUTE FUNCTION big_match.bump_revision();

CREATE FUNCTION big_match.freeze_catalogue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM big_match.events WHERE id IN (NEW.event_id, OLD.event_id) AND status <> 'draft') THEN
    RAISE EXCEPTION 'BM_CATALOGUE_FROZEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER freeze_event_cards BEFORE INSERT OR UPDATE OR DELETE
ON big_match.event_cards FOR EACH ROW EXECUTE FUNCTION big_match.freeze_catalogue();

CREATE FUNCTION big_match.freeze_used_card() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM big_match.event_cards ec JOIN big_match.events e ON e.id=ec.event_id
    WHERE ec.deck_version=OLD.deck_version AND ec.card_id=OLD.id AND e.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'BM_CATALOGUE_FROZEN' USING ERRCODE='P0001';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;
CREATE TRIGGER freeze_used_card BEFORE UPDATE OR DELETE ON big_match.cards
FOR EACH ROW EXECUTE FUNCTION big_match.freeze_used_card();

CREATE FUNCTION big_match.guard_event_open() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'open' AND (
    NEW.archived_at IS NOT NULL OR
    (SELECT count(*) FROM big_match.event_cards WHERE event_id = NEW.id AND enabled) < 3
  ) THEN
    RAISE EXCEPTION 'BM_CONFIG_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND
     (NEW.deck_version <> OLD.deck_version OR NEW.slug <> OLD.slug OR NEW.status = 'draft') THEN
    RAISE EXCEPTION 'BM_CATALOGUE_FROZEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_event_open BEFORE INSERT OR UPDATE ON big_match.events
FOR EACH ROW EXECUTE FUNCTION big_match.guard_event_open();

CREATE FUNCTION big_match.charge(p_scope text, p_subject text, p_limit integer, p_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_hits integer;
BEGIN
  INSERT INTO big_match.rate_limits(scope, subject, window_start, hits)
  VALUES (
    p_scope, p_subject,
    to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_seconds) * p_seconds), 1
  )
  ON CONFLICT (scope, subject, window_start)
  DO UPDATE SET hits = big_match.rate_limits.hits + 1
  RETURNING hits INTO v_hits;
  IF v_hits > p_limit THEN
    RAISE EXCEPTION 'BM_RATE_LIMIT' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE FUNCTION big_match.ack(p big_match.participations, p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'participationId', p.id, 'revision', p.revision,
    'requestId', COALESCE(p_request_id, p.last_request_id),
    'cardIds', jsonb_build_array(p.card_a, p.card_b, p.card_c),
    'updatedAt', p.updated_at
  );
$$;

-- This one SELECT supplies a coherent MVCC snapshot for all counters and own response.
-- It never subtracts self from a pre-write cached aggregate.
CREATE FUNCTION big_match.read_result(p_event_id uuid, p_actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH e AS MATERIALIZED (
    SELECT * FROM big_match.events WHERE id = p_event_id
  ), entries AS MATERIALIZED (
    SELECT p.*, ARRAY[p.card_a, p.card_b, p.card_c] AS ids
    FROM big_match.participations p WHERE p.event_id = p_event_id
  ), own AS (
    SELECT p FROM big_match.participations p
    WHERE p.event_id = p_event_id AND p.actor_id = p_actor_id
  ), card_values AS (
    SELECT n.card, count(*) AS n
    FROM entries p CROSS JOIN LATERAL unnest(p.ids) n(card) GROUP BY n.card
  ), card_counts AS (
    SELECT COALESCE(jsonb_object_agg(ec.card_id::text, COALESCE(v.n, 0)), '{}'::jsonb) AS value
    FROM big_match.event_cards ec LEFT JOIN card_values v ON v.card = ec.card_id
    WHERE ec.event_id = p_event_id AND ec.enabled
  ), pair_values AS (
    SELECT pair.a, pair.b, count(*) AS n FROM entries p
    CROSS JOIN LATERAL (VALUES (p.card_a,p.card_b),(p.card_a,p.card_c),(p.card_b,p.card_c)) pair(a,b)
    GROUP BY pair.a, pair.b
  ), pair_counts AS (
    SELECT COALESCE(jsonb_object_agg(a::text || '-' || b::text, n), '{}'::jsonb) AS value
    FROM pair_values
  ), live_mind AS (
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM entries),
      'cardCounts', (SELECT value FROM card_counts),
      'pairCounts', (SELECT value FROM pair_counts),
      'version', e.data_revision, 'asOf', statement_timestamp()
    ) AS value FROM e
  ), matches AS (
    SELECT
      count(*) FILTER (WHERE overlap.n = 3) AS exact,
      count(*) FILTER (WHERE overlap.n = 2) AS close
    FROM entries p CROSS JOIN own o
    CROSS JOIN LATERAL (
      SELECT count(*) AS n FROM unnest(p.ids) x(card)
      WHERE x.card = ANY(ARRAY[(o.p).card_a, (o.p).card_b, (o.p).card_c])
    ) overlap
    WHERE p.id <> (o.p).id
  )
  SELECT jsonb_build_object(
    'participation', (SELECT big_match.ack(o.p) FROM own o),
    'matches', CASE WHEN EXISTS(SELECT 1 FROM own) THEN
      (SELECT jsonb_build_object('exact', exact, 'close', close) FROM matches) ELSE NULL END,
    'mind', COALESCE(
      (SELECT snapshot FROM big_match.archived_mind WHERE event_id = p_event_id),
      (SELECT value FROM live_mind)
    )
  );
$$;

CREATE FUNCTION public.bm_event(p_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE e big_match.events;
BEGIN
  SELECT * INTO e FROM big_match.events WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'BM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object(
    'slug', e.slug, 'title', e.title, 'question', e.question,
    'deckVersion', e.deck_version,
    'status', CASE
      WHEN e.status = 'open' AND clock_timestamp() < e.starts_at THEN 'draft'
      WHEN e.status = 'open' AND clock_timestamp() >= e.ends_at THEN 'closed'
      ELSE e.status END,
    'activeCardIds', (SELECT COALESCE(jsonb_agg(card_id ORDER BY card_id), '[]'::jsonb)
      FROM big_match.event_cards WHERE event_id = e.id AND enabled),
    'contactEnabled', e.contact_enabled AND e.collection_ready AND e.status <> 'draft'
      AND e.archived_at IS NULL AND clock_timestamp() >= e.starts_at
      AND clock_timestamp() < e.ends_at+make_interval(days=>e.retention_days),
    'privacyVersion', e.privacy_version, 'privacyNotice', e.privacy_notice,
    'controllerName', e.controller_name, 'controllerEmail', e.controller_email,
    'retentionDays', e.retention_days
  );
END;
$$;

CREATE FUNCTION public.bm_mind(p_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM big_match.events WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'BM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  RETURN big_match.read_result(v_id, NULL)->'mind';
END;
$$;

CREATE FUNCTION public.bm_me(p_slug text, p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e big_match.events;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'BM_AUTH_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO e FROM big_match.events WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'BM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM big_match.actors WHERE event_id=e.id AND actor_id=p_actor_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'BM_DELETED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM big_match.charge('own-read', p_actor_id::text, 120, 60);
  INSERT INTO big_match.auth_subjects(actor_id, expires_at)
  VALUES (p_actor_id, e.ends_at + make_interval(days => e.retention_days))
  ON CONFLICT(actor_id) DO UPDATE SET expires_at = greatest(big_match.auth_subjects.expires_at, EXCLUDED.expires_at);
  RETURN big_match.read_result(e.id, p_actor_id);
END;
$$;

CREATE FUNCTION public.bm_put(
  p_slug text, p_actor_id uuid, p_card_ids integer[], p_request_id uuid, p_expected_revision integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e big_match.events; a big_match.actors; p big_match.participations;
  receipt big_match.receipts; ids integer[]; payload jsonb; response jsonb;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'BM_AUTH_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 OR
     cardinality(p_card_ids) IS DISTINCT FROM 3 OR array_position(p_card_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'BM_INVALID_REQUEST' USING ERRCODE='P0001';
  END IF;
  SELECT array_agg(n ORDER BY n) INTO ids FROM unnest(p_card_ids) n;
  IF ids[1] >= ids[2] OR ids[2] >= ids[3] THEN
    RAISE EXCEPTION 'BM_INVALID_CARDS' USING ERRCODE='P0001';
  END IF;
  payload := jsonb_build_object('cardIds',to_jsonb(ids),'expectedRevision',p_expected_revision);
  -- Event lock serializes short mutations and cleanup, avoiding a lock-upgrade deadlock.
  SELECT * INTO e FROM big_match.events WHERE slug=p_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BM_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  SELECT * INTO a FROM big_match.actors WHERE event_id=e.id AND actor_id=p_actor_id;
  IF a.deleted_at IS NOT NULL OR e.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'BM_DELETED' USING ERRCODE='P0001';
  END IF;
  -- A committed retry is resolved BEFORE event/revision/rate checks.
  SELECT * INTO receipt FROM big_match.receipts
  WHERE event_id=e.id AND actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF receipt.operation <> 'put' OR receipt.payload <> payload THEN
      RAISE EXCEPTION 'BM_IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001';
    END IF;
    RETURN receipt.ack;
  END IF;
  IF e.status <> 'open' OR NOT e.collection_ready OR clock_timestamp() < e.starts_at OR clock_timestamp() >= e.ends_at THEN
    RAISE EXCEPTION 'BM_EVENT_CLOSED' USING ERRCODE='P0001';
  END IF;
  IF (SELECT count(*) FROM big_match.event_cards WHERE event_id=e.id AND enabled AND card_id=ANY(ids)) <> 3 THEN
    RAISE EXCEPTION 'BM_INVALID_CARDS' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO p FROM big_match.participations WHERE event_id=e.id AND actor_id=p_actor_id;
  IF COALESCE(p.revision,0) <> p_expected_revision THEN
    RAISE EXCEPTION 'BM_REVISION_CONFLICT' USING ERRCODE='P0001';
  END IF;
  PERFORM big_match.charge('writes', p_actor_id::text, 10, 60);
  PERFORM big_match.charge('event-writes', e.id::text, 10000, 3600);
  INSERT INTO big_match.actors(event_id,actor_id) VALUES(e.id,p_actor_id) ON CONFLICT DO NOTHING;
  INSERT INTO big_match.auth_subjects(actor_id,expires_at)
  VALUES(p_actor_id,e.ends_at+make_interval(days=>e.retention_days))
  ON CONFLICT(actor_id) DO UPDATE SET expires_at=greatest(big_match.auth_subjects.expires_at,EXCLUDED.expires_at);
  IF p.id IS NULL THEN
    INSERT INTO big_match.participations(event_id,actor_id,card_a,card_b,card_c,last_request_id)
    VALUES(e.id,p_actor_id,ids[1],ids[2],ids[3],p_request_id) RETURNING * INTO p;
  ELSIF ARRAY[p.card_a,p.card_b,p.card_c] <> ids THEN
    UPDATE big_match.participations SET card_a=ids[1],card_b=ids[2],card_c=ids[3],
      revision=revision+1,last_request_id=p_request_id,updated_at=clock_timestamp()
    WHERE id=p.id RETURNING * INTO p;
  END IF;
  -- Same cards with a fresh key is a semantic no-op; the new receipt echoes its own requestId.
  response := big_match.ack(p,p_request_id);
  INSERT INTO big_match.receipts(event_id,actor_id,request_id,operation,payload,ack)
  VALUES(e.id,p_actor_id,p_request_id,'put',payload,response);
  RETURN response;
END;
$$;

CREATE FUNCTION public.bm_delete(p_slug text,p_actor_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e big_match.events; r big_match.receipts; v_deleted timestamptz;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'BM_AUTH_REQUIRED' USING ERRCODE='P0001'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'BM_INVALID_REQUEST' USING ERRCODE='P0001'; END IF;
  SELECT * INTO e FROM big_match.events WHERE slug=p_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BM_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  SELECT * INTO r FROM big_match.receipts
  WHERE event_id=e.id AND actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.operation <> 'delete' THEN RAISE EXCEPTION 'BM_IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001'; END IF;
    RETURN r.ack;
  END IF;
  SELECT deleted_at INTO v_deleted FROM big_match.actors WHERE event_id=e.id AND actor_id=p_actor_id;
  IF v_deleted IS NOT NULL OR e.archived_at IS NOT NULL THEN RETURN '{"deleted":true}'::jsonb; END IF;
  PERFORM big_match.charge('deletes',p_actor_id::text,10,60);
  INSERT INTO big_match.actors(event_id,actor_id,deleted_at)
  VALUES(e.id,p_actor_id,clock_timestamp())
  ON CONFLICT(event_id,actor_id) DO UPDATE SET deleted_at=EXCLUDED.deleted_at;
  INSERT INTO big_match.auth_subjects(actor_id,expires_at)
  VALUES(p_actor_id,e.ends_at+make_interval(days=>e.retention_days))
  ON CONFLICT(actor_id) DO UPDATE SET expires_at=greatest(big_match.auth_subjects.expires_at,EXCLUDED.expires_at);
  DELETE FROM big_match.participations WHERE event_id=e.id AND actor_id=p_actor_id;
  -- Erasure includes historical card payloads. Keep only a deletion tombstone and ack.
  DELETE FROM big_match.receipts WHERE event_id=e.id AND actor_id=p_actor_id;
  INSERT INTO big_match.receipts(event_id,actor_id,request_id,operation,payload,ack)
  VALUES(e.id,p_actor_id,p_request_id,'delete','{}','{"deleted":true}');
  RETURN '{"deleted":true}'::jsonb;
END;
$$;

CREATE FUNCTION public.bm_contact(
  p_slug text,p_email text,p_name text,p_privacy_version text,p_request_id uuid,p_rate_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e big_match.events; r big_match_contacts.receipts;
  v_email text:=lower(btrim(p_email)); v_name text:=NULLIF(btrim(p_name),'');
  v_payload jsonb; v_id uuid; v_ack jsonb;
BEGIN
  IF p_request_id IS NULL OR p_email IS NULL OR length(v_email)>254 OR
     v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR
     length(COALESCE(v_name,''))>120 OR p_rate_key IS NULL OR length(p_rate_key)<>64 OR
     p_rate_key !~ '^[a-f0-9]+$' THEN
    RAISE EXCEPTION 'BM_INVALID_REQUEST' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO e FROM big_match.events WHERE slug=p_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BM_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  v_payload:=jsonb_build_object('email',v_email,'name',v_name,'privacyVersion',p_privacy_version);
  SELECT * INTO r FROM big_match_contacts.receipts WHERE event_id=e.id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.payload<>v_payload THEN RAISE EXCEPTION 'BM_IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001'; END IF;
    RETURN r.ack;
  END IF;
  IF NOT e.contact_enabled OR NOT e.collection_ready OR e.status='draft' THEN
    RAISE EXCEPTION 'BM_CONTACT_DISABLED' USING ERRCODE='P0001';
  END IF;
  IF e.archived_at IS NOT NULL OR clock_timestamp() < e.starts_at OR clock_timestamp() >= e.ends_at+make_interval(days=>e.retention_days) THEN
    RAISE EXCEPTION 'BM_EVENT_CLOSED' USING ERRCODE='P0001';
  END IF;
  IF p_privacy_version IS DISTINCT FROM e.privacy_version THEN
    RAISE EXCEPTION 'BM_PRIVACY_CHANGED' USING ERRCODE='P0001';
  END IF;
  PERFORM big_match.charge('contacts-ip',p_rate_key,10,60);
  PERFORM big_match.charge('contacts-global',e.id::text,1000,3600);
  INSERT INTO big_match_contacts.requests(event_id,email,name,privacy_version)
  VALUES(e.id,v_email,v_name,e.privacy_version)
  ON CONFLICT(event_id,email) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM big_match_contacts.requests WHERE event_id=e.id AND email=v_email;
  END IF;
  v_ack:=jsonb_build_object('saved',true,'requestId',p_request_id);
  INSERT INTO big_match_contacts.receipts(event_id,request_id,contact_id,payload,ack)
  VALUES(e.id,p_request_id,v_id,v_payload,v_ack);
  RETURN v_ack;
END;
$$;

-- Public edge reads use bounded atomic request windows; a hash is supplied only by Edge.
CREATE FUNCTION public.bm_read_guard(p_rate_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_rate_key IS NULL OR length(p_rate_key)<>64 OR p_rate_key !~ '^[a-f0-9]+$' THEN
    RAISE EXCEPTION 'BM_INVALID_REQUEST' USING ERRCODE='P0001';
  END IF;
  PERFORM big_match.charge('public-read',p_rate_key,600,60);
  PERFORM big_match.charge('public-read-global','all',12000,60);
END;
$$;

-- Administrative scheduled retention. It is deliberately NOT routed by the public Edge Function.
-- The project should be dedicated to BIG MATCH; only Auth UIDs touched by this app are eligible.
CREATE FUNCTION public.bm_cleanup(p_now timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e big_match.events; v_snapshot jsonb; v_events integer:=0; v_contacts integer; v_auth integer;
BEGIN
  FOR e IN SELECT * FROM big_match.events
    WHERE archived_at IS NULL AND ends_at+make_interval(days=>retention_days)<=p_now
    ORDER BY id FOR UPDATE
  LOOP
    v_snapshot:=big_match.read_result(e.id,NULL)->'mind';
    INSERT INTO big_match.archived_mind(event_id,snapshot,archived_at) VALUES(e.id,v_snapshot,p_now);
    UPDATE big_match.events SET status='closed',contact_enabled=false,collection_ready=false,archived_at=p_now WHERE id=e.id;
    DELETE FROM big_match.actors WHERE event_id=e.id;
    v_events:=v_events+1;
  END LOOP;
  DELETE FROM big_match_contacts.requests c USING big_match.events contact_event
  WHERE c.event_id=contact_event.id AND c.created_at+make_interval(days=>contact_event.retention_days)<=p_now;
  GET DIAGNOSTICS v_contacts=ROW_COUNT;
  DELETE FROM big_match.rate_limits WHERE window_start < p_now-interval '2 days';
  DELETE FROM auth.users u USING big_match.auth_subjects s
  WHERE u.id=s.actor_id AND u.is_anonymous IS TRUE AND s.expires_at<=p_now
    AND NOT EXISTS(SELECT 1 FROM big_match.actors a WHERE a.actor_id=u.id);
  GET DIAGNOSTICS v_auth=ROW_COUNT;
  -- Remove expired app identifiers for permanent users too, without deleting their Auth account.
  DELETE FROM big_match.auth_subjects s WHERE s.expires_at<=p_now
    AND NOT EXISTS(SELECT 1 FROM big_match.actors a WHERE a.actor_id=s.actor_id);
  RETURN jsonb_build_object('eventsArchived',v_events,'contactsDeleted',v_contacts,'anonymousUsersDeleted',v_auth);
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA big_match FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bm_event(text), public.bm_mind(text),
  public.bm_me(text,uuid), public.bm_put(text,uuid,integer[],uuid,integer),
  public.bm_delete(text,uuid,uuid), public.bm_contact(text,text,text,text,uuid,text),
  public.bm_read_guard(text), public.bm_cleanup(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bm_event(text), public.bm_mind(text),
  public.bm_me(text,uuid), public.bm_put(text,uuid,integer[],uuid,integer),
  public.bm_delete(text,uuid,uuid), public.bm_contact(text,text,text,text,uuid,text),
  public.bm_read_guard(text), public.bm_cleanup(timestamptz) TO service_role;
COMMENT ON SCHEMA big_match IS 'Private event responses. No direct browser grants; Edge verifies Supabase Auth.';
COMMENT ON SCHEMA big_match_contacts IS 'Catalogue requests only; never join to individual card selections.';
COMMIT;
