// Creates a top-level testnet account through the public faucet helper.
// The private key goes only to .env (mode 600) and is never printed.
import { appendFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { KeyPair } from 'near-api-js';

const accountId = process.argv[2];
const envFile = new URL('../.env', import.meta.url);
const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
if (/^GAME_ACCOUNT=/m.test(env)) { console.log('GAME_ACCOUNT already in .env, nothing to do'); process.exit(0); }
const kp = KeyPair.fromRandom('ed25519');
const pub = kp.getPublicKey().toString();
const helpers = ['https://helper.nearprotocol.com/account', 'https://helper.testnet.near.org/account'];
for (const url of helpers) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: pub }), signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    console.log(url, res.status, text.slice(0, 200).replace(/ed25519:[A-Za-z0-9]{40,}/g, 'ed25519:<redacted>'));
    if (res.ok) {
      appendFileSync(envFile, `GAME_ACCOUNT=${accountId}\nGAME_ACCOUNT_KEY=${kp.toString()}\n`);
      chmodSync(envFile, 0o600);
      console.log('saved key for', accountId, 'to .env');
      process.exit(0);
    }
  } catch (e) {
    console.log(url, 'failed:', e.message);
  }
}
process.exit(1);
