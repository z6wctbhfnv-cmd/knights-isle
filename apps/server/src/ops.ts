/**
 * Sends the queued chain operations (table chain_ops) to NEAR, in game order.
 *
 * One round takes the oldest pending operations and runs them in stages:
 *   1. create accounts,
 *   2. all mints of the round in a few `mint_many` calls,
 *   3. transfers one by one, in id order,
 *   4. burns, one `burn_batch` per account,
 *   5. epoch roots and treasuries.
 * Moving mints earlier and burns later inside a round never makes a balance go lower than it was in the
 * game's own order, so every transfer and burn that was valid in the game is valid on chain.
 * A failure stops the round and leaves the operation pending with its error; nothing is skipped.
 */
import { all, run, type Db } from './db.ts';

export interface ChainPort {
  createAccount(accountId: string): Promise<string | null>;
  mintMany(entries: [string, string[], string[]][]): Promise<string>;
  burn(accountId: string, tokens: string[], amounts: string[]): Promise<string>;
  transfer(from: string, to: string, token: string, amount: number, memo: string): Promise<string>;
  /** Returns null when the pool cannot cover `total`: the epoch then stays off chain. */
  setEpochRoot(epoch: number, root: string, total: string): Promise<string | null>;
  /** Returns null when there is not enough NEAR for a DAO. */
  createDao(name: string, council: string[], purpose: string): Promise<string | null>;
  /** NEAR (yocto) left on the game account. */
  gameBalance(): Promise<bigint>;
}

interface OpRow { id: number; kind: string; payload: string }
type Op = { id: number; kind: string; p: any };

const MINT_BATCH = 25;
/** Below this the processor pauses instead of draining the game account. */
const MIN_BALANCE = 500n * 10n ** 21n;

let running = false;

export async function processOps(db: Db, chain: ChainPort, limit = 200): Promise<{ done: number; error?: string; paused?: boolean }> {
  if (running) return { done: 0 };
  running = true;
  let done = 0;
  const finish = async (ops: Op[], status: 'done' | 'skipped', tx: string | null, note?: string) => {
    for (const o of ops) {
      await run(db.client, 'UPDATE chain_ops SET status = ?, tx = ?, error = ?, done_at = ? WHERE id = ?', [status, tx, note ?? null, Date.now(), o.id]);
      done++;
    }
  };
  let current: Op[] = [];
  try {
    if ((await chain.gameBalance()) < MIN_BALANCE) return { done, paused: true };
    const rows = await all<OpRow>(db.client, "SELECT id, kind, payload FROM chain_ops WHERE status = 'pending' ORDER BY id LIMIT ?", [limit]);
    const ops: Op[] = rows.map((r) => ({ id: Number(r.id), kind: r.kind, p: JSON.parse(r.payload) }));
    if (!ops.length) return { done };
    const of = (kind: string) => ops.filter((o) => o.kind === kind);

    for (const o of of('create_account')) {
      current = [o];
      await finish([o], 'done', await chain.createAccount(o.p.account));
    }

    const mints = of('mint');
    for (let i = 0; i < mints.length; ) {
      // Sum the mints per account, then send up to MINT_BATCH accounts per call.
      const byAccount = new Map<string, Map<string, number>>();
      const batch: Op[] = [];
      for (; i < mints.length; i++) {
        const o = mints[i];
        if (!byAccount.has(o.p.account) && byAccount.size >= MINT_BATCH) break;
        const m = byAccount.get(o.p.account) ?? new Map<string, number>();
        for (const [t, n] of Object.entries(o.p.amounts as Record<string, number>)) m.set(t, (m.get(t) ?? 0) + n);
        byAccount.set(o.p.account, m);
        batch.push(o);
      }
      const entries: [string, string[], string[]][] = [...byAccount].map(([acc, m]) => {
        const pos = [...m].filter(([, n]) => n > 0);
        return [acc, pos.map(([t]) => t), pos.map(([, n]) => String(n))];
      }).filter((e) => e[1].length > 0) as [string, string[], string[]][];
      current = batch;
      await finish(batch, 'done', entries.length ? await chain.mintMany(entries) : null);
    }

    for (const o of of('transfer')) {
      current = [o];
      await finish([o], 'done', await chain.transfer(o.p.from, o.p.to, o.p.res, o.p.amount, String(o.p.memo ?? '').slice(0, 200)));
    }

    const burns = new Map<string, Op[]>();
    for (const o of of('burn')) burns.set(o.p.account, [...(burns.get(o.p.account) ?? []), o]);
    for (const [acc, list] of burns) {
      const sum = new Map<string, number>();
      for (const o of list) for (const [t, n] of Object.entries(o.p.amounts as Record<string, number>)) sum.set(t, (sum.get(t) ?? 0) + n);
      const pos = [...sum].filter(([, n]) => n > 0);
      current = list;
      await finish(list, 'done', pos.length ? await chain.burn(acc, pos.map(([t]) => t), pos.map(([, n]) => String(n))) : null);
    }

    for (const o of ops.filter((x) => x.kind === 'set_epoch_root' || x.kind === 'create_dao')) {
      current = [o];
      if (o.kind === 'set_epoch_root') {
        const tx = await chain.setEpochRoot(o.p.chainEpoch, o.p.root, o.p.total);
        await finish([o], tx ? 'done' : 'skipped', tx, tx ? undefined : 'pool cannot cover this epoch');
        await run(db.client, 'UPDATE epochs SET root_tx = ?, funded = ? WHERE epoch = ?', [tx, tx ? 1 : 0, o.p.epoch]);
      } else {
        const tx = await chain.createDao(o.p.name, o.p.council, o.p.purpose);
        await finish([o], tx ? 'done' : 'skipped', tx, tx ? undefined : 'not enough NEAR for a DAO');
        await run(db.client, 'UPDATE archipelagos SET dao_status = ? WHERE id = ?', [tx ? 'live' : 'unfunded', o.p.archipelago]);
      }
    }
    // Anything else (unknown kinds) would block the queue forever: mark it.
    const known = new Set(['create_account', 'mint', 'transfer', 'burn', 'set_epoch_root', 'create_dao']);
    await finish(ops.filter((o) => !known.has(o.kind)), 'skipped', null, 'unknown kind');
    return { done };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    for (const o of current) await run(db.client, 'UPDATE chain_ops SET error = ?, tries = tries + 1 WHERE id = ?', [msg, o.id]);
    return { done, error: msg };
  } finally {
    running = false;
  }
}
