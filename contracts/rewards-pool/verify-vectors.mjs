#!/usr/bin/env node
// Independent cross-check of test-vectors.json.
//
// Re-implements the Knight's Isle merkle format from its written spec with
// node:crypto only (no code shared with the Rust contract), rebuilds the tree
// from the (account_id, amount) pairs in the file and compares every leaf,
// every proof and the root. Exits 1 on any mismatch.
//
//   node verify-vectors.mjs [path/to/test-vectors.json]
//
// Format:
//   leaf   = sha256(utf8(`knights-isle:v1:${epoch}:${account_id}:${amount}`))
//   parent = sha256(min(a, b) || max(a, b))      (bytewise comparison)
//   a level with an odd node count promotes its last node unchanged
//   proof  = sibling hashes from the leaf level upward, lowercase hex
//   a single-leaf tree: root == leaf, proof == []

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest();

export function leafHash(epoch, accountId, amount) {
  return sha256(Buffer.from(`knights-isle:v1:${epoch}:${accountId}:${amount}`, "utf8"));
}

export function parentHash(a, b) {
  return Buffer.compare(a, b) <= 0 ? sha256(Buffer.concat([a, b])) : sha256(Buffer.concat([b, a]));
}

/** Returns { root, proofs } (Buffers); proofs[i] belongs to leaves[i]. */
export function buildTree(leaves) {
  if (leaves.length === 0) throw new Error("no leaves");
  const proofs = leaves.map(() => []);
  let level = leaves.map((hash, i) => ({ hash, members: [i] }));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      if (right === undefined) {
        next.push(left); // odd node: promoted unchanged, nothing added to proofs
        continue;
      }
      for (const m of left.members) proofs[m].push(right.hash);
      for (const m of right.members) proofs[m].push(left.hash);
      next.push({
        hash: parentHash(left.hash, right.hash),
        members: [...left.members, ...right.members],
      });
    }
    level = next;
  }
  return { root: level[0].hash, proofs };
}

export function rootFromProof(leaf, proof) {
  return proof.reduce((node, sibling) => parentHash(node, sibling), leaf);
}

const SHAPES_DIGEST = "5a0c3e6a810bc2f1ddfcbe9591942cb001a99f422bdece7e0ccfe8ace8124169";

/**
 * sha256 over, for n = 1..33: root || every proof item (leaves in order), for
 * leaves (epoch n, `tg${i}.isle.testnet`, i + 1), i in 0..n-1.
 */
export function shapesDigest() {
  const digest = createHash("sha256");
  for (let n = 1; n <= 33; n++) {
    const leaves = [];
    for (let i = 0; i < n; i++) leaves.push(leafHash(n, `tg${i}.isle.testnet`, String(i + 1)));
    const tree = buildTree(leaves);
    digest.update(tree.root);
    for (const proof of tree.proofs) for (const sibling of proof) digest.update(sibling);
  }
  return digest.digest("hex");
}

function main() {
  const path = process.argv[2] ?? fileURLToPath(new URL("./test-vectors.json", import.meta.url));
  const vectors = JSON.parse(readFileSync(path, "utf8"));
  const errors = [];
  const check = (ok, message) => {
    if (!ok) errors.push(message);
  };
  const isHash = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);

  check(Number.isSafeInteger(vectors.epoch), "epoch must be an integer");
  check(isHash(vectors.root), "root must be 64 lowercase hex chars");
  check(Array.isArray(vectors.leaves) && vectors.leaves.length > 0, "leaves must be a non-empty array");

  const leaves = vectors.leaves.map((l) => leafHash(vectors.epoch, l.account_id, l.amount));
  const tree = buildTree(leaves);

  check(tree.root.toString("hex") === vectors.root, `root: file ${vectors.root}, computed ${tree.root.toString("hex")}`);

  vectors.leaves.forEach((l, i) => {
    const tag = `leaf ${i} (${l.account_id})`;
    check(typeof l.amount === "string" && /^(0|[1-9][0-9]*)$/.test(l.amount), `${tag}: amount must be a decimal string without padding`);
    check(leaves[i].toString("hex") === l.leaf, `${tag}: leaf hash differs`);
    check(Array.isArray(l.proof) && l.proof.every(isHash), `${tag}: proof must be lowercase hex hashes`);
    const computed = tree.proofs[i].map((h) => h.toString("hex"));
    check(JSON.stringify(computed) === JSON.stringify(l.proof), `${tag}: proof differs from the rebuilt tree`);
    // The verifier's view: fold the proof from the file, expect the root from the file.
    const folded = rootFromProof(leaves[i], l.proof.map((h) => Buffer.from(h, "hex")));
    check(folded.toString("hex") === vectors.root, `${tag}: proof from the file does not lead to the root`);
    // A changed amount must not verify.
    const forged = leafHash(vectors.epoch, l.account_id, `${l.amount}0`);
    const forgedRoot = rootFromProof(forged, l.proof.map((h) => Buffer.from(h, "hex")));
    check(forgedRoot.toString("hex") !== vectors.root, `${tag}: a forged amount verified`);
  });

  // Single-leaf rule.
  const single = buildTree([leaves[0]]);
  check(single.root.equals(leaves[0]) && single.proofs[0].length === 0, "single-leaf tree: root != leaf or proof not empty");

  // Every tree shape from 1 to 33 leaves. The Rust unit test
  // `every_proof_verifies_for_tree_sizes_1_to_33` asserts the same digest.
  check(shapesDigest() === SHAPES_DIGEST, `tree shapes 1..33: digest ${shapesDigest()}, expected ${SHAPES_DIGEST}`);

  if (errors.length > 0) {
    console.error(`FAIL ${path}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${vectors.leaves.length} leaves, epoch ${vectors.epoch}, root ${vectors.root}; tree shapes 1..33 match`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
