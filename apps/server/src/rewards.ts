/**
 * The rewards site API (the only place where NEAR is named; the Mini App and the bot never mention it).
 * Players sign in with the Telegram Login Widget, see their weekly payouts and claim them to their own wallet.
 * A claim is signed by the player's game-held account (it is the leaf owner) and relayed by the game account.
 */
import type { Context, Hono } from 'hono';
import { eligible, islandLevel, type Island } from '@isle/core';
import { verifyLoginWidget, type TgUser } from './auth.ts';
import type { Config } from './config.ts';
import { all, one, run } from './db.ts';
import type { World } from './world.ts';

export interface RewardsPort {
  /** The leaf owner claims and sends the NEAR to `recipient`. */
  claimAs(owner: string, chainEpoch: number, amount: string, proof: string[], recipient: string): Promise<string>;
  /** Anyone triggers the claim; the NEAR goes to the leaf's own account (a DAO treasury). */
  claimFor(account: string, chainEpoch: number, amount: string, proof: string[]): Promise<string>;
  isClaimed(chainEpoch: number, account: string): Promise<boolean>;
  pool(): Promise<{ balance: string; reserved: string; available: string }>;
  exists(accountId: string): Promise<boolean>;
}

interface Leaf { account: string; amount: string; proof: string[] }
interface EpochRow { epoch: number; chain_epoch: number; root: string | null; root_tx: string | null; funded: number | null; pool: string; distributed: string; payouts: string; best_archipelago: string | null; closed_at: number }

