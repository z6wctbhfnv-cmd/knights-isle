/**
 * Compares every player's game balances with their on-chain balances (resources contract).
 * Meaningful once the queue is empty.
 *   DATABASE_URL=file:apps/server/data/testnet.db npx tsx --env-file=.env scripts/check-chain.ts
 */
import { RESOURCES } from '../packages/core/src/config.ts';
import { chainFromEnv } from '../apps/server/src/chain.ts';
import { Db, all } from '../apps/server/src/db.ts';

const chain = chainFromEnv()!;
const db = await Db.open(process.env.DATABASE_URL ?? 'file:apps/server/data/testnet.db');
const pending = await all<{ n: number }>(db.client, "SELECT COUNT(*) AS n FROM chain_ops WHERE status = 'pending'");
console.log('pending operations:', Number(pending[0].n));
const players = await all<{ id: string; name: string; ledger: string }>(db.client, 'SELECT id, name, ledger FROM players ORDER BY created_at');
let bad = 0;
for (const p of players) {
  const account = `${p.id}.${chain.cfg.gameAccount}`;
  const ledger = JSON.parse(p.ledger) as Record<string, number>;
  const onChain = await chain.balances(account, RESOURCES);
  const diff = RESOURCES.filter((r) => (ledger[r] ?? 0) !== onChain[r]);
  if (diff.length) bad++;
  console.log(`${diff.length ? 'DIFF' : 'ok  '} ${p.name.padEnd(10)} ${account.padEnd(40)} ${RESOURCES.map((r) => `${r}=${onChain[r]}${diff.includes(r) ? `(game ${ledger[r] ?? 0})` : ''}`).join(' ')}`);
}
console.log(bad ? `${bad} players differ` : 'all players match');
