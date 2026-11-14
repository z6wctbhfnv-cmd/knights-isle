/**
 * NEAR testnet adapter.
 *
 * Every game account (player, knight, trader) is a sub-account of the game account. The game holds
 * their keys (custodial): each key is derived from one secret, ed25519 seed = HMAC-SHA256(secret, accountId),
 * so the database never stores a private key. Players and knights sign their own token transfers as
 * NEP-366 meta-transactions; the game account relays them and pays the gas.
 */
import { createHmac, createPrivateKey, createPublicKey } from 'node:crypto';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPair, actions, baseEncode, type KeyPairString, type Provider } from 'near-api-js';

export const TGAS = 1_000_000_000_000n;
export const NEAR = 10n ** 24n;
export const MILLI = NEAR / 1000n;

export interface ChainConfig {
  gameAccount: string;
  gameKey: string;
  keySecret: string;
  resources: string;
  pool: string;
  rpc: string[];
  /** NEAR given to each new player, knight or trader account: storage plus a small reserve. */
  accountFunding: bigint;
  daoFactory: string;
  daoDeposit: bigint;
}

/** Derives a deterministic ed25519 key pair for a game-held account. */
export function deriveKey(secret: string, accountId: string): KeyPairString {
  const seed = createHmac('sha256', secret).update(accountId).digest();
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  const pub = Buffer.from(createPublicKey(createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })).export({ format: 'jwk' }).x!, 'base64url');
  return `ed25519:${baseEncode(Buffer.concat([seed, pub]))}` as KeyPairString;
}

export const publicKeyOf = (key: KeyPairString) => KeyPair.fromString(key).getPublicKey().toString();

export function txHash(res: unknown): string {
  const r = res as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
  return r?.transaction?.hash ?? r?.transaction_outcome?.id ?? 'unknown';
}

export class Chain {
  readonly provider: Provider;
  readonly game: Account;
  private accounts = new Map<string, Account>();

  constructor(readonly cfg: ChainConfig) {
    const list = cfg.rpc.map((url) => new JsonRpcProvider({ url }));
    this.provider = list.length > 1 ? new FailoverRpcProvider(list) : list[0];
    this.game = new Account(cfg.gameAccount, this.provider, cfg.gameKey as KeyPairString);
  }

  /** A game-held account, signing with its derived key. */
  account(accountId: string): Account {
    let a = this.accounts.get(accountId);
    if (!a) {
      a = new Account(accountId, this.provider, deriveKey(this.cfg.keySecret, accountId));
      this.accounts.set(accountId, a);
    }
    return a;
  }

