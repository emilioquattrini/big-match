-- Dedicated event gate for Impersonae pre-orders.
-- Keeps the legacy catalogue/contact endpoint disabled and independent.
BEGIN;

ALTER TABLE big_match.events
  ADD COLUMN IF NOT EXISTS preorder_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE big_match.events
  DROP CONSTRAINT IF EXISTS events_preorder_ready_check;
ALTER TABLE big_match.events
  ADD CONSTRAINT events_preorder_ready_check CHECK (NOT preorder_enabled OR collection_ready);

CREATE OR REPLACE FUNCTION public.bm_event(p_slug text) RETURNS jsonb
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
    'preorderEnabled', e.preorder_enabled AND e.collection_ready AND e.status = 'open'
      AND e.archived_at IS NULL AND clock_timestamp() >= e.starts_at
      AND clock_timestamp() < e.ends_at,
    'privacyVersion', e.privacy_version, 'privacyNotice', e.privacy_notice,
    'controllerName', e.controller_name, 'controllerEmail', e.controller_email,
    'retentionDays', e.retention_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bm_preorder(
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

  SELECT * INTO r FROM big_match_preorders.receipts
  WHERE event_id=e.id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.payload<>v_payload THEN RAISE EXCEPTION 'BM_IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001'; END IF;
    RETURN r.ack;
  END IF;

  IF NOT e.preorder_enabled OR NOT e.collection_ready OR e.status<>'open'
     OR e.archived_at IS NOT NULL OR clock_timestamp()<e.starts_at OR clock_timestamp()>=e.ends_at THEN
    RAISE EXCEPTION 'BM_PREORDER_DISABLED' USING ERRCODE='P0001';
  END IF;
  IF p_privacy_version IS DISTINCT FROM e.privacy_version THEN
    RAISE EXCEPTION 'BM_PRIVACY_CHANGED' USING ERRCODE='P0001';
  END IF;

  PERFORM big_match.charge('preorders-ip',p_rate_key,10,60);
  PERFORM big_match.charge('preorders-global',e.id::text,1000,3600);

  INSERT INTO big_match_preorders.requests(event_id,email,name,quantity,country,privacy_version)
  VALUES(e.id,v_email,v_name,p_quantity,v_country,e.privacy_version)
  ON CONFLICT(event_id,email) DO UPDATE SET
    name=COALESCE(EXCLUDED.name,big_match_preorders.requests.name),
    quantity=EXCLUDED.quantity,
    country=COALESCE(EXCLUDED.country,big_match_preorders.requests.country),
    privacy_version=EXCLUDED.privacy_version,
    status=CASE WHEN big_match_preorders.requests.status='confirmed' THEN 'confirmed' ELSE 'requested' END,
    expires_at=greatest(big_match_preorders.requests.expires_at,clock_timestamp()+interval '180 days')
  RETURNING id INTO v_id;

  v_ack:=jsonb_build_object('saved',true,'requestId',p_request_id);
  INSERT INTO big_match_preorders.receipts(event_id,request_id,preorder_id,payload,ack)
  VALUES(e.id,p_request_id,v_id,v_payload,v_ack);
  RETURN v_ack;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bm_event(text),
  public.bm_preorder(text,text,text,integer,text,text,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bm_event(text),
  public.bm_preorder(text,text,text,integer,text,text,uuid,text)
  TO service_role;

-- Explicitly keep the obsolete catalogue endpoint disabled for BIG.
UPDATE big_match.events
SET contact_enabled=false
WHERE slug='big-2026';

COMMIT;
