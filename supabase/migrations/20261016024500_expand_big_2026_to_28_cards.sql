-- One-time append-only expansion of the live BIG 2026 catalogue from 13 to 28 cards.
-- Frontend assets/manifest are deployed before this migration. Existing responses are untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $validate$
DECLARE
  e big_match.events;
  v_enabled integer;
BEGIN
  SELECT * INTO e FROM big_match.events WHERE slug='big-2026' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BM_CATALOG_EVENT_MISSING'; END IF;
  IF e.status <> 'open' OR e.archived_at IS NOT NULL OR e.deck_version <> 'impersonae-v1' OR NOT e.collection_ready THEN
    RAISE EXCEPTION 'BM_LIVE_EXPANSION_STATE_INVALID';
  END IF;
  SELECT count(*) INTO v_enabled FROM big_match.event_cards
  WHERE event_id=e.id AND enabled;
  IF v_enabled <> 13 OR EXISTS (
    SELECT 1 FROM big_match.event_cards WHERE event_id=e.id AND card_id NOT BETWEEN 1 AND 13
  ) THEN
    RAISE EXCEPTION 'BM_LIVE_EXPANSION_UNEXPECTED_MEMBERSHIP';
  END IF;
END;
$validate$;

CREATE TEMP TABLE bm_new_cards(
  id integer PRIMARY KEY, slug text, name text, image text, ordinal integer
) ON COMMIT DROP;

INSERT INTO bm_new_cards(id,slug,name,image,ordinal) VALUES
  (14,'angel','Angel','cards/angel.jpg',14),
  (15,'contradictor','Contradictor','cards/contradictor.jpg',15),
  (16,'democratic','Democratic','cards/democratic.jpg',16),
  (17,'dreamer','Dreamer','cards/dreamer.jpg',17),
  (18,'eco','Eco','cards/eco.jpg',18),
  (19,'energetic','Energetic','cards/energetic.jpg',19),
  (20,'fluid','Fluid','cards/fluid.jpg',20),
  (21,'frozen','Frozen','cards/frozen.jpg',21),
  (22,'idealist','Idealist','cards/idealist.jpg',22),
  (23,'listener','Listener','cards/listener.jpg',23),
  (24,'mediator','Mediator','cards/mediator.jpg',24),
  (25,'progressive','Progressive','cards/progressive.jpg',25),
  (26,'scientist','Scientist','cards/scientist.jpg',26),
  (27,'sociable','Sociable','cards/sociable.jpg',27),
  (28,'warrior','Warrior','cards/warrior.jpg',28);

DO $identity$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM bm_new_cards n
    JOIN big_match.cards c
      ON c.deck_version='impersonae-v1' AND (c.id=n.id OR c.slug=n.slug)
    WHERE c.id IS DISTINCT FROM n.id OR c.slug IS DISTINCT FROM n.slug
       OR c.name IS DISTINCT FROM n.name OR c.image IS DISTINCT FROM n.image
       OR c.ordinal IS DISTINCT FROM n.ordinal
  ) THEN
    RAISE EXCEPTION 'BM_CATALOG_IDENTITY_CONFLICT';
  END IF;
END;
$identity$;

INSERT INTO big_match.cards(deck_version,id,slug,name,image,ordinal)
SELECT 'impersonae-v1',id,slug,name,image,ordinal FROM bm_new_cards
ON CONFLICT DO NOTHING;

-- The normal trigger deliberately freezes published membership. This administrative
-- migration disables only that one trigger for the brief append-only insertion.
ALTER TABLE big_match.event_cards DISABLE TRIGGER freeze_event_cards;

INSERT INTO big_match.event_cards(event_id,deck_version,card_id,enabled)
SELECT e.id,'impersonae-v1',n.id,true
FROM big_match.events e CROSS JOIN bm_new_cards n
WHERE e.slug='big-2026'
ON CONFLICT(event_id,card_id) DO NOTHING;

ALTER TABLE big_match.event_cards ENABLE TRIGGER freeze_event_cards;

DO $verify$
DECLARE
  e big_match.events;
  v_enabled integer;
BEGIN
  SELECT * INTO e FROM big_match.events WHERE slug='big-2026' FOR UPDATE;
  SELECT count(*) INTO v_enabled FROM big_match.event_cards WHERE event_id=e.id AND enabled;
  IF v_enabled <> 28 OR EXISTS (
    SELECT 1 FROM generate_series(1,28) g(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM big_match.event_cards ec
      WHERE ec.event_id=e.id AND ec.card_id=g.id AND ec.enabled
    )
  ) THEN
    RAISE EXCEPTION 'BM_LIVE_EXPANSION_VERIFY_FAILED';
  END IF;
  -- Invalidate /mind ETag/cache because cardCounts now includes 15 new zero-count nodes.
  UPDATE big_match.events SET data_revision=data_revision+1 WHERE id=e.id;
END;
$verify$;

COMMIT;