  /** Plain JSON-RPC: the failover provider retries (and logs) every "unknown account" answer, which is slow. */
  async exists(accountId: string): Promise<boolean> {
    let last: unknown;
    for (const url of this.cfg.rpc) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'isle', method: 'query', params: { request_type: 'view_account', finality: 'optimistic', account_id: accountId } }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = (await res.json()) as { result?: unknown; error?: unknown };
        if (body.result) return true;
        if (/UNKNOWN_ACCOUNT|does not exist/i.test(JSON.stringify(body.error ?? ''))) return false;
        last = body.error;
      } catch (e) {
        last = e;
      }
    }
    throw new Error(`cannot check account ${accountId}: ${String((last as Error)?.message ?? JSON.stringify(last)).slice(0, 200)}`);
  }

  /** Creates `<prefix>.<game>` with its derived full-access key, in one transaction. Idempotent. */
  async createAccount(accountId: string, funding = this.cfg.accountFunding): Promise<string | null> {
    if (!accountId.endsWith(`.${this.cfg.gameAccount}`)) throw new Error(`${accountId} is not a sub-account of the game account`);
    if (await this.exists(accountId)) return null;
    const res = await this.game.signAndSendTransaction({
      receiverId: accountId,
      actions: [actions.createAccount(), actions.transfer(funding), actions.addFullAccessKey(KeyPair.fromString(deriveKey(this.cfg.keySecret, accountId)).getPublicKey())],
    });
    return txHash(res);
  }

  async view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await this.provider.callFunction({ contractId, method, args })) as T;
  }

  /** A call signed by the game account itself (mint, burn, roots). */
  async call(contractId: string, method: string, args: Record<string, unknown>, deposit = 0n, gas = 100n * TGAS): Promise<string> {
    return txHash(await this.game.callFunctionRaw({ contractId, methodName: method, args, deposit, gas }));
  }

  /**
   * A token transfer signed by the holder (a player, knight or the trader) and relayed by the game
   * account, which pays the gas. The 1 yoctoNEAR the contract requires comes from the holder.
   */
  async transfer(from: string, to: string, token: string, amount: number, memo: string): Promise<string> {
    const holder = this.account(from);
    const { signedDelegate } = await holder.createSignedMetaTransaction({
      receiverId: this.cfg.resources,
      actions: [actions.functionCall('mt_transfer', { receiver_id: to, token_id: token, amount: String(amount), approval: null, memo }, 30n * TGAS, 1n)],
    });
    return txHash(await this.game.relayMetaTransaction(signedDelegate));
  }

  // ---- ChainPort (see ops.ts) ----
  async mintMany(entries: [string, string[], string[]][]): Promise<string> {
    return this.call(this.cfg.resources, 'mint_many', { entries }, 0n, 200n * TGAS);
  }

  async burn(accountId: string, tokens: string[], amounts: string[]): Promise<string> {
    return this.call(this.cfg.resources, 'burn_batch', { account_id: accountId, token_ids: tokens, amounts, memo: null });
  }

  async setEpochRoot(epoch: number, root: string, total: string): Promise<string | null> {
    const pool = await this.view<{ available: string }>(this.cfg.pool, 'get_pool');
    if (BigInt(pool.available) < BigInt(total)) return null;
    return this.call(this.cfg.pool, 'set_epoch_root', { epoch, root, total }, 0n, 30n * TGAS);
  }

  /** Creates `<name>.<factory>` through the Sputnik DAO v2 factory, with the given council. */
  async createDao(name: string, council: string[], purpose: string): Promise<string | null> {
    const deposit = this.cfg.daoDeposit;
    if ((await this.gameBalance()) < deposit + 2n * NEAR) return null;
    const args = Buffer.from(JSON.stringify({ config: { name, purpose, metadata: '' }, policy: council })).toString('base64');
    return this.call(this.cfg.daoFactory, 'create', { name, args }, deposit, 150n * TGAS);
  }

  async gameBalance(): Promise<bigint> {
    return BigInt((await this.provider.viewAccount({ accountId: this.cfg.gameAccount })).amount);
  }

  // ---- RewardsPort (see rewards.ts) ----
  /** The leaf owner (a game-held player account) claims to its own wallet; the game account relays and pays gas. */
  async claimAs(owner: string, chainEpoch: number, amount: string, proof: string[], recipient: string): Promise<string> {
    const { signedDelegate } = await this.account(owner).createSignedMetaTransaction({
      receiverId: this.cfg.pool,
      actions: [actions.functionCall('claim', { epoch: chainEpoch, account_id: owner, amount, proof, recipient }, 60n * TGAS, 0n)],
    });
    return txHash(await this.game.relayMetaTransaction(signedDelegate));
  }

  async claimFor(account: string, chainEpoch: number, amount: string, proof: string[]): Promise<string> {
    return this.call(this.cfg.pool, 'claim', { epoch: chainEpoch, account_id: account, amount, proof, recipient: null }, 0n, 60n * TGAS);
  }

  async isClaimed(chainEpoch: number, account: string): Promise<boolean> {
    return this.view<boolean>(this.cfg.pool, 'is_claimed', { epoch: chainEpoch, account_id: account });
  }

  async pool(): Promise<{ balance: string; reserved: string; available: string }> {
    return this.view(this.cfg.pool, 'get_pool');
  }

  async balances(accountId: string, tokens: readonly string[]): Promise<Record<string, number>> {
    const out = await this.view<string[]>(this.cfg.resources, 'mt_batch_balance_of', { account_id: accountId, token_ids: tokens });
    return Object.fromEntries(tokens.map((t, i) => [t, Number(out[i])]));
  }
}

export function chainFromEnv(raw: Record<string, string | undefined> = process.env): Chain | null {
  const env = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v.trim() !== '')) as Record<string, string | undefined>;
  const { GAME_ACCOUNT, GAME_ACCOUNT_KEY, CHAIN_KEY_SECRET } = env;
  if (!GAME_ACCOUNT || !GAME_ACCOUNT_KEY || !CHAIN_KEY_SECRET) return null;
  return new Chain({
    gameAccount: GAME_ACCOUNT,
    gameKey: GAME_ACCOUNT_KEY,
    keySecret: CHAIN_KEY_SECRET,
    resources: env.RESOURCES_CONTRACT ?? `res.${GAME_ACCOUNT}`,
    pool: env.POOL_CONTRACT ?? `pool.${GAME_ACCOUNT}`,
    rpc: (env.NEAR_RPC ?? 'https://test.rpc.fastnear.com,https://rpc.testnet.near.org').split(',').map((s) => s.trim()).filter(Boolean),
    accountFunding: BigInt(env.ACCOUNT_FUNDING_YOCTO ?? String(5n * MILLI)),
    daoFactory: env.DAO_FACTORY ?? 'sputnikv2.testnet',
    daoDeposit: BigInt(env.DAO_DEPOSIT_YOCTO ?? String(6n * NEAR)),
  });
}
