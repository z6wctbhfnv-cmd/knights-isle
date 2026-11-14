import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAY, EPOCH, HOUR, verifyProof } from '@isle/core';
import { createApp } from '../src/app.ts';
import { signInitData, signLoginWidget, verifyInitData, verifyLoginWidget } from '../src/auth.ts';
import { config as base } from '../src/config.ts';
import { all, Db, getMeta, run, setMeta } from '../src/db.ts';
import { World } from '../src/world.ts';

async function boot(over: Partial<typeof base> = {}) {
  const cfg = { ...base, devAuth: true, demoControls: true, seedNeighbours: false, botToken: 'TEST:token', ...over };
  const db = await Db.open(`file:${mkdtempSync(join(tmpdir(), 'isle-'))}/test.db`);
  const world = new World(db, cfg);
  const app = createApp(world, cfg);
  const call = async (user: string, method: 'GET' | 'POST', path: string, body?: unknown) => {
    const res = await app.request(path, {
      method, headers: { 'x-dev-user': user, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  /** Moves the game clock forward. */
  const skip = (ms: number) => db.write(async (tx) => {
    const c = (await getMeta<any>(tx, 'clock'))!;
    await setMeta(tx, 'clock', { ...c, anchorGame: c.anchorGame + ms });
  });
  /** Hands a player a pile of everything, as a test shortcut. */
  const enrich = (user: string) => world.act(async (ctx) => {
    const p = (await world.byTg(ctx, user))!;
    for (const r of Object.keys(p.island.res) as (keyof typeof p.island.res)[]) p.island.res[r] += 1_000_000;
  });
  return { cfg, db, world, app, call, skip, enrich };
}

describe('auth', () => {
  it('accepts signed Telegram data and rejects forged or stale data', () => {
    const now = 1_800_000_000;
    const fields = { auth_date: String(now), user: JSON.stringify({ id: 42, first_name: 'Ann', language_code: 'ru' }), start_param: 'ref_iabc' };
    const good = signInitData(fields, 'BOT');
    expect(verifyInitData(good, 'BOT', now + 10)).toEqual({ id: '42', name: 'Ann', lang: 'ru', startParam: 'ref_iabc' });
    expect(verifyInitData(good, 'OTHER', now + 10)).toBe(null);
    expect(verifyInitData(good.replace('Ann', 'Bob'), 'BOT', now + 10)).toBe(null);
    expect(verifyInitData(good, 'BOT', now + 2 * 86400)).toBe(null);
    expect(verifyInitData('', 'BOT')).toBe(null);
    const w = signLoginWidget({ id: '42', first_name: 'Ann', auth_date: String(now) }, 'BOT');
    expect(verifyLoginWidget(w, 'BOT', now)?.id).toBe('42');
    expect(verifyLoginWidget({ ...w, id: '43' }, 'BOT', now)).toBe(null);
  });

  it('refuses requests without Telegram data, and dev users when dev auth is off', async () => {
    const { app } = await boot({ devAuth: false });
    expect((await app.request('/api/state')).status).toBe(401);
    expect((await app.request('/api/state', { headers: { 'x-dev-user': '1' } })).status).toBe(401);
    const init = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 7, first_name: 'Real' }) }, 'TEST:token');
    const ok = await app.request('/api/state', { headers: { 'x-init-data': init } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ needStart: true, name: 'Real', lang: 'en' });
  });
});

