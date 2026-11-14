/**
 * Tops up the game account from the public testnet faucet: creates a temporary account, then deletes it
 * with the game account as beneficiary, so its whole balance moves over. The temporary key lives only in memory.
 *   npx tsx --env-file=.env scripts/faucet-topup.ts
 */
import { Account, KeyPair, actions, type KeyPairString } from 'near-api-js';
import { chainFromEnv } from '../apps/server/src/chain.ts';

const chain = chainFromEnv()!;
const game = chain.cfg.gameAccount;
const tmp = `ki-topup-${Date.now().toString(36)}.testnet`;
const kp = KeyPair.fromRandom('ed25519');
const res = await fetch('https://helper.nearprotocol.com/account', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ newAccountId: tmp, newAccountPublicKey: kp.getPublicKey().toString() }), signal: AbortSignal.timeout(60000),
});
console.log('faucet', res.status);
if (!res.ok) process.exit(1);
await new Promise((r) => setTimeout(r, 3000));
const before = BigInt((await chain.provider.viewAccount({ accountId: game })).amount);
const acc = new Account(tmp, chain.provider, kp.toString() as KeyPairString);
const out = await acc.signAndSendTransaction({ receiverId: tmp, actions: [actions.deleteAccount(game)] });
const after = BigInt((await chain.provider.viewAccount({ accountId: game })).amount);
console.log('moved', ((Number(after - before)) / 1e24).toFixed(4), 'NEAR to', game, 'tx', (out as any).transaction?.hash, 'now', (Number(after) / 1e24).toFixed(4));
