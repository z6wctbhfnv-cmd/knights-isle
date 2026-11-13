# Knight's Isle — contracts

Two NEAR smart contracts (Rust, `near-sdk` 5.27.0), each a standalone crate with its own `Cargo.lock`.

| Crate | What | Wasm |
|---|---|---|
| [`resources/`](resources) | Game resources as a NEP-245 multi-token: 7 fungible ids, minted and burned by the game backend, moved between players by caravans | `resources/target/near/knights_isle_resources.wasm`, 214.4 KB (214 437 bytes) |
| [`rewards-pool/`](rewards-pool) | Weekly NEAR reward pool: anyone deposits, the backend publishes one merkle root per epoch, players and DAO treasuries claim with a proof | `rewards-pool/target/near/knights_isle_rewards_pool.wasm`, 169.6 KB (169 573 bytes) |

Nothing here is deployed. The commands in "Deploy" are documentation and were not run.

## Build and test

```sh
cd contracts/resources      # or contracts/rewards-pool
cargo test
cargo near build non-reproducible-wasm     # cargo-near 0.22.0
```

`rust-toolchain.toml` pins Rust 1.86.0 with the `wasm32-unknown-unknown` target. Newer compilers emit wasm features that nearcore rejects, and near-sdk 5.27 is the last line that builds on 1.86.

```sh
cd contracts/rewards-pool
node verify-vectors.mjs                       # independent check of test-vectors.json
UPDATE_TEST_VECTORS=1 cargo test vectors      # regenerate test-vectors.json from Rust
```

## 1. `resources` — NEP-245 multi-token

Token ids, fixed: `energy`, `materials`, `credits`, `ice`, `fruit`, `glass`, `wood`. Amounts are whole units (no decimals). In JSON every amount is a decimal string (`U128`).

Roles:
- **owner** — set in `new`; manages the minter list. The owner is not a minter unless added.
- **minters** — the game backend. They mint what buildings produced and burn what a player spent.
- **players** — hold balances and transfer them with `mt_transfer` / `mt_batch_transfer`.

### Methods

| Method | Kind | Who | Notes |
|---|---|---|---|
| `new(owner_id)` | init | deployer | |
| `add_minter(account_id) -> bool` | call | owner | `false` if already a minter |
| `remove_minter(account_id) -> bool` | call | owner | `false` if it was not a minter |
| `get_minters() -> AccountId[]` | view | | |
| `is_minter(account_id) -> bool` | view | | |
| `get_owner() -> AccountId` | view | | |
| `get_token_ids() -> string[]` | view | | The 7 ids in fixed order |
| `mint_batch(account_id, token_ids, amounts, memo?)` | call | minter | Emits `mt_mint` |
| `mint_many(entries)` | call | minter | `entries = [[account_id, token_ids, amounts], ...]`. All or nothing. Emits one `mt_mint` event with one `data` entry per player |
| `burn_batch(account_id, token_ids, amounts, memo?)` | call | minter | Panics if a balance is too low. Emits `mt_burn` with `authorized_id` = the minter |
| `mt_transfer(receiver_id, token_id, amount, approval, memo)` | call, **1 yocto** | token holder | `approval` must be `null`. Emits `mt_transfer` |
| `mt_batch_transfer(receiver_id, token_ids, amounts, approvals, memo)` | call, **1 yocto** | token holder | `approvals` must be `null`. Emits one `mt_transfer` |
| `mt_balance_of(account_id, token_id) -> string` | view | | `"0"` for an unknown account or token id |
| `mt_batch_balance_of(account_id, token_ids) -> string[]` | view | | |
| `mt_supply(token_id) -> string \| null` | view | | `null` for an unknown token id |
| `mt_batch_supply(token_ids) -> (string \| null)[]` | view | | |
| `mt_token(token_ids) -> (Token \| null)[]` | view | | `{ token_id, owner_id: null, base_metadata_id }` |
| `mt_metadata_contract()` | view | | `{ spec: "mt-1.0.0", name: "Knight's Isle Resources" }` |
| `mt_metadata_token_all(token_ids)` | view | | `[{ base, token }]`. Panics on an unknown id |
| `mt_metadata_base_by_token_id(token_ids)` | view | | `{ name, id, symbol, decimals: "0", icon/base_uri/reference/copies/reference_hash: null }` |
| `mt_metadata_token_by_token_id(token_ids)` | view | | `{ title, ...null }` |
| `mt_metadata_base_by_metadata_id(base_metadata_ids)` | view | | Base metadata id = token id |

