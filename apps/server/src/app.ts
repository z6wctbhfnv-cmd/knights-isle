import { Hono, type Context } from 'hono';
import { GameError, type Biome, type Building, type Producer, type Rare, type Res } from '@isle/core';
import { verifyInitData, type TgUser } from './auth.ts';
import type { Config } from './config.ts';
import { all } from './db.ts';
import type { Ctx, Player, World } from './world.ts';

type Env = { Variables: { user: TgUser } };

export function createApp(world: World, cfg: Config, hooks: { processChain?: () => Promise<unknown> } = {}) {
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof GameError) return c.json({ error: err.code, message: err.message }, 400);
    console.error(err);
    return c.json({ error: 'server', message: 'something went wrong' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  // ---- who is asking ----
  app.use('/api/*', async (c, next) => {
    // Routes with their own checks: the bot webhook (secret header), cron (admin key), public proof and rewards site.
    const open = ['/api/rewards', '/api/proof', '/api/bot', '/api/cron'];
    if (c.req.path === '/api/health' || open.some((p) => c.req.path.startsWith(p))) return next();
    let user = verifyInitData(c.req.header('x-init-data') ?? '', cfg.botToken);
    const dev = c.req.header('x-dev-user');
    if (!user && cfg.devAuth && dev) {
      const [id, name, lang] = decodeURIComponent(dev).split(':');
      if (/^\d{1,15}$/.test(id)) user = { id, name: name || `Dev ${id}`, lang: lang === 'ru' ? 'ru' : 'en', startParam: null };
    }
    if (!user) return c.json({ error: 'auth', message: 'open the game from Telegram' }, 401);
    c.set('user', user);
    return next();
  });

  const body = async (c: Context) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

  /** Runs an action for the signed-in player and returns the fresh state next to the action's result. */
  const play = (fn: (ctx: Ctx, p: Player, input: Record<string, unknown>) => Promise<unknown>) => async (c: Context<Env>) => {
    const input = await body(c);
    const user = c.get('user');
    const out = await world.act(async (ctx) => {
      const p = await world.byTg(ctx, user.id);
      if (!p) throw new GameError('start', 'choose an island first');
      const result = await fn(ctx, p, input);
      return { result: result ?? null, state: await world.state(ctx, p) };
    });
    return c.json(out);
  };

  app.get('/api/state', async (c) => {
    const user = c.get('user');
    const out = await world.act(async (ctx) => {
      const p = await world.byTg(ctx, user.id);
      return p ? { state: await world.state(ctx, p) } : { needStart: true, name: user.name, lang: user.lang };
    });
    return c.json({ ...out, demo: cfg.demoControls });
  });

  app.post('/api/start', async (c) => {
    const user = c.get('user');
    const input = await body(c);
    const ref = String(input.ref ?? user.startParam ?? '').replace(/^ref_/, '') || null;
    const out = await world.act(async (ctx) => {
      const p = await world.createPlayer(ctx, { tgId: user.id, name: user.name, lang: user.lang, biome: input.biome as Biome, ref });
      return { state: await world.state(ctx, p) };
    });
    return c.json(out);
  });

  app.post('/api/collect', play((ctx, p, i) => world.collect(ctx, p, i.building as Producer | undefined)));
  app.post('/api/upgrade', play(async (ctx, p, i) => {
    const { level, cost } = await world.upgrade(ctx, p, i.building as Building);
    return { level, cost };
  }));
  app.post('/api/knight/talk', play((ctx, p) => world.talk(ctx, p)));
  app.post('/api/tutorial', play(async (_ctx, p, i) => {
    p.island.tutorial = Math.max(p.island.tutorial, Math.min(99, Number(i.step) || 0));
  }));
  app.post('/api/lang', play(async (_ctx, p, i) => {
    p.lang = i.lang === 'ru' ? 'ru' : 'en';
  }));
  app.post('/api/hunt/dig', play((ctx, p, i) => world.dig(ctx, p, Number(i.tile))));

  app.post('/api/request', play(async (ctx, p, i) => ({ id: await world.postRequest(ctx, p, i.res as Res, Number(i.amount)) })));
  app.post('/api/request/cancel', play((ctx, p, i) => world.cancelRequest(ctx, p, String(i.id))));
  app.post('/api/caravan', play((ctx, p, i) => world.send(ctx, p, {
    to: i.to ? String(i.to) : undefined, res: i.res as Res | undefined, amount: Number(i.amount), requestId: i.requestId ? String(i.requestId) : null,
  })));
  app.post('/api/trader', play((ctx, p, i) => world.trade(ctx, p, i.side === 'sell' ? 'sell' : 'buy', i.res as Rare, Number(i.amount))));

  app.get('/api/islands', play((ctx, p) => world.islands(ctx, p)));
  app.post('/api/visit', play((ctx, p, i) => world.visit(ctx, p, String(i.id))));
  app.post('/api/like', play(async (ctx, p, i) => ({ liked: await world.like(ctx, p, String(i.id)) })));

  // Treasury addresses stay off the Mini App (Telegram's rule on non-TON chains).
  app.get('/api/top', play(async (ctx) => ({
    players: await world.top(ctx),
    archipelagos: (await world.archipelagos(ctx)).map(({ dao: _dao, ...a }) => a),
  })));
  app.post('/api/archipelago/create', play(async (ctx, p, i) => ({ id: await world.createArchipelago(ctx, p, String(i.name ?? '')) })));
  app.post('/api/archipelago/join', play((ctx, p, i) => world.joinArchipelago(ctx, p, String(i.id))));
  app.post('/api/archipelago/leave', play((ctx, p) => world.leaveArchipelago(ctx, p)));

  // ---- chain: a cron endpoint (Vercel cannot run a background loop) and the public proof feed ----
  app.post('/api/cron/chain', async (c) => {
    const ok = !!cfg.adminKey && (c.req.header('x-admin-key') === cfg.adminKey || c.req.header('authorization') === `Bearer ${cfg.adminKey}`);
    if (!ok) return c.json({ error: 'forbidden' }, 403);
    return c.json((await hooks.processChain?.()) ?? { done: 0, chain: 'off' });
  });

  /** What is on chain, for the rewards site and for judges. Not used by the Mini App. */
  app.get('/api/proof', async (c) => {
    const db = world.db.client;
    const ops = await all<Record<string, unknown>>(db, `SELECT id, kind, payload, status, tx, error, created_at, done_at FROM chain_ops ORDER BY id DESC LIMIT 60`);
    const stats = await all<{ status: string; n: number }>(db, 'SELECT status, COUNT(*) AS n FROM chain_ops GROUP BY status');
    const epochs = await all<Record<string, unknown>>(db, 'SELECT epoch, chain_epoch, root, root_tx, funded, pool, distributed, best_archipelago, closed_at FROM epochs ORDER BY epoch DESC LIMIT 10');
    return c.json({
      network: 'testnet', mode: cfg.chain, gameAccount: cfg.gameAccount, resources: cfg.resourcesContract || `res.${cfg.gameAccount}`, pool: cfg.poolContract || `pool.${cfg.gameAccount}`,
      explorer: 'https://testnet.nearblocks.io',
      queue: Object.fromEntries(stats.map((s) => [s.status, Number(s.n)])),
      ops: ops.map((o) => ({ ...o, payload: JSON.parse(String(o.payload)) })),
      epochs,
    });
  });

  // ---- demo time machine: lets a judge watch a week pass in a minute ----
  app.post('/api/demo/speed', async (c) => {
    const admin = !!cfg.adminKey && c.req.header('x-admin-key') === cfg.adminKey;
    if (!cfg.demoControls && !admin) return c.json({ error: 'forbidden', message: 'demo controls are off' }, 403);
    await world.setSpeed(Number((await body(c)).speed));
    return c.json({ ok: true });
  });

  return app;
}
