import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client, type InValue, type Transaction } from '@libsql/client';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  tg_id TEXT,
  name TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  npc INTEGER NOT NULL DEFAULT 0,
  island TEXT NOT NULL,
  ledger TEXT NOT NULL DEFAULT '{}',
  archipelago_id TEXT,
  ref_by TEXT,
  ref_xp INTEGER NOT NULL DEFAULT 0,
  ref_marks TEXT NOT NULL DEFAULT '[]',
  likes INTEGER NOT NULL DEFAULT 0,
  wallet TEXT,
  notified TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS caravans (
  id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, res TEXT NOT NULL, amount INTEGER NOT NULL,
  depart_at INTEGER NOT NULL, arrive_at INTEGER NOT NULL, request_id TEXT, status TEXT NOT NULL,
  event TEXT, lost INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0, epoch INTEGER NOT NULL, rewarded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS caravans_due ON caravans (status, arrive_at);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, res TEXT NOT NULL, amount INTEGER NOT NULL,
  filled INTEGER NOT NULL DEFAULT 0, promised INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, epoch INTEGER NOT NULL, kind TEXT NOT NULL,
  amount INTEGER NOT NULL, note TEXT, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS points_epoch ON points (epoch, player_id);
CREATE TABLE IF NOT EXISTS visits (from_id TEXT NOT NULL, to_id TEXT NOT NULL, day INTEGER NOT NULL, liked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (from_id, to_id, day));
CREATE TABLE IF NOT EXISTS archipelagos (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, dao TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
  at INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_player ON events (player_id, seen);
CREATE TABLE IF NOT EXISTS epochs (
  epoch INTEGER PRIMARY KEY, root TEXT, pool TEXT NOT NULL, distributed TEXT NOT NULL, payouts TEXT NOT NULL,
  best_archipelago TEXT, closed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS claims (
  epoch INTEGER NOT NULL, account TEXT NOT NULL, recipient TEXT NOT NULL, amount TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (epoch, account)
);
CREATE TABLE IF NOT EXISTS chain_ops (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  tx TEXT, error TEXT, tries INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, done_at INTEGER
);
CREATE INDEX IF NOT EXISTS chain_ops_status ON chain_ops (status, id);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export type Tx = Transaction;

export class Db {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(public client: Client) {}

  static async open(url: string, authToken?: string): Promise<Db> {
    if (url.startsWith('file:')) mkdirSync(dirname(url.slice(5)) || '.', { recursive: true });
    const client = createClient({ url, authToken });
    await client.executeMultiple(SCHEMA);
    // Columns added after the first local databases were created.
    for (const sql of [
      'ALTER TABLE epochs ADD COLUMN chain_epoch INTEGER',
      'ALTER TABLE epochs ADD COLUMN root_tx TEXT',
      'ALTER TABLE epochs ADD COLUMN funded INTEGER',
      'ALTER TABLE archipelagos ADD COLUMN dao_status TEXT',
      'ALTER TABLE events ADD COLUMN pushed INTEGER NOT NULL DEFAULT 0',
    ]) await client.execute(sql).catch(() => {});
    return new Db(client);
  }

  /** One write transaction at a time: every game request reads, ticks the world and writes. */
  write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const tx = await this.client.transaction('write');
      try {
        const out = await fn(tx);
        await tx.commit();
        return out;
      } catch (e) {
        await tx.rollback().catch(() => {});
        throw e;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

export async function all<T = Record<string, unknown>>(tx: Tx | Client, sql: string, args: InValue[] = []): Promise<T[]> {
  const r = await tx.execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function one<T = Record<string, unknown>>(tx: Tx | Client, sql: string, args: InValue[] = []): Promise<T | null> {
  return (await all<T>(tx, sql, args))[0] ?? null;
}

export async function run(tx: Tx | Client, sql: string, args: InValue[] = []): Promise<void> {
  await tx.execute({ sql, args });
}

export async function getMeta<T>(tx: Tx | Client, key: string): Promise<T | null> {
  const row = await one<{ value: string }>(tx, 'SELECT value FROM meta WHERE key = ?', [key]);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function setMeta(tx: Tx | Client, key: string, value: unknown): Promise<void> {
  await run(tx, 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
}
