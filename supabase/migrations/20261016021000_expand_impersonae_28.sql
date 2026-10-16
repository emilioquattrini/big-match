-- Append the reviewed 15-card Impersonae batch without changing existing responses.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

INSERT INTO big_match.cards(deck_version,id,slug,name,image,ordinal)
VALUES
    ('impersonae-v1',14,'angel','Angel','cards/angel.jpg',14),
    ('impersonae-v1',15,'contradictor','Contradictor','cards/contradictor.jpg',15),
    ('impersonae-v1',16,'democratic','Democratic','cards/democratic.jpg',16),
    ('impersonae-v1',17,'dreamer','Dreamer','cards/dreamer.jpg',17),
    ('impersonae-v1',18,'eco','Eco','cards/eco.jpg',18),
    ('impersonae-v1',19,'energetic','Energetic','cards/energetic.jpg',19),
    ('impersonae-v1',20,'fluid','Fluid','cards/fluid.jpg',20),
    ('impersonae-v1',21,'frozen','Frozen','cards/frozen.jpg',21),
    ('impersonae-v1',22,'idealist','Idealist','cards/idealist.jpg',22),
    ('impersonae-v1',23,'listener','Listener','cards/listener.jpg',23),
    ('impersonae-v1',24,'mediator','Mediator','cards/mediator.jpg',24),
    ('impersonae-v1',25,'progressive','Progressive','cards/progressive.jpg',25),
    ('impersonae-v1',26,'scientist','Scientist','cards/scientist.jpg',26),
    ('impersonae-v1',27,'sociable','Sociable','cards/sociable.jpg',27),
    ('impersonae-v1',28,'warrior','Warrior','cards/warrior.jpg',28)
ON CONFLICT DO NOTHING;

DO $verify_card_definitions$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM big_match.cards c
  JOIN (VALUES
    ('impersonae-v1',14,'angel','Angel','cards/angel.jpg',14),
    ('impersonae-v1',15,'contradictor','Contradictor','cards/contradictor.jpg',15),
    ('impersonae-v1',16,'democratic','Democratic','cards/democratic.jpg',16),
    ('impersonae-v1',17,'dreamer','Dreamer','cards/dreamer.jpg',17),
    ('impersonae-v1',18,'eco','Eco','cards/eco.jpg',18),
    ('impersonae-v1',19,'energetic','Energetic','cards/energetic.jpg',19),
    ('impersonae-v1',20,'fluid','Fluid','cards/fluid.jpg',20),
    ('impersonae-v1',21,'frozen','Frozen','cards/frozen.jpg',21),
    ('impersonae-v1',22,'idealist','Idealist','cards/idealist.jpg',22),
    ('impersonae-v1',23,'listener','Listener','cards/listener.jpg',23),
    ('impersonae-v1',24,'mediator','Mediator','cards/mediator.jpg',24),
    ('impersonae-v1',25,'progressive','Progressive','cards/progressive.jpg',25),
    ('impersonae-v1',26,'scientist','Scientist','cards/scientist.jpg',26),
    ('impersonae-v1',27,'sociable','Sociable','cards/sociable.jpg',27),
    ('impersonae-v1',28,'warrior','Warrior','cards/warrior.jpg',28)
  ) expected(deck_version,id,slug,name,image,ordinal)
    ON c.deck_version=expected.deck_version AND c.id=expected.id
   AND c.slug=expected.slug AND c.name=expected.name
   AND c.image=expected.image AND c.ordinal=expected.ordinal;
  IF v_count <> 15 THEN
    RAISE EXCEPTION 'BM_CATALOG_IDENTITY_CONFLICT' USING ERRCODE='P0001';
  END IF;
END;
$verify_card_definitions$;

DO $verify_published_event$
DECLARE
  e big_match.events;
  v_ids integer[];
  v_all_enabled boolean;
BEGIN
  SELECT * INTO e FROM big_match.events WHERE slug='big-2026' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF e.deck_version <> 'impersonae-v1' OR e.archived_at IS NOT NULL OR e.status NOT IN ('draft','open') THEN
    RAISE EXCEPTION 'BM_CATALOG_EVENT_STATE' USING ERRCODE='P0001';
  END IF;
  SELECT array_agg(card_id ORDER BY card_id), bool_and(enabled)
    INTO v_ids,v_all_enabled
  FROM big_match.event_cards WHERE event_id=e.id;
  IF v_ids NOT IN (ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13], ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28]) OR v_all_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'BM_CATALOG_UNEXPECTED_MEMBERSHIP' USING ERRCODE='P0001';
  END IF;
END;
$verify_published_event$;

-- The normal trigger deliberately freezes a published catalogue. This reviewed,
-- append-only migration is the sole controlled exception; the trigger is restored
-- inside the same transaction and any failure rolls the whole operation back.
ALTER TABLE big_match.event_cards DISABLE TRIGGER freeze_event_cards;

WITH inserted AS (
  INSERT INTO big_match.event_cards(event_id,deck_version,card_id,enabled)
  SELECT e.id,e.deck_version,new_card.id,true
  FROM big_match.events e
  CROSS JOIN (VALUES (14),(15),(16),(17),(18),(19),(20),(21),(22),(23),(24),(25),(26),(27),(28)) new_card(id)
  WHERE e.slug='big-2026' AND e.deck_version='impersonae-v1'
  ON CONFLICT(event_id,card_id) DO NOTHING
  RETURNING event_id
)
UPDATE big_match.events e
SET data_revision=e.data_revision+1
WHERE e.id IN (SELECT event_id FROM inserted);

ALTER TABLE big_match.event_cards ENABLE TRIGGER freeze_event_cards;

DO $verify_expansion$
DECLARE
  e big_match.events;
  v_ids integer[];
  v_all_enabled boolean;
BEGIN
  SELECT * INTO e FROM big_match.events WHERE slug='big-2026';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT array_agg(card_id ORDER BY card_id), bool_and(enabled)
    INTO v_ids,v_all_enabled
  FROM big_match.event_cards WHERE event_id=e.id;
  IF v_ids <> ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28] OR v_all_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'BM_CATALOG_EXPANSION_FAILED' USING ERRCODE='P0001';
  END IF;
END;
$verify_expansion$;

COMMIT;
