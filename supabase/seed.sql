-- Safe seed: original 13 cards and a DRAFT event. No example votes or contacts.
-- Re-running never resets an existing event or changes its catalogue.
BEGIN;
INSERT INTO big_match.cards(deck_version,id,slug,name,image,ordinal) VALUES
  ('impersonae-v1', 1, 'cyborg', 'Cyborg', 'cards/cyborg.jpg', 1),
  ('impersonae-v1', 2, 'diva', 'Diva', 'cards/diva.jpg', 2),
  ('impersonae-v1', 3, 'exotic', 'Exotic', 'cards/exotic.jpg', 3),
  ('impersonae-v1', 4, 'hypnotic', 'Hypnotic', 'cards/hypnotic.jpg', 4),
  ('impersonae-v1', 5, 'juggler', 'Juggler', 'cards/juggler.jpg', 5),
  ('impersonae-v1', 6, 'loyal', 'Loyal', 'cards/loyal.jpg', 6),
  ('impersonae-v1', 7, 'mother', 'Mother', 'cards/mother.jpg', 7),
  ('impersonae-v1', 8, 'nocturnal', 'Nocturnal', 'cards/nocturnal.jpg', 8),
  ('impersonae-v1', 9, 'nostalgia', 'Nostalgia', 'cards/nostalgia.jpg', 9),
  ('impersonae-v1', 10, 'oceanic', 'Oceanic', 'cards/oceanic.jpg', 10),
  ('impersonae-v1', 11, 'otherthinker', 'Otherthinker', 'cards/otherthinker.jpg', 11),
  ('impersonae-v1', 12, 'chimera', 'Chimera', 'cards/chimera.jpg', 12),
  ('impersonae-v1', 13, 'emotional', 'Emotional', 'cards/emotional.jpg', 13)
ON CONFLICT DO NOTHING;

INSERT INTO big_match.events(slug,title,question,deck_version,starts_at,ends_at)
VALUES (
  'big-2026','#BIG MATCH — Impersonae','What does the future of design look like?',
  'impersonae-v1','2026-10-22 00:00:00 Europe/Rome','2026-10-26 00:00:00 Europe/Rome'
)
ON CONFLICT(slug) DO NOTHING;

INSERT INTO big_match.event_cards(event_id,deck_version,card_id)
SELECT e.id,e.deck_version,c.id
FROM big_match.events e JOIN big_match.cards c ON c.deck_version=e.deck_version
WHERE e.slug='big-2026' AND e.status='draft' AND c.id BETWEEN 1 AND 13
ON CONFLICT DO NOTHING;
COMMIT;
