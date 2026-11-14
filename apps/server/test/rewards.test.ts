import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { signLoginWidget } from '../src/auth.ts';
import { config as base } from '../src/config.ts';
import { Db, run } from '../src/db.ts';
import type { RewardsPort } from '../src/rewards.ts';
import { World } from '../src/world.ts';

async function setup(port: 'fake' | 'none' = 'fake') {
  const cfg = { ...base, botToken: '1:TEST', devAuth: false, seedNeighbours: false, gameAccount: 'isle.testnet' };
  const db = await Db.open(`file:${mkdtempSync(join(tmpdir(), 'isle-rw-'))}/t.db`);
  const world = new World(db, cfg);
  const calls: any[] = [];
  const claimed = new Set<string>();
  let fail = false;
  const fake: RewardsPort = {
    async claimAs(owner, epoch, amount, proof, recipient) { if (fail) throw new Error('rpc down'); calls.push({ owner, epoch, amount, proof, recipient }); claimed.add(`${epoch}|${owner}`); return 'TX1'; },
    async claimFor(account, epoch, amount) { calls.push({ third: account, epoch, amount }); claimed.add(`${epoch}|${account}`); return 'TX2'; },
    async isClaimed(epoch, account) { return claimed.has(`${epoch}|${account}`); },
    async pool() { return { balance: '5', reserved: '2', available: '3' }; },
    async exists(id) { return id !== 'ghost.testnet'; },
  };
  const app = createApp(world, cfg, { rewards: port === 'fake' ? fake : null });
  const player = await world.act((w) => world.createPlayer(w, { tgId: '42', name: 'Ann', lang: 'en', biome: 'snow' }));
  const account = `${player.id}.isle.testnet`;
  await run(db.client, "INSERT INTO archipelagos (id, name, owner_id, dao, dao_status, created_at) VALUES ('fg', 'Frost Guard', ?, 'kisle-1.sputnikv2.testnet', 'live', 0)", [player.id]);
  const payouts = JSON.stringify([{ account, amount: '7000', proof: ['aa'] }, { account: 'kisle-1.sputnikv2.testnet', amount: '2000', proof: ['bb'] }]);
  await run(db.client, "INSERT INTO epochs (epoch, chain_epoch, root, root_tx, funded, pool, distributed, payouts, best_archipelago, closed_at) VALUES (1, 1001, 'r1', 'RT1', 1, '10000', '9000', ?, 'fg', 0)", [payouts]);
  await run(db.client, "INSERT INTO epochs (epoch, chain_epoch, root, funded, pool, distributed, payouts, closed_at) VALUES (2, 1002, 'r2', 0, '10000', '7000', ?, 0)", [JSON.stringify([{ account, amount: '5000', proof: [] }])]);
  const auth = signLoginWidget({ id: '42', first_name: 'Ann', auth_date: String(Math.floor(Date.now() / 1000)) }, '1:TEST');
  const post = async (path: string, body: unknown) => {
    const r = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as any };
  };
  return { app, post, auth, account, calls, setFail: (v: boolean) => { fail = v; } };
}

describe('rewards site', () => {
  it('shows the pool and closed weeks without signing in', async () => {
    const { app } = await setup();
    const o = (await (await app.request('/api/rewards/overview')).json()) as any;
    expect(o.poolBalance).toEqual({ balance: '5', reserved: '2', available: '3' });
    expect(o.epochs.map((e: any) => [e.epoch, e.players, e.funded])).toEqual([[2, 1, false], [1, 1, true]]);
    expect(o.epochs[1].treasury).toEqual({ account: 'kisle-1.sputnikv2.testnet', amount: '2000', claimed: false });
    expect(o.epochs[1].archipelago).toEqual({ name: 'Frost Guard', dao: 'kisle-1.sputnikv2.testnet', daoStatus: 'live' });
  });

  it('needs a valid Telegram sign-in', async () => {
    const { post, auth } = await setup();
    expect((await post('/api/rewards/me', {})).status).toBe(401);
    expect((await post('/api/rewards/me', { auth: { ...auth, id: '43' } })).status).toBe(401);
    expect((await post('/api/rewards/me', { auth: { dev: '42' } })).status).toBe(401);
    const me = await post('/api/rewards/me', { auth });
    expect(me.json).toMatchObject({ name: 'Ann', eligible: false, canClaim: true });
    expect(me.json.payouts).toEqual([
      { epoch: 2, amount: '5000', funded: false, claimed: false, recipient: null, tx: null },
      { epoch: 1, amount: '7000', funded: true, claimed: false, recipient: null, tx: null },
    ]);
  });

  it('claims to the player wallet once, signed by the player account', async () => {
    const { post, auth, account, calls } = await setup();
    expect((await post('/api/rewards/claim', { auth, epoch: 1, wallet: 'Not An Account' })).json.error).toBe('wallet');
    expect((await post('/api/rewards/claim', { auth, epoch: 1, wallet: 'x.isle.testnet' })).json.error).toBe('wallet');
    expect((await post('/api/rewards/claim', { auth, epoch: 1, wallet: 'ghost.testnet' })).json.message).toMatch(/does not exist/);
    expect((await post('/api/rewards/claim', { auth, epoch: 2, wallet: 'ann.testnet' })).json.message).toMatch(/not on chain/);
    expect((await post('/api/rewards/claim', { auth, epoch: 9, wallet: 'ann.testnet' })).json.error).toBe('epoch');
    const ok = await post('/api/rewards/claim', { auth, epoch: 1, wallet: 'ann.testnet' });
    expect(ok.json).toEqual({ tx: 'TX1', amount: '7000', recipient: 'ann.testnet' });
    expect(calls).toEqual([{ owner: account, epoch: 1001, amount: '7000', proof: ['aa'], recipient: 'ann.testnet' }]);
    expect((await post('/api/rewards/claim', { auth, epoch: 1, wallet: 'ann.testnet' })).json.error).toBe('claimed');
    const me = await post('/api/rewards/me', { auth });
    expect(me.json.payouts[1]).toMatchObject({ claimed: true, recipient: 'ann.testnet', tx: 'TX1' });
  });

  it('lets the player retry after a failed transaction', async () => {
    const { post, auth, setFail } = await setup();
    setFail(true);
    expect((await post('/api/rewards/claim', { auth, epoch: 1, wallet: 'ann.testnet' })).status).toBe(502);
    setFail(false);
    expect((await post('/api/rewards/claim', { auth, epoch: 1, wallet: 'ann.testnet' })).json.tx).toBe('TX1');
  });

  it('pays the archipelago share into its DAO, once', async () => {
    const { post, calls } = await setup();
    expect((await post('/api/rewards/treasury', { epoch: 2 })).json.error).toBe('epoch');
    expect((await post('/api/rewards/treasury', { epoch: 1 })).json).toEqual({ tx: 'TX2', amount: '2000', recipient: 'kisle-1.sputnikv2.testnet' });
    expect(calls).toEqual([{ third: 'kisle-1.sputnikv2.testnet', epoch: 1001, amount: '2000' }]);
    expect((await post('/api/rewards/treasury', { epoch: 1 })).json.error).toBe('claimed');
  });

  it('refuses claims when the server runs without the chain', async () => {
    const { post, auth } = await setup('none');
    expect((await post('/api/rewards/claim', { auth, epoch: 1, wallet: 'ann.testnet' })).json.error).toBe('chain');
    expect((await post('/api/rewards/me', { auth })).json.canClaim).toBe(false);
  });
});
