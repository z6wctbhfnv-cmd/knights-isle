/**
 * Creates a separate testnet wallet through the faucet, to receive claimed rewards in the demo.
 * Its name and key go to .env as DEMO_WALLET / DEMO_WALLET_KEY; the key is never printed.
 */
import { appendFileSync, chmodSync } from 'node:fs';
import { KeyPair } from 'near-api-js';

if (process.env.DEMO_WALLET) { console.log('DEMO_WALLET already set:', process.env.DEMO_WALLET); process.exit(0); }
const id = process.argv[2] ?? 'knights-isle-demo.testnet';
const kp = KeyPair.fromRandom('ed25519');
const res = await fetch('https://helper.nearprotocol.com/account', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }), signal: AbortSignal.timeout(60000),
});
console.log('faucet', res.status);
if (!res.ok) process.exit(1);
appendFileSync(new URL('../.env', import.meta.url), `DEMO_WALLET=${id}\nDEMO_WALLET_KEY=${kp.toString()}\n`);
chmodSync(new URL('../.env', import.meta.url), 0o600);
console.log('created', id);
