import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { webhookCallback } from 'grammy';
import { createApp } from './app.ts';
import { botSecret, createBot } from './bot.ts';
import { config } from './config.ts';
import { chainFromEnv } from './chain.ts';
import { Db } from './db.ts';
import { processOps } from './ops.ts';
import { World } from './world.ts';

const db = await Db.open(config.dbUrl, config.dbToken);
const world = new World(db, config);

// CHAIN=testnet: queued operations go to NEAR. The default (sim) keeps everything local.
let processChain: (() => Promise<unknown>) | undefined;
if (config.chain === 'testnet') {
  const chain = chainFromEnv();
  if (!chain) throw new Error('CHAIN=testnet needs GAME_ACCOUNT, GAME_ACCOUNT_KEY and CHAIN_KEY_SECRET');
  processChain = () => processOps(db, chain);
  if (process.env.CHAIN_LOOP !== '0') {
    const loop = async () => {
      const r = await processOps(db, chain).catch((e) => ({ done: 0, error: String(e) }));
      if (r.done) console.log(`chain: ${r.done} operations sent`);
      if ('error' in r && r.error) console.warn(`chain: stopped: ${r.error.slice(0, 200)}`);
      if ('paused' in r && r.paused) console.warn('chain: paused, the game account is low on NEAR');
      setTimeout(loop, 4000);
    };
    void loop();
  }
}
const app = createApp(world, config, { processChain });

// The bot: a webhook when the game has a public https address, long polling otherwise (local runs).
if (config.botToken) {
  const { bot, notify, setup } = createBot(world, config);
  await bot.init();
  const webhook = config.webAppUrl.startsWith('https://') && process.env.BOT_MODE !== 'polling';
  if (webhook) {
    const secretToken = botSecret(config.botToken);
    app.post('/api/bot', webhookCallback(bot, 'hono', { secretToken }));
    await bot.api.setWebhook(new URL('/api/bot', config.webAppUrl).toString(), { secret_token: secretToken, drop_pending_updates: true });
  } else {
    await bot.api.deleteWebhook();
    void bot.start({ drop_pending_updates: true });
  }
  await setup().catch((e) => console.warn('bot: setup failed:', e.message));
  console.log(`bot @${bot.botInfo.username} (${webhook ? 'webhook' : 'polling'})`);
  const loop = async () => {
    await notify().catch((e) => console.warn('bot: notify failed:', e.message));
    setTimeout(loop, 60_000);
  };
  setTimeout(loop, 10_000);
}

// In production the same server also hands out the built Mini App.
const dist = resolve(config.webDist);
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: config.webDist }));
  app.get('*', serveStatic({ path: `${config.webDist}/index.html` }));
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Knight's Isle server on http://localhost:${info.port}  (auth: ${config.devAuth ? 'DEV' : 'telegram'}, chain: ${config.chain})`);
});
