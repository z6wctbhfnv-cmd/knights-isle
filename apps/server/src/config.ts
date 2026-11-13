const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4310),
  dbUrl: env.TURSO_DATABASE_URL ?? env.DATABASE_URL ?? 'file:data/isle.db',
  dbToken: env.TURSO_AUTH_TOKEN,
  botToken: env.BOT_TOKEN ?? '',
  botUsername: env.BOT_USERNAME ?? '',
  webAppUrl: env.WEBAPP_URL ?? '',
  /** Dev auth: accept `x-dev-user` instead of signed Telegram data. Never enable in production. */
  devAuth: env.DEV_AUTH === '1',
  adminKey: env.ADMIN_KEY ?? '',
  /** Parent account for player sub-accounts, e.g. knights-isle.testnet. Shown only on the rewards site. */
  gameAccount: env.GAME_ACCOUNT ?? 'knights-isle.testnet',
  resourcesContract: env.RESOURCES_CONTRACT ?? '',
  poolContract: env.POOL_CONTRACT ?? '',
  chain: (env.CHAIN ?? 'sim') as 'sim' | 'testnet',
  /** NEAR (yocto) shared out per epoch. Kept small on testnet: the time machine closes an epoch every minute. */
  poolPerEpoch: BigInt(env.POOL_PER_EPOCH_YOCTO ?? '10000000000000000000000'),
  daoFactory: env.DAO_FACTORY ?? 'sputnikv2.testnet',
  /** A Sputnik DAO costs ~6 NEAR on testnet. Past this many, an archipelago's prize share stays in the pool. */
  maxDaos: Number(env.MAX_DAOS ?? 1),
  /** Seed demo neighbours so a single judge has someone to trade with. */
  seedNeighbours: env.SEED_NEIGHBOURS !== '0',
  /** Show the time-machine panel to every player (hackathon demo). */
  demoControls: env.DEMO_CONTROLS === '1',
  webDist: env.WEB_DIST ?? '../web/dist',
};

export type Config = typeof config;