const ACCOUNT_ID = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function addRewardsRoutes(app: Hono<any>, world: World, cfg: Config, port: RewardsPort | null) {
  const db = world.db.client;
  const body = async (c: Context) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, any>;
  const accountOf = (playerId: string) => `${playerId}.${cfg.gameAccount}`;

  function signIn(auth: Record<string, any> | undefined): TgUser | null {
    if (!auth || typeof auth !== 'object') return null;
    if (cfg.devAuth && typeof auth.dev === 'string') {
      const [id, name] = auth.dev.split(':');
      return /^\d{1,15}$/.test(id) ? { id, name: name || `Dev ${id}`, lang: 'en', startParam: null } : null;
    }
    const fields = Object.fromEntries(Object.entries(auth).map(([k, v]) => [k, String(v)]));
    return verifyLoginWidget(fields, cfg.botToken);
  }

  const epochs = async () => all<EpochRow>(db, 'SELECT * FROM epochs ORDER BY epoch DESC LIMIT 12');

  app.get('/api/rewards/overview', async (c) => {
    const rows = await epochs();
    const names = new Map((await all<{ id: string; name: string; dao: string | null; dao_status: string | null }>(db, 'SELECT id, name, dao, dao_status FROM archipelagos')).map((a) => [a.id, a]));
    const pool = port ? await port.pool().catch(() => null) : null;
    const out = [];
    for (const e of rows) {
      const leaves = JSON.parse(e.payouts) as Leaf[];
      const arch = e.best_archipelago ? names.get(e.best_archipelago) : undefined;
      const treasury = arch?.dao ? leaves.find((l) => l.account === arch.dao) ?? null : null;
      out.push({
        epoch: Number(e.epoch), chainEpoch: Number(e.chain_epoch), root: e.root, rootTx: e.root_tx, funded: e.funded === null ? null : Number(e.funded) === 1,
        pool: e.pool, distributed: e.distributed, players: leaves.filter((l) => l !== treasury).length,
        archipelago: arch ? { name: arch.name, dao: arch.dao, daoStatus: arch.dao_status } : null,
        treasury: treasury ? { account: treasury.account, amount: treasury.amount, claimed: port && e.funded ? await port.isClaimed(Number(e.chain_epoch), treasury.account).catch(() => null) : null } : null,
      });
    }
    return c.json({
      network: 'testnet', chain: cfg.chain, gameAccount: cfg.gameAccount,
      resources: cfg.resourcesContract || `res.${cfg.gameAccount}`, pool: cfg.poolContract || `pool.${cfg.gameAccount}`,
      explorer: 'https://testnet.nearblocks.io', botUsername: cfg.botUsername || null, devLogin: cfg.devAuth,
      poolBalance: pool, epochs: out,
    });
  });

  app.post('/api/rewards/me', async (c) => {
    const user = signIn((await body(c)).auth);
    if (!user) return c.json({ error: 'auth', message: 'sign in with Telegram' }, 401);
    const p = await one<{ id: string; name: string; island: string }>(db, 'SELECT id, name, island FROM players WHERE tg_id = ?', [user.id]);
    if (!p) return c.json({ error: 'player', message: 'no island yet: open the game in Telegram first' }, 404);
    const isl = JSON.parse(p.island) as Island;
    const account = accountOf(p.id);
    const claims = new Map((await all<{ epoch: number; recipient: string; tx: string | null }>(db, 'SELECT epoch, recipient, tx FROM claims WHERE account = ?', [account])).map((r) => [Number(r.epoch), r]));
    const payouts = [];
    for (const e of await epochs()) {
      const leaf = (JSON.parse(e.payouts) as Leaf[]).find((l) => l.account === account);
      if (!leaf) continue;
      const mine = claims.get(Number(e.epoch));
      const onChain = !mine && port && Number(e.funded) === 1 ? await port.isClaimed(Number(e.chain_epoch), account).catch(() => false) : false;
      payouts.push({
        epoch: Number(e.epoch), amount: leaf.amount, funded: e.funded === null ? null : Number(e.funded) === 1,
        claimed: !!mine || onChain, recipient: mine?.recipient ?? null, tx: mine?.tx ?? null,
      });
    }
    return c.json({
      name: p.name, account, islandLevel: islandLevel(isl), activeDays: isl.activeDays,
      eligible: eligible({ activeDays: isl.activeDays, islandLevel: islandLevel(isl) }), payouts, canClaim: !!port,
    });
  });

  app.post('/api/rewards/claim', async (c) => {
    const input = await body(c);
    const user = signIn(input.auth);
    if (!user) return c.json({ error: 'auth', message: 'sign in with Telegram' }, 401);
    if (!port) return c.json({ error: 'chain', message: 'claims are off on this server' }, 400);
    const wallet = String(input.wallet ?? '').trim().toLowerCase();
    if (!ACCOUNT_ID.test(wallet) && !/^[0-9a-f]{64}$/.test(wallet)) return c.json({ error: 'wallet', message: 'not a NEAR account id' }, 400);
    if (wallet.endsWith(`.${cfg.gameAccount}`) || wallet === cfg.gameAccount) return c.json({ error: 'wallet', message: 'use your own wallet, not a game account' }, 400);
    if (!/^[0-9a-f]{64}$/.test(wallet) && !(await port.exists(wallet))) return c.json({ error: 'wallet', message: 'this account does not exist on testnet' }, 400);
    const p = await one<{ id: string }>(db, 'SELECT id FROM players WHERE tg_id = ?', [user.id]);
    if (!p) return c.json({ error: 'player', message: 'no island yet' }, 404);
    const account = accountOf(p.id);
    const e = await one<EpochRow>(db, 'SELECT * FROM epochs WHERE epoch = ?', [Number(input.epoch)]);
    const leaf = e ? (JSON.parse(e.payouts) as Leaf[]).find((l) => l.account === account) : undefined;
    if (!e || !leaf) return c.json({ error: 'epoch', message: 'no payout for you in this week' }, 400);
    if (Number(e.funded) !== 1) return c.json({ error: 'epoch', message: 'this week is not on chain yet' }, 400);
    // Reserve the claim first, so two clicks never send two transactions.
    try {
      await run(db, 'INSERT INTO claims (epoch, account, recipient, amount, at) VALUES (?, ?, ?, ?, ?)', [Number(e.epoch), account, wallet, leaf.amount, Date.now()]);
    } catch {
      return c.json({ error: 'claimed', message: 'already claimed' }, 400);
    }
    if (await port.isClaimed(Number(e.chain_epoch), account)) return c.json({ error: 'claimed', message: 'already claimed on chain' }, 400);
    try {
      const tx = await port.claimAs(account, Number(e.chain_epoch), leaf.amount, leaf.proof, wallet);
      await run(db, 'UPDATE claims SET tx = ? WHERE epoch = ? AND account = ?', [tx, Number(e.epoch), account]);
      return c.json({ tx, amount: leaf.amount, recipient: wallet });
    } catch (err) {
      await run(db, 'DELETE FROM claims WHERE epoch = ? AND account = ?', [Number(e.epoch), account]);
      return c.json({ error: 'chain', message: String((err as Error).message ?? err).slice(0, 200) }, 502);
    }
  });

  /** Pays an epoch's archipelago share into its DAO. Anyone may press it: the NEAR can only go to the DAO. */
  app.post('/api/rewards/treasury', async (c) => {
    if (!port) return c.json({ error: 'chain', message: 'claims are off on this server' }, 400);
    const e = await one<EpochRow>(db, 'SELECT * FROM epochs WHERE epoch = ?', [Number((await body(c)).epoch)]);
    const arch = e?.best_archipelago ? await one<{ dao: string | null; dao_status: string | null }>(db, 'SELECT dao, dao_status FROM archipelagos WHERE id = ?', [e.best_archipelago]) : null;
    const leaf = e && arch?.dao ? (JSON.parse(e.payouts) as Leaf[]).find((l) => l.account === arch.dao) : undefined;
    if (!e || !leaf) return c.json({ error: 'epoch', message: 'no treasury share in this week' }, 400);
    if (Number(e.funded) !== 1 || arch?.dao_status !== 'live') return c.json({ error: 'epoch', message: 'the week or the treasury is not on chain yet' }, 400);
    if (await port.isClaimed(Number(e.chain_epoch), leaf.account)) return c.json({ error: 'claimed', message: 'already paid' }, 400);
    const tx = await port.claimFor(leaf.account, Number(e.chain_epoch), leaf.amount, leaf.proof);
    return c.json({ tx, amount: leaf.amount, recipient: leaf.account });
  });
}
