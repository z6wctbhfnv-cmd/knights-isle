/**
 * One-off testnet setup and proof run.
 *   npx tsx --env-file=.env scripts/testnet-setup.ts
 * 1. Deploys contracts/resources to res.<game> and contracts/rewards-pool to pool.<game> (deploy + init in one tx).
 * 2. Lets the game account mint.
 * 3. Proves the whole path on chain with throwaway accounts: mint -> player -> knight -> neighbour
 *    (meta-transactions relayed by the game account), pool deposit, a 2-leaf epoch root, a claim.
 * Prints tx hashes and what each step cost the game account. Never prints keys.
 */
import { randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, readFileSync } from 'node:fs';
import { KeyPair, actions } from 'near-api-js';
import { buildTree } from '../packages/core/src/rewards.ts';
import { MILLI, NEAR, TGAS, chainFromEnv, txHash } from '../apps/server/src/chain.ts';

const envPath = new URL('../.env', import.meta.url);
if (!process.env.CHAIN_KEY_SECRET) {
  const secret = randomBytes(32).toString('hex');
  appendFileSync(envPath, `CHAIN_KEY_SECRET=${secret}\n`);
  chmodSync(envPath, 0o600);
  process.env.CHAIN_KEY_SECRET = secret;
  console.log('generated CHAIN_KEY_SECRET into .env');
}
const chain = chainFromEnv()!;
const { gameAccount, resources, pool } = chain.cfg;
const explorer = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
const balance = async () => BigInt((await chain.provider.viewAccount({ accountId: gameAccount })).amount);
const near = (y: bigint) => (Number(y) / 1e24).toFixed(5);
let last = await balance();
const log: string[] = [];
async function step(name: string, fn: () => Promise<string | null>) {
  const t0 = Date.now();
  const hash = await fn();
  const now = await balance();
  const line = `${name.padEnd(44)} ${hash ? explorer(hash) : '(already done)'}  cost ${near(last - now)} NEAR  ${Date.now() - t0} ms`;
  console.log(line);
  log.push(line);
  last = now;
}

const gamePub = KeyPair.fromString(chain.cfg.gameKey as never).getPublicKey();
async function deploy(accountId: string, wasm: string, funding: bigint) {
  if (await chain.exists(accountId)) return null;
  const code = readFileSync(new URL(`../contracts/${wasm}`, import.meta.url));
  const res = await chain.game.signAndSendTransaction({
    receiverId: accountId,
    actions: [
      actions.createAccount(),
      actions.transfer(funding),
      actions.addFullAccessKey(gamePub),
      actions.deployContract(new Uint8Array(code)),
      actions.functionCall('new', { owner_id: gameAccount }, 30n * TGAS, 0n),
    ],
  });
  return txHash(res);
}

console.log(`game account ${gameAccount}: ${near(last)} NEAR`);
await step(`deploy ${resources}`, () => deploy(resources, 'resources/target/near/knights_isle_resources.wasm', 2_400n * MILLI));
await step(`deploy ${pool}`, () => deploy(pool, 'rewards-pool/target/near/knights_isle_rewards_pool.wasm', 1_900n * MILLI));
await step('add_minter(game)', async () => ((await chain.view<boolean>(resources, 'is_minter', { account_id: gameAccount })) ? null : chain.call(resources, 'add_minter', { account_id: gameAccount })));

const A = `proof-a.${gameAccount}`;
const K = `knight-proof-a.${gameAccount}`;
const B = `proof-b.${gameAccount}`;
for (const id of [A, K, B]) await step(`create ${id}`, () => chain.createAccount(id));
const before = await chain.balances(B, ['ice']);
await step(`mint 20 ice -> ${A}`, () => chain.call(resources, 'mint_batch', { account_id: A, token_ids: ['ice'], amounts: ['20'], memo: 'proof' }));
await step(`player -> knight 15 ice (meta-tx)`, () => chain.transfer(A, K, 'ice', 15, 'caravan proof departs'));
await step(`knight -> neighbour 12 ice (meta-tx)`, () => chain.transfer(K, B, 'ice', 12, 'caravan proof arrives'));
const bal = { A: await chain.balances(A, ['ice']), K: await chain.balances(K, ['ice']), B: await chain.balances(B, ['ice']) };
console.log('balances after caravan', JSON.stringify(bal), 'B before', before.ice);
if (bal.A.ice !== 5 || bal.K.ice !== 3 || bal.B.ice !== before.ice + 12) throw new Error('token balances do not match the expected caravan result');

await step('pool deposit 0.3 NEAR', () => chain.call(pool, 'deposit', {}, 300n * MILLI, 30n * TGAS));
const epoch = 9_000_000 + Math.floor(Date.now() / 1000) % 100000;
const payouts = [{ account: A, amount: 10n * MILLI }, { account: B, amount: 20n * MILLI }];
const tree = buildTree(epoch, payouts);
await step(`set_epoch_root(${epoch}) total 0.03`, () => chain.call(pool, 'set_epoch_root', { epoch, root: tree.root, total: String(30n * MILLI) }, 0n, 30n * TGAS));
const ok = await chain.view<boolean>(pool, 'verify_claim', { epoch, account_id: B, amount: String(20n * MILLI), proof: tree.proofs[B] });
console.log('verify_claim on chain for', B, ok);
const bBefore = BigInt((await chain.provider.viewAccount({ accountId: B })).amount);
await step(`claim for ${B} (third party)`, () => chain.call(pool, 'claim', { epoch, account_id: B, amount: String(20n * MILLI), proof: tree.proofs[B], recipient: null }, 0n, 60n * TGAS));
const bAfter = BigInt((await chain.provider.viewAccount({ accountId: B })).amount);
console.log('B received', near(bAfter - bBefore), 'NEAR; pool', JSON.stringify(await chain.view(pool, 'get_pool')), 'epoch', JSON.stringify(await chain.view(pool, 'get_epoch', { epoch })));
if (bAfter - bBefore !== 20n * MILLI) throw new Error('claim did not pay the expected amount');
console.log(`\ngame account left: ${near(await balance())} NEAR`);
void NEAR;