Rules for every `(token_ids, amounts)` pair (mint, burn, transfer): same length, not empty, known ids only, no id twice, every amount > 0. `memo` is at most 256 bytes. Any violation panics and nothing changes.

The sender of a transfer is the **predecessor** account (the caller), as in every NEAR token contract. With a relayer (NEP-366 meta-transaction) that is still the player's account.

### Events

NEP-297 log lines in NEP-245 shape, one line per call:

```
EVENT_JSON:{"standard":"nep245","version":"1.0.0","event":"mt_mint","data":[{"owner_id":"tg1.isle.testnet","token_ids":["ice","wood"],"amounts":["20","5"],"memo":"tick 7"}]}
EVENT_JSON:{"standard":"nep245","version":"1.0.0","event":"mt_burn","data":[{"owner_id":"tg1.isle.testnet","authorized_id":"backend.isle.testnet","token_ids":["ice"],"amounts":["8"]}]}
EVENT_JSON:{"standard":"nep245","version":"1.0.0","event":"mt_transfer","data":[{"old_owner_id":"tg1.isle.testnet","new_owner_id":"tg2.isle.testnet","token_ids":["ice"],"amounts":["20"],"memo":"caravan #4"}]}
```

`memo` is left out when it is null.

### Batch size of `mint_many`

NEAR limits all logs of one call to 16 384 bytes, and the whole batch is one event. The contract checks this itself and panics with `Batch is too large ...` so that nothing is minted half-way. In the unit tests 100 players × 3 tokens with small amounts fit, and the worst case (64-char accounts, all 7 tokens, 36-digit amounts) fits 35 players. Gas for a batch was **not** measured (see limitations); start with about 50 players per call.

### Storage

There is no storage-deposit registration (no NEP-145). The **contract account pays** for all storage: about 0.001 NEAR per non-zero `(account, token)` balance (estimate). Zero balances are deleted. Keep spare NEAR on the contract account.

## 2. `rewards-pool` — weekly pool with merkle claim

Flow: `deposit()` → once per epoch the owner calls `set_epoch_root(epoch, root, total)` → every leaf is claimed with `claim(...)`.

Accounting (yoctoNEAR): `balance` = deposited and not yet paid out; `reserved` = promised to epochs and not yet claimed; `available = balance - reserved`. `balance` is tracked by the contract and is separate from the account's NEAR balance, which also pays for storage.

### Methods

| Method | Kind | Who | Notes |
|---|---|---|---|
| `new(owner_id)` | init | deployer | |
| `deposit()` | call, **payable** | anyone | Adds the attached NEAR to the pool. Panics on 0 |
| `get_pool() -> { balance, reserved, available }` | view | | Decimal strings |
| `set_epoch_root(epoch, root, total)` | call | owner | `root`: 64 hex chars. One root per epoch (panics if set). Requires `0 < total <= available`; moves `total` into `reserved` |
| `claim(epoch, account_id, amount, proof, recipient?) -> bool` | call | anyone | See below. Attach at least 50 Tgas |
| `get_epoch(epoch) -> { root, total, claimed_total, claims } \| null` | view | | `epoch` and `claims` are JSON numbers |
| `is_claimed(epoch, account_id) -> bool` | view | | Also `true` while the payout transfer is in flight |
| `verify_claim(epoch, account_id, amount, proof) -> bool` | view | | Checks the proof only (not the claimed flag); `false` for an unknown epoch |
| `latest_epoch() -> u64 \| null` | view | | Highest epoch number with a root |
| `get_owner() -> AccountId` | view | | |
| `on_claim_settled(...)` | private callback | contract | Not callable from outside |

### `claim`

1. Checks `amount > 0`, the epoch has a root, `(epoch, account_id)` is not claimed, the proof leads to the root, and `claimed_total + amount <= total`.
2. Payout target:
   - caller == `account_id`: pays `recipient`, or `account_id` if `recipient` is null (a player sends the reward to their own wallet);
   - any other caller: `recipient` must be null, pays `account_id` (how a DAO treasury leaf is paid: anyone triggers it, the NEAR goes to the DAO).
