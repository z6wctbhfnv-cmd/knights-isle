/**
 * Test fixture for the live demo world: prepares one player who has earned a weekly reward
 * (island level 3, three active days, member of an archipelago). Run with the server stopped.
 *   CHAIN=testnet DATABASE_URL=file:apps/server/data/testnet.db npx tsx --env-file=.env scripts/demo-player.ts
 * The resources it hands out reach the chain as ordinary mints when the server runs again.
 */
import { BUILDINGS, DAY, islandLevel } from '../packages/core/src/index.ts';
import { config } from '../apps/server/src/config.ts';
import { Db, getMeta, setMeta } from '../apps/server/src/db.ts';
import { World } from '../apps/server/src/world.ts';

const db = await Db.open(config.dbUrl);
const world = new World(db, { ...config, seedNeighbours: false });
const TG = '303';
await world.act(async (ctx) => {
  let p = await world.byTg(ctx, TG);
  if (!p) p = await world.createPlayer(ctx, { tgId: TG, name: 'Demo', lang: 'en', biome: 'tropical' });
  for (const r of ['energy', 'materials', 'credits'] as const) p.island.res[r] += 20_000;
  for (let level = 1; level <= 3; level++) {
    for (const b of ['lab', ...BUILDINGS.filter((x) => x !== 'lab')] as const) if (p.island.levels[b] < level) await world.upgrade(ctx, p, b);
  }
  if (!p.archipelagoId) await world.joinArchipelago(ctx, p, 'frost-guard');
  console.log('level', islandLevel(p.island), 'archipelago', p.archipelagoId);
});
for (let d = 0; d < 3; d++) {
  await world.act(async (ctx) => {
    const p = (await world.byTg(ctx, TG))!;
    await world.talk(ctx, p);
    await world.collect(ctx, p);
    console.log('day', d + 1, 'active days', p.island.activeDays);
  });
  if (d < 2) await db.write(async (tx) => {
    const c = (await getMeta<any>(tx, 'clock'))!;
    await setMeta(tx, 'clock', { ...c, anchorGame: c.anchorGame + DAY });
  });
}
