/**
 * Claims one epoch leaf from the rewards pool, as a third party: the NEAR goes to the leaf's own account
 * (this is how an archipelago treasury is paid).
 *   DATABASE_URL=file:apps/server/data/testnet.db npx tsx --env-file=.env scripts/claim.ts <epoch> <account>
 */
import { NEAR, TGAS, chainFromEnv } from '../apps/server/src/chain.ts';
import { Db, all } from '../apps/server/src/db.ts';

const chain = chainFromEnv()!;
const db = await Db.open(process.env.DATABASE_URL ?? 'file:apps/server/data/testnet.db');
const [epochArg, account] = process.argv.slice(2);
const [row] = await all<{ chain_epoch: number; payouts: string }>(db.client, 'SELECT chain_epoch, payouts FROM epochs WHERE epoch = ?', [Number(epochArg)]);
const leaf = (JSON.parse(row.payouts) as { account: string; amount: string; proof: string[] }[]).find((p) => p.account === account)!;
const before = BigInt((await chain.provider.viewAccount({ accountId: account })).amount);
const tx = await chain.call(chain.cfg.pool, 'claim', { epoch: Number(row.chain_epoch), account_id: account, amount: leaf.amount, proof: leaf.proof, recipient: null }, 0n, 60n * TGAS);
const after = BigInt((await chain.provider.viewAccount({ accountId: account })).amount);
console.log(`claim ${account} epoch ${row.chain_epoch}: +${Number(after - before) / Number(NEAR)} NEAR, tx https://testnet.nearblocks.io/txns/${tx}`);