3. Marks the claim, lowers `balance` and `reserved`, transfers the NEAR.
4. Callback `on_claim_settled`: if the transfer failed (for example the receiving account does not exist) the NEAR comes back, the claim is un-marked and the amount is reserved again, so it can be claimed again. The call returns `true` (paid) or `false` (restored).

### Events

Standard `knights-isle-rewards`, version `1.0.0`, NEP-297 format, `data` is an array with one object:

| Event | `data[0]` | When |
|---|---|---|
| `deposit` | `{ account_id, amount, balance }` | `deposit()` |
| `epoch_root_set` | `{ epoch, root, total }` | `set_epoch_root()` |
| `claim` | `{ epoch, account_id, amount, recipient }` | the payout transfer **succeeded** |
| `claim_failed` | same | the payout transfer failed and the claim was restored |

### Merkle format

This is the contract between the Rust code and the TypeScript tree builder. All hashes are SHA-256.

- **leaf** = `sha256(utf8("knights-isle:v1:{epoch}:{account_id}:{amount}"))`. `epoch` and `amount` are decimal with no padding; `amount` is in yoctoNEAR. Example string: `knights-isle:v1:3:tg3.isle.testnet:1`.
- **parent** = `sha256(min(a, b) ‖ max(a, b))`: the two 32-byte children ordered by bytewise lexicographic comparison, then concatenated (64 bytes).
- **odd level**: the last node is promoted to the next level unchanged. No sibling is added to its proof at that level.
- **proof** = sibling hashes from the leaf level upward, lowercase hex. The contract also accepts uppercase hex and returns lowercase.
- **root** = 64 lowercase hex chars. A single-leaf tree has `root == leaf` and an empty proof.
- The order of the leaves is not part of the format (verification does not depend on it), but it changes the root. The builder must keep one order from building the tree to handing out proofs. An account must appear at most once per epoch: the contract pays one claim per `(epoch, account_id)`.

Test vectors: [`rewards-pool/test-vectors.json`](rewards-pool/test-vectors.json) — 5 leaves at epoch 3 in the listed order, root `462c2ca4cd36d32dc337222ed40f56b2b9d017c7d6595435e51dfcb1a88d85dc`. The Rust test `test_vectors_file_matches_the_contract` fails if the file and the contract disagree. `verify-vectors.mjs` rebuilds the tree from the spec with `node:crypto` only. Both also assert one shared digest over every tree shape from 1 to 33 leaves.

## Deploy (testnet, near-cli-rs) — documentation only, not run

Replace `isle.testnet` with the real game account. Each contract account needs NEAR for storage: about 1 NEAR per 100 KB of wasm plus state, so fund 4 NEAR each to be safe.

