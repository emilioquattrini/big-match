# BIG MATCH — selection of 15 additional Impersonae

## Reviewed batch

The first public expansion keeps the original IDs 1–13 unchanged and appends these cards as stable IDs 14–28:

| ID | Card | Curatorial role in the expanded experience |
|---:|---|---|
| 14 | Angel | Care, protection and an aspirational register |
| 15 | Contradictor | Critical tension and productive disagreement |
| 16 | Democratic | Participation and shared decision-making |
| 17 | Dreamer | Imagination and speculative futures |
| 18 | Eco | Ecology and environmental responsibility |
| 19 | Energetic | Momentum, action and activation |
| 20 | Fluid | Adaptability and identities in transition |
| 21 | Frozen | Resistance, stasis and the limits of change |
| 22 | Idealist | Values, ambition and visions of a better future |
| 23 | Listener | Attention, empathy and inclusive practice |
| 24 | Mediator | Negotiation across positions and disciplines |
| 25 | Progressive | Evolution, experimentation and forward movement |
| 26 | Scientist | Evidence, method and technical inquiry |
| 27 | Sociable | Community, exchange and collective experience |
| 28 | Warrior | Courage, conflict and determined agency |

The selection deliberately balances constructive and critical attitudes. It expands BIG MATCH beyond a uniformly optimistic future: care is paired with conflict, participation with resistance, imagination with evidence, and social connection with individual agency.

## Artwork and processing

Source folder: `1KBt5TOzPVqOKMsvC98hazNug50kqsau1`.

Each selected source is an original single-card PDF supplied by the project. The import records the Drive file ID and SHA-256 checksum, renders the first page, centre-crops only the outer page proportion to the app's established 432 × 640 card frame, and creates an optimised progressive JPEG. No colours, typography or internal artwork elements are redrawn.

The source metadata is versioned in `catalog/impersonae-drive-selection-2026-10-16.json`. Final assets are stored under `public/cards/`, and the public manifest remains append-only under `impersonae-v1`.

## Release order

1. Deploy the compatible frontend with all 28 manifest entries and assets.
2. Verify the production artifact and service-worker package.
3. Apply the reviewed append-only database migration.
4. Confirm that the open event exposes IDs 1–28 while retaining every existing participation.

This order prevents the backend from exposing a card ID that an older production bundle cannot render.