describe('a game from start to payout', () => {
  it('plays the island loop over HTTP', async () => {
    const { call, skip } = await boot();
    expect((await call('1:Ann', 'GET', '/api/state')).json.needStart).toBe(true);
    expect((await call('1:Ann', 'POST', '/api/collect')).json.error).toBe('start');
    expect((await call('1:Ann', 'POST', '/api/start', { biome: 'moon' })).json.error).toBe('biome');
    const started = (await call('1:Ann:ru', 'POST', '/api/start', { biome: 'snow' })).json.state;
    expect(started.island.biome).toBe('snow');
    expect(started.me.lang).toBe('en'); // English by default, even with a Russian Telegram
    expect((await call('1:Ann:ru', 'POST', '/api/lang', { lang: 'ru' })).json.state.me.lang).toBe('ru');
    expect((await call('1:Ann:ru', 'POST', '/api/lang', { lang: 'en' })).json.state.me.lang).toBe('en');
    expect(started.events.map((e: any) => e.kind)).toEqual(['welcome']);
    expect((await call('1:Ann', 'POST', '/api/start', { biome: 'snow' })).json.error).toBe('exists');

    await skip(2 * HOUR);
    const collected = (await call('1:Ann', 'POST', '/api/collect')).json;
    expect(collected.result).toEqual({ energy: 120, materials: 80, credits: 66 });
    expect(collected.state.island.res).toMatchObject({ energy: 270, materials: 230, credits: 246 });
    expect(collected.state.island.quests.done).toEqual(['collect']);
    expect(collected.state.me.points).toBe(10); // quest 5 + first streak day 5

    expect((await call('1:Ann', 'POST', '/api/upgrade', { building: 'solar' })).json.error).toBe('lab');
    const lab = (await call('1:Ann', 'POST', '/api/upgrade', { building: 'lab' })).json;
    expect(lab.result.level).toBe(1);
    expect(lab.state.me.points).toBe(10 + 10 + 5);
    expect((await call('1:Ann', 'POST', '/api/upgrade', { building: 'castle' })).json.error).toBe('building');
    expect(JSON.stringify(lab.state)).not.toMatch(/near|testnet|wallet/i);
  });

  it('runs a caravan by request, pays the sender and mirrors every step as chain operations', async () => {
    const { call, skip, enrich, db, cfg } = await boot();
    const ann = (await call('1:Ann', 'POST', '/api/start', { biome: 'snow' })).json.state.me.id;
    const bob = (await call('2:Bob', 'POST', '/api/start', { biome: 'forest' })).json.state.me.id;
    await enrich('1');
    await call('1', 'POST', '/api/upgrade', { building: 'harbor' });

    expect((await call('2', 'POST', '/api/request', { res: 'wood', amount: 10 })).json.error).toBe('res');
    expect((await call('2', 'POST', '/api/request', { res: 'energy', amount: 10 })).json.error).toBe('res');
    const rq = (await call('2', 'POST', '/api/request', { res: 'ice', amount: 15 })).json.result.id;
    const board = (await call('1', 'GET', '/api/state')).json.state.requests;
    expect(board).toMatchObject([{ id: rq, name: 'Bob', res: 'ice', amount: 15, mine: false }]);

    const sent = (await call('1', 'POST', '/api/caravan', { requestId: rq, amount: 20 })).json;
    expect(sent.result).toMatchObject({ to: bob, res: 'ice', amount: 15, status: 'travel' });
    expect((await call('1', 'POST', '/api/caravan', { requestId: rq, amount: 1 })).json.error).toBe('request');
    expect((await call('1', 'POST', '/api/caravan', { to: bob, res: 'ice', amount: 1 })).json.error).toBe('slots');

    await skip(31 * 60 * 1000);
    const bobState = (await call('2', 'GET', '/api/state')).json.state;
    const done = bobState.caravans.find((c: any) => c.id === sent.result.id);
    expect(done.status).toBe('done');
    expect(done.delivered + done.lost).toBe(15);
    expect(bobState.island.res.ice).toBe(done.delivered);
    expect(bobState.events.map((e: any) => e.kind)).toContain('caravan_in');
    const annState = (await call('1', 'GET', '/api/state')).json.state;
    expect(annState.events.find((e: any) => e.kind === 'caravan_back').data).toMatchObject({ delivered: done.delivered, credits: done.delivered * 20 });
    expect(annState.island.knight.deliveries).toBe(1);
    expect(annState.island.reputation).toBe(done.delivered);
    expect(annState.requests.length).toBe(done.lost ? 1 : 0);

    // The chain mirror: accounts, then the cargo moves player -> knight -> receiver.
    const ops = (await all<{ kind: string; payload: string }>(db.client, 'SELECT kind, payload FROM chain_ops ORDER BY id')).map((o) => ({ kind: o.kind, ...JSON.parse(o.payload) }));
    const acc = (id: string) => `${id}.${cfg.gameAccount}`;
    expect(ops.filter((o) => o.kind === 'create_account').map((o) => o.account)).toEqual(expect.arrayContaining([acc(ann), `knight-${acc(ann)}`, acc(bob), `trader.${cfg.gameAccount}`]));
    const moves = ops.filter((o) => o.kind === 'transfer' && o.res === 'ice');
    expect(moves[0]).toMatchObject({ from: acc(ann), to: `knight-${acc(ann)}`, amount: 15 });
    expect(moves[1]).toMatchObject({ from: `knight-${acc(ann)}`, to: acc(bob), amount: done.delivered });
    if (done.lost) expect(moves[2]).toMatchObject({ from: `knight-${acc(ann)}`, to: `trader.${cfg.gameAccount}`, amount: done.lost });

    // Replaying all operations gives exactly the balances the game shows.
    const chain: Record<string, Record<string, number>> = {};
    const add = (a: string, r: string, n: number) => { (chain[a] ??= {})[r] = (chain[a][r] ?? 0) + n; };
    for (const o of ops) {
      if (o.kind === 'mint') for (const [r, n] of Object.entries(o.amounts)) add(o.account, r, n as number);
      if (o.kind === 'burn') for (const [r, n] of Object.entries(o.amounts)) add(o.account, r, -(n as number));
      if (o.kind === 'transfer') { add(o.from, o.res, -o.amount); add(o.to, o.res, o.amount); }
    }
    for (const [id, st] of [[ann, annState], [bob, bobState]] as const) {
      for (const [r, n] of Object.entries(st.island.res)) expect(chain[acc(id)]?.[r] ?? 0, `${id} ${r}`).toBe(Math.floor(n as number));
    }
    expect(chain[`knight-${acc(ann)}`].ice).toBe(0);
    for (const a of Object.values(chain)) for (const n of Object.values(a)) expect(n).toBeGreaterThanOrEqual(0);
  });

  it('trades with the wandering trader and moves its price', async () => {
    const { call, enrich } = await boot();
    await call('1', 'POST', '/api/start', { biome: 'snow' });
    await enrich('1');
    const before = (await call('1', 'GET', '/api/state')).json.state.trader.wood;
    expect(before).toMatchObject({ buy: 14, sell: 9, stock: 200 });
    const deal = (await call('1', 'POST', '/api/trader', { side: 'buy', res: 'wood', amount: 50 })).json;
    expect(deal.result.credits).toBeGreaterThan(700);
    expect(deal.state.trader.wood.stock).toBe(150);
    expect(deal.state.trader.wood.buy).toBeGreaterThan(before.buy);
    expect((await call('1', 'POST', '/api/trader', { side: 'buy', res: 'energy', amount: 1 })).json.error).toBe('res');
  });

  it('counts visits and likes, one like per island per day, and no points for likes', async () => {
    const { call, skip } = await boot();
    const ids: string[] = [];
    for (const [u, b] of [['1', 'snow'], ['2', 'forest'], ['3', 'desert'], ['4', 'tropical']]) ids.push((await call(u, 'POST', '/api/start', { biome: b })).json.state.me.id);
    expect((await call('1', 'GET', '/api/islands')).json.result.length).toBe(3);
    expect((await call('1', 'POST', '/api/like', { id: ids[1] })).json.error).toBe('visit');
    expect((await call('1', 'POST', '/api/visit', { id: ids[0] })).json.error).toBe('self');
    await call('1', 'POST', '/api/visit', { id: ids[1] });
    await call('1', 'POST', '/api/visit', { id: ids[1] });
    await call('1', 'POST', '/api/visit', { id: ids[2] });
    const third = (await call('1', 'POST', '/api/visit', { id: ids[3] })).json;
    expect(third.result).toMatchObject({ name: 'Dev 4', biome: 'tropical', likes: 0, liked: false });
    expect(third.state.island.quests.done).toEqual(['visit']);
    const pts = third.state.me.points;
    expect((await call('1', 'POST', '/api/like', { id: ids[1] })).json.result.liked).toBe(true);
    const again = (await call('1', 'POST', '/api/like', { id: ids[1] })).json;
    expect(again.result.liked).toBe(false);
    expect(again.state.me.points).toBe(pts);
    expect((await call('2', 'GET', '/api/state')).json.state.me.likes).toBe(1);
    await skip(DAY);
    await call('1', 'POST', '/api/visit', { id: ids[1] });
    expect((await call('1', 'POST', '/api/like', { id: ids[1] })).json.result.liked).toBe(true);
  });

  it('puts an invited friend into the inviter archipelago and pays referral XP for progress only', async () => {
    const { call } = await boot();
    const ann = (await call('1:Ann', 'POST', '/api/start', { biome: 'snow' })).json.state.me.id;
    expect((await call('1', 'POST', '/api/archipelago/create', { name: 'x' })).json.error).toBe('name');
    await call('1', 'POST', '/api/archipelago/create', { name: 'North Lights' });
    const bob = (await call('2:Bob', 'POST', '/api/start', { biome: 'forest', ref: `ref_${ann}` })).json.state;
    expect(bob.me.archipelago).toEqual({ id: 'north-lights', name: 'North Lights' });
    expect((await call('1', 'GET', '/api/state')).json.state.me.refXp).toBe(50);
    expect((await call('3', 'POST', '/api/start', { biome: 'desert' })).json.state.me.archipelago).toBe(null);
    expect((await call('3', 'POST', '/api/archipelago/create', { name: 'north lights' })).json.error).toBe('taken');
    await call('3', 'POST', '/api/archipelago/join', { id: 'north-lights' });
    const top = (await call('1', 'GET', '/api/top')).json.result;
    expect(top.archipelagos).toEqual([{ id: 'north-lights', name: 'North Lights', members: 3, points: expect.any(Number) }]);
    expect(JSON.stringify(top)).not.toMatch(/dao|testnet|near/i);
  });

  it('closes the week: payouts by points, a merkle root, proofs that verify, the archipelago share', async () => {
    const { call, skip, enrich, world, db, cfg } = await boot();
    const ids: Record<string, string> = {};
    for (const [u, b] of [['1', 'snow'], ['2', 'forest'], ['3', 'desert']]) ids[u] = (await call(u, 'POST', '/api/start', { biome: b })).json.state.me.id;
    await call('1', 'POST', '/api/archipelago/create', { name: 'North Lights' });
    await enrich('1');
    await enrich('2');
    // Players 1 and 2 play three days and build up; player 3 only talks to the knight once.
    for (let day = 0; day < 3; day++) {
      for (const u of ['1', '2']) await call(u, 'POST', '/api/knight/talk');
      for (const b of ['lab', 'solar', 'factory', 'datacenter', 'house', 'storage', 'fun', 'harbor']) {
        await call('1', 'POST', '/api/upgrade', { building: b });
        if (day < 2) await call('2', 'POST', '/api/upgrade', { building: b });
      }
      if (day === 0) await call('3', 'POST', '/api/knight/talk');
      if (day < 2) await skip(DAY);
    }
    for (let i = 0; i < 4; i++) for (const b of ['lab', 'solar', 'factory', 'datacenter', 'house', 'storage', 'fun', 'harbor']) for (const u of ['1', '2']) await call(u, 'POST', '/api/upgrade', { building: b });
    const s1 = (await call('1', 'GET', '/api/state')).json.state;
    expect(s1.me.eligible).toBe(true);
    expect((await call('3', 'GET', '/api/state')).json.state.me.eligible).toBe(false);

    await skip(EPOCH);
    const after = (await call('1', 'GET', '/api/state')).json.state;
    expect(after.epoch.index).toBe(s1.epoch.index + 1);
    expect(after.me.points).toBe(0);
    expect(after.events.map((e: any) => e.kind)).toContain('epoch_closed');

    const [row] = await all<any>(db.client, 'SELECT * FROM epochs');
    const payouts = JSON.parse(row.payouts) as { account: string; amount: string; proof: string[] }[];
    const acc = (u: string) => `${ids[u]}.${cfg.gameAccount}`;
    const treasury = payouts.find((p) => p.account.endsWith(`.${cfg.daoFactory}`))!.account;
    expect(treasury).toMatch(/^kisle-[0-9a-f]{6}\.sputnikv2\.testnet$/);
    expect(payouts.map((p) => p.account).sort()).toEqual([acc('1'), acc('2'), treasury].sort());
    const amount = (a: string) => BigInt(payouts.find((p) => p.account === a)!.amount);
    const pool = cfg.poolPerEpoch;
    expect(amount(treasury)).toBe(pool / 5n);
    expect(amount(acc('1')) > amount(acc('2'))).toBe(true);
    expect(amount(acc('1')) + amount(acc('2')) <= (pool * 4n) / 5n).toBe(true);
    expect(BigInt(row.distributed)).toBe(payouts.reduce((s, p) => s + BigInt(p.amount), 0n));
    const base = Number((await all<any>(db.client, "SELECT value FROM meta WHERE key = 'epoch_base'"))[0].value);
    expect(Number(row.chain_epoch)).toBe(base * 1000 + Number(row.epoch));
    for (const p of payouts) expect(verifyProof(row.root, Number(row.chain_epoch), p.account, BigInt(p.amount), p.proof)).toBe(true);
    const ops = (await all<any>(db.client, "SELECT kind, payload FROM chain_ops WHERE kind IN ('set_epoch_root', 'create_dao') ORDER BY id")).map((o) => ({ kind: o.kind, ...JSON.parse(o.payload) }));
    expect(ops).toEqual([
      { kind: 'create_dao', name: treasury.split('.')[0], council: [acc('1')], purpose: "Knight's Isle archipelago treasury", archipelago: 'north-lights' },
      { kind: 'set_epoch_root', epoch: Number(row.epoch), chainEpoch: Number(row.chain_epoch), root: row.root, total: row.distributed },
    ]);
    // The archipelago keeps the same treasury afterwards.
    expect((await all<any>(db.client, 'SELECT dao, dao_status FROM archipelagos'))[0]).toMatchObject({ dao: treasury, dao_status: 'pending' });

    // Week 2: a second archipelago wins, but the DAO limit (1) is used up, so its share stays in the pool.
    await call('2', 'POST', '/api/archipelago/create', { name: 'South Wind' });
    for (let i = 0; i < 3; i++) await call('2', 'POST', '/api/upgrade', { building: 'lab' });
    await skip(EPOCH);
    await call('1', 'GET', '/api/state');
    const week2 = (await all<any>(db.client, 'SELECT * FROM epochs ORDER BY epoch DESC'))[0];
    expect(week2.best_archipelago).toBe('south-wind');
    expect(JSON.parse(week2.payouts).some((p: any) => p.account.endsWith(cfg.daoFactory))).toBe(false);
    expect(BigInt(week2.distributed) <= (cfg.poolPerEpoch * 4n) / 5n).toBe(true);
    expect((await all<any>(db.client, "SELECT COUNT(*) AS n FROM chain_ops WHERE kind = 'create_dao'"))[0].n).toBe(1);

    // An unfunded DAO is never paid: its archipelago gets no treasury leaf.
    await run(db.client, "UPDATE archipelagos SET dao_status = 'unfunded' WHERE id = 'north-lights'");
    for (let i = 0; i < 5; i++) await call('1', 'POST', '/api/upgrade', { building: 'harbor' });
    await skip(EPOCH);
    await call('1', 'GET', '/api/state');
    const week3 = (await all<any>(db.client, 'SELECT * FROM epochs ORDER BY epoch DESC'))[0];
    expect(week3.best_archipelago).toBe('north-lights');
    expect(JSON.parse(week3.payouts).some((p: any) => p.account === treasury)).toBe(false);
    void world;
  });

  it('lets cron reach the chain endpoint with the admin key only, without Telegram data', async () => {
    const { app } = await boot({ adminKey: 'k3y' });
    expect((await app.request('/api/cron/chain', { method: 'POST' })).status).toBe(403);
    expect((await app.request('/api/cron/chain', { method: 'POST', headers: { 'x-admin-key': 'nope' } })).status).toBe(403);
    const ok = await app.request('/api/cron/chain', { method: 'POST', headers: { authorization: 'Bearer k3y' } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ done: 0, chain: 'off' });
    expect((await app.request('/api/proof')).status).toBe(200);
  });

  it('speeds the clock up for the demo and guards the control', async () => {
    const { call, world } = await boot();
    await call('1', 'POST', '/api/start', { biome: 'snow' });
    expect((await call('1', 'POST', '/api/demo/speed', { speed: 0 })).json.error).toBe('speed');
    expect((await call('1', 'POST', '/api/demo/speed', { speed: 10080 })).status).toBe(200);
    const a = (await call('1', 'GET', '/api/state')).json.state;
    expect(a.speed).toBe(10080);
    await new Promise((r) => setTimeout(r, 120));
    const b = (await call('1', 'GET', '/api/state')).json.state;
    expect(b.now - a.now).toBeGreaterThan(15 * 60 * 1000);
    await world.setSpeed(1);
    const off = await boot({ demoControls: false });
    expect((await off.call('1', 'POST', '/api/demo/speed', { speed: 5 })).status).toBe(403);
  });

  it('gives a lone player four resident neighbours who post requests and answer theirs', async () => {
    const { call, skip } = await boot({ seedNeighbours: true });
    await call('1', 'POST', '/api/start', { biome: 'snow' });
    const s = (await call('1', 'GET', '/api/state')).json.state;
    expect(s.requests.filter((r: any) => r.npc).length).toBe(4);
    const isl = (await call('1', 'GET', '/api/islands')).json.result;
    expect(isl.map((i: any) => i.name).sort()).toEqual(['Bjorn', 'Elowen', 'Marisol', 'Zahir']);
    await call('1', 'POST', '/api/request', { res: 'wood', amount: 12 });
    await skip(11 * 60 * 1000);
    await call('1', 'GET', '/api/state');
    await skip(11 * 60 * 1000);
    const mid = (await call('1', 'GET', '/api/state')).json.state;
    expect(mid.caravans.find((c: any) => c.res === 'wood' && c.status === 'travel')).toMatchObject({ amount: 12 });
    expect(mid.names[mid.caravans[0].from]).toBe('Elowen');
    await skip(31 * 60 * 1000);
    const end = (await call('1', 'GET', '/api/state')).json.state;
    expect(end.island.res.wood).toBeGreaterThan(0);
    expect(end.island.res.wood).toBeLessThanOrEqual(12);
  });
});
