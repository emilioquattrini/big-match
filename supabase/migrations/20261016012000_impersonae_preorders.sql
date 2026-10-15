-- Impersonae pre-orders from BIG MATCH results. Contact data stays separate from card choices.
BEGIN;

CREATE SCHEMA IF NOT EXISTS big_match_preorders;
REVOKE ALL ON SCHEMA big_match_preorders FROM PUBLIC, anon, authenticated;

CREATE TABLE big_match_preorders.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES big_match.events(id),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  name text CHECK (length(name) <= 120),
  quantity smallint NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10),
  country text CHECK (length(country) <= 80),
  privacy_version text NOT NULL,
  purpose text NOT NULL DEFAULT 'impersonae-preorder' CHECK (purpose = 'impersonae-preorder'),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','contacted','confirmed','cancelled')),
  source text NOT NULL DEFAULT 'big-match-result' CHECK (source = 'big-match-result'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  UNIQUE (event_id,email),
  CHECK (email = lower(btrim(email))),
  CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);

CREATE TABLE big_match_preorders.receipts (
  event_id uuid NOT NULL REFERENCES big_match.events(id),
  request_id uuid NOT NULL,
  preorder_id uuid NOT NULL REFERENCES big_match_preorders.requests(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  ack jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, request_id)
);

ALTER TABLE big_match_preorders.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_match_preorders.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA big_match_preorders FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA big_match_preorders REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA big_match_preorders REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE INDEX big_match_preorders_status_created_idx
ON big_match_preorders.requests(event_id,status,created_at);

CREATE FUNCTION public.bm_preorder(
  p_slug text,p_email text,p_name text,p_quantity integer,p_country text,
  p_privacy_version text,p_request_id uuid,p_rate_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e big_match.events; r big_match_preorders.receipts;
  v_email text:=lower(btrim(p_email)); v_name text:=NULLIF(btrim(p_name),'');
  v_country text:=NULLIF(btrim(p_country),''); v_payload jsonb; v_id uuid; v_ack jsonb;
BEGIN
  IF p_request_id IS NULL OR p_email IS NULL OR length(v_email)>254 OR
     v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR
     length(COALESCE(v_name,''))>120 OR length(COALESCE(v_country,''))>80 OR
     p_quantity IS NULL OR p_quantity<1 OR p_quantity>10 OR
     p_rate_key IS NULL OR length(p_rate_key)<>64 OR p_rate_key !~ '^[a-f0-9]+$' THEN
    RAISE EXCEPTION 'BM_INVALID_REQUEST' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO e FROM big_match.events WHERE slug=p_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BM_NOT_FOUND' USING ERRCODE='P0001'; END IF;

  v_payload:=jsonb_build_object(
    'email',v_email,'name',v_name,'quantity',p_quantity,'country',v_country,'privacyVersion',p_privacy_version
  );

  SELECT * INTO r FROM big_match_preorders.receipts WHERE event_id=e.id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.payload<>v_payload THEN RAISE EXCEPTION 'BM_IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001'; END IF;
    RETURN r.ack;
  END IF;

  -- contact_enabled is the existing commercial-form gate; BIG MATCH now uses it for pre-orders.
  IF NOT e.contact_enabled OR NOT e.collection_ready OR e.status<>'open' OR e.archived_at IS NOT NULL OR
     clock_timestamp()<e.starts_at OR clock_timestamp()>=e.ends_at THEN
    RAISE EXCEPTION 'BM_PREORDER_DISABLED' USING ERRCODE='P0001';
  END IF;
  IF p_privacy_version IS DISTINCT FROM e.privacy_version THEN
    RAISE EXCEPTION 'BM_PRIVACY_CHANGED' USING ERRCODE='P0001';
  END IF;

  PERFORM big_match.charge('preorders-ip',p_rate_key,10,60);
  PERFORM big_match.charge('preorders-global',e.id::text,1000,3600);

  INSERT INTO big_match_preorders.requests(event_id,email,name,quantity,country,privacy_version)
  VALUES(e.id,v_email,v_name,p_quantity,v_country,e.privacy_version)
  ON CONFLICT(event_id,email) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM big_match_preorders.requests WHERE event_id=e.id AND email=v_email;
  END IF;

  v_ack:=jsonb_build_object('saved',true,'requestId',p_request_id);
  INSERT INTO big_match_preorders.receipts(event_id,request_id,preorder_id,payload,ack)
  VALUES(e.id,p_request_id,v_id,v_payload,v_ack);
  RETURN v_ack;
END;
$$;

CREATE FUNCTION public.bm_preorder_cleanup(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM big_match_preorders.requests WHERE expires_at<=p_now;
  GET DIAGNOSTICS v_deleted=ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bm_preorder(text,text,text,integer,text,text,uuid,text),
  public.bm_preorder_cleanup(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bm_preorder(text,text,text,integer,text,text,uuid,text),
  public.bm_preorder_cleanup(timestamptz) TO service_role;

-- The hosted hourly schedule is installed separately by supabase/ops/install-preorder-retention.sql.
-- Keeping it out of this portable migration lets local/PGlite tests execute the application schema.

-- The event-specific commercial gate is enabled separately when the final privacy notice
-- and collection_ready/status=open are approved. Do not mutate a draft event here.

COMMIT;
