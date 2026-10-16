import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const base = new URL('../../supabase/migrations/20261006232008_big_match.sql', import.meta.url);
const expansion = new URL('../../supabase/migrations/20261016021000_expand_impersonae_28.sql', import.meta.url);
const seed = new URL('../../supabase/seed.sql', import.meta.url);

async function database() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, is_anonymous boolean NOT NULL DEFAULT true);');
  await db.exec(await readFile(base, 'utf8'));
  return db;
}
async function rpc(db, name, args) {
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE service_role');
    const slots = args.map((_, index) => '$' + (index + 1)).join(',');
    return (await tx.query(`SELECT public.${name}(${slots}) AS value`, args)).rows[0].value;
  });
}

describe('reviewed append-only expansion to 28 Impersonae cards', { concurrency: false }, () => {
  it('preserves a live response while adding IDs 14–28 and keeps the freeze trigger enabled', async () => {
    const db = await database();
    try {
      await db.exec(await readFile(seed, 'utf8'));
      await db.exec("UPDATE big_match.events SET collection_ready=true,privacy_version='test-v1',privacy_notice='Test notice covering a live response and reviewed catalogue expansion.',controller_name='Test Controller',controller_email='test@example.invalid',status='open' WHERE slug='big-2026'");
      const actor = randomUUID();
      await db.query('INSERT INTO auth.users(id) VALUES($1)', [actor]);
      await rpc(db, 'bm_put', ['big-2026', actor, [1, 2, 3], randomUUID(), 0]);
      const before = (await db.query("SELECT id,event_id,actor_id,card_a,card_b,card_c,revision FROM big_match.participations")).rows;

      await db.exec(await readFile(expansion, 'utf8'));

      assert.equal((await db.query("SELECT count(*)::int n FROM big_match.cards WHERE deck_version='impersonae-v1'")).rows[0].n, 28);
      assert.equal((await db.query("SELECT count(*)::int n FROM big_match.event_cards ec JOIN big_match.events e ON e.id=ec.event_id WHERE e.slug='big-2026' AND ec.enabled")).rows[0].n, 28);
      assert.deepEqual((await db.query("SELECT id,event_id,actor_id,card_a,card_b,card_c,revision FROM big_match.participations")).rows, before);
      const event = (await db.query("SELECT status,data_revision FROM big_match.events WHERE slug='big-2026'")).rows[0];
      assert.equal(event.status, 'open');
      assert.equal(Number(event.data_revision), 2);
      assert.equal((await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='freeze_event_cards'")).rows[0].tgenabled, 'O');

      await db.exec(await readFile(expansion, 'utf8'));
      assert.equal(Number((await db.query("SELECT data_revision FROM big_match.events WHERE slug='big-2026'")).rows[0].data_revision), 2);
      assert.equal((await rpc(db, 'bm_me', ['big-2026', actor])).participation.cardIds.join('-'), '1-2-3');
    } finally {
      await db.close();
    }
  });

  it('creates all 28 memberships when migrations run before the safe seed', async () => {
    const db = await database();
    try {
      await db.exec(await readFile(expansion, 'utf8'));
      await db.exec(await readFile(seed, 'utf8'));
      assert.equal((await db.query("SELECT count(*)::int n FROM big_match.cards WHERE deck_version='impersonae-v1'")).rows[0].n, 28);
      const event = (await db.query("SELECT e.status,count(ec.*)::int n FROM big_match.events e JOIN big_match.event_cards ec ON ec.event_id=e.id WHERE e.slug='big-2026' GROUP BY e.status")).rows[0];
      assert.deepEqual(event, { status: 'draft', n: 28 });
    } finally {
      await db.close();
    }
  });

  it('aborts atomically when a stable new ID already describes different artwork', async () => {
    const db = await database();
    try {
      await db.query("INSERT INTO big_match.cards(deck_version,id,slug,name,image,ordinal) VALUES('impersonae-v1',14,'angel','Wrong Angel','cards/angel.jpg',14)");
      await assert.rejects(db.exec(await readFile(expansion, 'utf8')), /BM_CATALOG_IDENTITY_CONFLICT/);
      await db.exec('ROLLBACK');
      assert.equal((await db.query("SELECT name FROM big_match.cards WHERE deck_version='impersonae-v1' AND id=14")).rows[0].name, 'Wrong Angel');
      assert.equal((await db.query("SELECT count(*)::int n FROM big_match.cards WHERE deck_version='impersonae-v1' AND id>14")).rows[0].n, 0);
    } finally {
      await db.close();
    }
  });
});
