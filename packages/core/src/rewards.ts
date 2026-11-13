import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { CLAIM_MIN_DAYS, CLAIM_MIN_ISLAND_LEVEL, PLAYER_CAP, PLAYERS_SHARE } from './config.ts';

export interface Score { account: string; points: number; activeDays: number; islandLevel: number }
export interface Payout { account: string; amount: bigint }

export function eligible(s: Pick<Score, 'activeDays' | 'islandLevel'>): boolean {
  return s.activeDays >= CLAIM_MIN_DAYS && s.islandLevel >= CLAIM_MIN_ISLAND_LEVEL;
}

/**
 * Splits an epoch pool (yoctoNEAR).
 * Players get PLAYERS_SHARE by their share of points, each capped; the rest of the pool goes to the best
 * archipelago's treasury. Whatever the cap or eligibility leaves undistributed stays in the pool for the next epoch.
 * On a small server the cap is relaxed to twice the equal share, otherwise a handful of players could never
 * receive most of the pool.
 */
export function splitPool(pool: bigint, scores: Score[], bestTreasury: string | null): { payouts: Payout[]; distributed: bigint; cap: bigint } {
  const ok = scores.filter((s) => s.points > 0 && eligible(s));
  const total = ok.reduce((s, x) => s + x.points, 0);
  const forPlayers = (pool * BigInt(Math.round(PLAYERS_SHARE * 1000))) / 1000n;
  const capShare = Math.max(PLAYER_CAP, ok.length ? 2 / ok.length : 0);
  const cap = capShare >= 1 ? pool : (pool * BigInt(Math.round(capShare * 1e6))) / 1000000n;
  const payouts: Payout[] = [];
  let distributed = 0n;
  for (const s of ok) {
    let amount = (forPlayers * BigInt(s.points)) / BigInt(total);
    if (amount > cap) amount = cap;
    if (amount <= 0n) continue;
    payouts.push({ account: s.account, amount });
    distributed += amount;
  }
  if (bestTreasury && pool > forPlayers) {
    payouts.push({ account: bestTreasury, amount: pool - forPlayers });
    distributed += pool - forPlayers;
  }
  return { payouts, distributed, cap };
}

// Merkle tree. The exact format is shared with contracts/rewards-pool:
//   leaf   = sha256("knights-isle:v1:{epoch}:{account}:{amount}")
//   parent = sha256(min(a, b) ‖ max(a, b)), children ordered bytewise
//   an odd node at the end of a level moves up unchanged

export function leafHash(epoch: number, account: string, amount: bigint): Uint8Array {
  return sha256(utf8ToBytes(`knights-isle:v1:${epoch}:${account}:${amount}`));
}

function less(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

function parent(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [x, y] = less(a, b) ? [a, b] : [b, a];
  const both = new Uint8Array(64);
  both.set(x, 0);
  both.set(y, 32);
  return sha256(both);
}

export interface Tree { root: string; proofs: Record<string, string[]>; leaves: Record<string, string> }

export function buildTree(epoch: number, payouts: Payout[]): Tree {
  if (!payouts.length) throw new Error('empty tree');
  const seen = new Set<string>();
  for (const p of payouts) {
    if (seen.has(p.account)) throw new Error(`duplicate account ${p.account}`);
    seen.add(p.account);
  }
  let level = payouts.map((p) => leafHash(epoch, p.account, p.amount));
  const leaves = Object.fromEntries(payouts.map((p, i) => [p.account, bytesToHex(level[i])]));
  const proofs: string[][] = payouts.map(() => []);
  let index = payouts.map((_, i) => i);
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? parent(level[i], level[i + 1]) : level[i]);
    }
    index = index.map((pos, leaf) => {
      const sibling = pos ^ 1;
      if (sibling < level.length) proofs[leaf].push(bytesToHex(level[sibling]));
      return pos >> 1;
    });
    level = next;
  }
  return { root: bytesToHex(level[0]), proofs: Object.fromEntries(payouts.map((p, i) => [p.account, proofs[i]])), leaves };
}

export function verifyProof(root: string, epoch: number, account: string, amount: bigint, proof: string[]): boolean {
  let node = leafHash(epoch, account, amount);
  for (const sibling of proof) node = parent(node, hexToBytes(sibling));
  return bytesToHex(node) === root.toLowerCase();
}