```sh
# 0. Build
(cd contracts/resources && cargo near build non-reproducible-wasm)
(cd contracts/rewards-pool && cargo near build non-reproducible-wasm)

# 1. Contract accounts (sub-accounts of the game account)
near account create-account fund-myself resources.isle.testnet '4 NEAR' autogenerate-new-keypair save-to-keychain sign-as isle.testnet network-config testnet sign-with-keychain send
near account create-account fund-myself pool.isle.testnet '4 NEAR' autogenerate-new-keypair save-to-keychain sign-as isle.testnet network-config testnet sign-with-keychain send

# 2. Deploy + init
near contract deploy resources.isle.testnet use-file contracts/resources/target/near/knights_isle_resources.wasm with-init-call new json-args '{"owner_id":"isle.testnet"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract deploy pool.isle.testnet use-file contracts/rewards-pool/target/near/knights_isle_rewards_pool.wasm with-init-call new json-args '{"owner_id":"isle.testnet"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send

# 3. Let the backend account mint and burn
near contract call-function as-transaction resources.isle.testnet add_minter json-args '{"account_id":"backend.isle.testnet"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as isle.testnet network-config testnet sign-with-keychain send

# 4. Smoke test: resources
near contract call-function as-transaction resources.isle.testnet mint_batch json-args '{"account_id":"tg1.isle.testnet","token_ids":["ice","wood"],"amounts":["20","5"],"memo":null}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as backend.isle.testnet network-config testnet sign-with-keychain send
near contract call-function as-transaction resources.isle.testnet mt_transfer json-args '{"receiver_id":"tg2.isle.testnet","token_id":"ice","amount":"20","approval":null,"memo":"caravan"}' prepaid-gas '30.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as tg1.isle.testnet network-config testnet sign-with-keychain send
near contract call-function as-read-only resources.isle.testnet mt_batch_balance_of json-args '{"account_id":"tg2.isle.testnet","token_ids":["ice","wood"]}' network-config testnet now

# 5. Smoke test: pool (uses the vectors from rewards-pool/test-vectors.json, total = 4.000000000000000000000043 NEAR)
near contract call-function as-transaction pool.isle.testnet deposit json-args '{}' prepaid-gas '30.0 Tgas' attached-deposit '5 NEAR' sign-as isle.testnet network-config testnet sign-with-keychain send
near contract call-function as-transaction pool.isle.testnet set_epoch_root json-args '{"epoch":3,"root":"462c2ca4cd36d32dc337222ed40f56b2b9d017c7d6595435e51dfcb1a88d85dc","total":"4000000000000000000000043"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as isle.testnet network-config testnet sign-with-keychain send
near contract call-function as-transaction pool.isle.testnet claim json-args '{"epoch":3,"account_id":"tg5.isle.testnet","amount":"42","proof":["d970bf41552746a6a169c68bb8734397cb60e84b0a89783013174a8451b2c0f3"],"recipient":null}' prepaid-gas '50.0 Tgas' attached-deposit '0 NEAR' sign-as isle.testnet network-config testnet sign-with-keychain send
near contract call-function as-read-only pool.isle.testnet get_pool json-args '{}' network-config testnet now
near contract call-function as-read-only pool.isle.testnet get_epoch json-args '{"epoch":3}' network-config testnet now
```

The claim in step 5 is sent by a third party, so the 42 yoctoNEAR go to `tg5.isle.testnet`, which must exist or the claim is restored.

## Not done / limitations

Both contracts:
- Never deployed. Only unit tests (`testing_env!` mock) were run; there are no sandbox or testnet integration tests, and **gas was not measured** for any method.
- The near-cli-rs commands above were written from the CLI's syntax and not executed (near-cli-rs is not installed on the build machine).
- No owner transfer, no pause, no upgrade or migration method. A redeploy with a changed state layout needs a new account.
- `#[private]` on `on_claim_settled` is enforced by near-sdk's generated wrapper and is not covered by a unit test.

`resources`:
- `mt_transfer_call`, `mt_batch_transfer_call` and `mt_resolve_transfer` are **not implemented**: resources cannot be sent "into" another contract with a callback.
- Approval management is not implemented: any non-null `approval` / `approvals` panics, including an array of nulls.
- No enumeration extension (`mt_tokens`, `mt_tokens_for_owner`) and no NEP-145 storage management. The contract account pays for storage, so anyone who holds a resource can make the contract pay for a new balance entry by sending 1 unit to a fresh account.
- Zero amounts and repeated token ids inside one batch are rejected instead of being accepted as no-ops.
- Minters are fully trusted: they can mint any amount and burn from any account.

`rewards-pool`:
- A root cannot be changed or cancelled. A wrong root, or a `total` larger than the sum of its leaves, leaves the difference in `reserved` forever. There is no owner withdrawal.
- NEAR sent to the contract by a plain transfer (not through `deposit()`) is not counted in the pool.
- Anyone can trigger a claim for any leaf with `recipient = null`; the NEAR then goes to `account_id` itself. For a player this means someone else can force the payout to the `tg<id>` game account before the player claims to their own wallet. Nothing is lost, but the backend must be ready to forward such payouts.
- Eligibility (days in game, island level, per-player cap) is decided off-chain by whoever builds the tree. The contract only enforces the root, one claim per `(epoch, account_id)` and the epoch total.
- Each claim adds a small storage record paid from the contract account's own NEAR (not from the pool), so the account needs spare NEAR beyond the pool balance.
