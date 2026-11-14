import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Db, all, run } from '../src/db.ts';
import { processOps, type ChainPort } from '../src/ops.ts';

/** A fake chain that keeps token balances and refuses anything a real contract would refuse. */
function fakeChain() {
  const bal = new Map<string, number>();
  const accounts = new Set<string>();
  const calls: string[] = [];
  let failNext: string | null = null;
  const get = (a: string, t: string) => bal.get(`${a}|${t}`) ?? 0;
  const add = (a: string, t: string, n: number) => {
    const v = get(a, t) + n;
    if (v < 0) throw new Error(`balance of ${a} ${t} would go negative`);
    bal.set(`${a}|${t}`, v);
  };
  let n = 0;
  const tx = (what: string) => {
    if (failNext && what.startsWith(failNext)) { failNext = null; throw new Error(`rpc down during ${what}`); }
    calls.push(what);
    return `tx${++n}`;
  };
  const port: ChainPort = {
    async createAccount(a) { if (accounts.has(a)) return null; accounts.add(a); return tx(`create ${a}`); },
    async mintMany(entries) {
      if (entries.length > 25) throw new Error('batch too large');
      const h = tx(`mint ${entries.length}`);
      for (const [a, ts, ns] of entries) ts.forEach((t, i) => { if (Number(ns[i]) <= 0) throw new Error('zero'); add(a, t, Number(ns[i])); });
      return h;
    },
    async burn(a, ts, ns) { const h = tx(`burn ${a}`); ts.forEach((t, i) => add(a, t, -Number(ns[i]))); return h; },
    async transfer(f, to, t, amount) { if (get(f, t) < amount) throw new Error(`${f} has ${get(f, t)} ${t}, needs ${amount}`); const h = tx(`transfer ${f}>${to}`); add(f, t, -amount); add(to, t, amount); return h; },
    async setEpochRoot(e) { return e === 13 ? null : tx(`root ${e}`); },
    async createDao(name) { return tx(`dao ${name}`); },
    async gameBalance() { return 10n ** 24n; },
  };
  return { port, bal: get, calls, fail: (prefix: string) => { failNext = prefix; } };
}

async function db() {
  return Db.open(`file:${mkdtempSync(join(tmpdir(), 'isle-ops-'))}/t.db`);
}
const queue = (d: Db, kind: string, payload: unknown) => run(d.client, 'INSERT INTO chain_ops (kind, payload, created_at) VALUES (?, ?, 0)', [kind, JSON.stringify(payload)]);

describe('chain operation queue', () => {
  it('runs a game sequence on chain: mints first, transfers in order, burns last, all balances right', async () => {
    const d = await db();
    const c = fakeChain();
    await queue(d, 'create_account', { account: 'a' });
    await queue(d, 'create_account', { account: 'k' });
    await queue(d, 'create_account', { account: 'b' });
    await queue(d, 'mint', { account: 'a', amounts: { ice: 20, energy: 5 } });
    await queue(d, 'transfer', { from: 'a', to: 'k', res: 'ice', amount: 15, memo: 'departs' });
    await queue(d, 'burn', { account: 'a', amounts: { ice: 5 } }); // spent the last 5 ice on a building
    await queue(d, 'transfer', { from: 'k', to: 'b', res: 'ice', amount: 12, memo: 'arrives' });
    await queue(d, 'transfer', { from: 'b', to: 'a', res: 'ice', amount: 12, memo: 'gift back' });
    await queue(d, 'mint', { account: 'a', amounts: { ice: 3 } });
    await queue(d, 'burn', { account: 'a', amounts: { ice: 10 } });
    await queue(d, 'set_epoch_root', { epoch: 1, chainEpoch: 7, root: 'r', total: '5' });
    const out = await processOps(d, c.port);
    expect(out).toEqual({ done: 11 });
    expect(c.calls).toEqual(['create a', 'create k', 'create b', 'mint 1', 'transfer a>k', 'transfer k>b', 'transfer b>a', 'burn a', 'root 7']);
    expect([c.bal('a', 'ice'), c.bal('k', 'ice'), c.bal('b', 'ice'), c.bal('a', 'energy')]).toEqual([5, 3, 0, 5]);
    const rows = await all<any>(d.client, 'SELECT status, tx FROM chain_ops ORDER BY id');
    expect(rows.every((r) => r.status === 'done' && r.tx)).toBe(true);
    expect((await processOps(d, c.port)).done).toBe(0);
  });

  it('stops on a failure, keeps the operation pending with the error, and resumes without repeating', async () => {
    const d = await db();
    const c = fakeChain();
    await queue(d, 'mint', { account: 'a', amounts: { ice: 10 } });
    await queue(d, 'transfer', { from: 'a', to: 'b', res: 'ice', amount: 4, memo: '' });
    await queue(d, 'transfer', { from: 'a', to: 'b', res: 'ice', amount: 4, memo: '' });
    await queue(d, 'burn', { account: 'a', amounts: { ice: 2 } });
    c.fail('transfer');
    const first = await processOps(d, c.port);
    expect(first.done).toBe(1);
    expect(first.error).toMatch(/rpc down/);
    const pending = await all<any>(d.client, "SELECT id, error, tries FROM chain_ops WHERE status = 'pending' ORDER BY id");
    expect(pending.map((p) => Number(p.id))).toEqual([2, 3, 4]);
    expect(pending[0]).toMatchObject({ tries: 1 });
    expect(pending[0].error).toMatch(/rpc down/);
    expect(await processOps(d, c.port)).toEqual({ done: 3 });
    expect(c.calls).toEqual(['mint 1', 'transfer a>b', 'transfer a>b', 'burn a']);
    expect([c.bal('a', 'ice'), c.bal('b', 'ice')]).toEqual([0, 8]);
  });

  it('splits big mint rounds into batches of 25 accounts', async () => {
    const d = await db();
    const c = fakeChain();
    for (let i = 0; i < 60; i++) await queue(d, 'mint', { account: `p${i}`, amounts: { credits: i + 1 } });
    expect((await processOps(d, c.port)).done).toBe(60);
    expect(c.calls).toEqual(['mint 25', 'mint 25', 'mint 10']);
    expect(c.bal('p59', 'credits')).toBe(60);
  });

  it('marks an epoch the pool cannot cover as skipped instead of blocking the queue', async () => {
    const d = await db();
    const c = fakeChain();
    await run(d.client, "INSERT INTO epochs (epoch, root, pool, distributed, payouts, closed_at) VALUES (3, 'r', '1', '1', '[]', 0)");
    await queue(d, 'set_epoch_root', { epoch: 3, chainEpoch: 13, root: 'r', total: '1' });
    await queue(d, 'mint', { account: 'a', amounts: { ice: 1 } });
    expect((await processOps(d, c.port)).done).toBe(2);
    expect((await all<any>(d.client, 'SELECT status, error FROM chain_ops WHERE id = 1'))[0]).toMatchObject({ status: 'skipped', error: 'pool cannot cover this epoch' });
    expect((await all<any>(d.client, 'SELECT funded FROM epochs'))[0].funded).toBe(0);
  });

  it('pauses when the game account runs low on NEAR', async () => {
    const d = await db();
    const c = fakeChain();
    c.port.gameBalance = async () => 10n ** 20n;
    await queue(d, 'mint', { account: 'a', amounts: { ice: 1 } });
    expect(await processOps(d, c.port)).toEqual({ done: 0, paused: true });
  });
});
