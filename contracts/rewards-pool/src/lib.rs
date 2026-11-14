//! Knight's Isle — weekly reward pool with merkle claims.
//!
//! * Anyone tops the pool up with `deposit()`.
//! * Once per epoch the owner (game backend) publishes a merkle root of the
//!   payouts with `set_epoch_root`; the epoch total is moved into `reserved`.
//! * A payout is claimed with `claim(epoch, account_id, amount, proof, ..)`.
//!
//! Merkle format (must match the TypeScript side byte for byte):
//! * leaf   = sha256(utf8("knights-isle:v1:{epoch}:{account_id}:{amount}")),
//!   epoch and amount in decimal without padding, amount in yoctoNEAR;
//! * parent = sha256(min(a, b) ‖ max(a, b)), children compared bytewise;
//! * a level with an odd node count promotes its last node unchanged;
//! * proof  = sibling hashes from the leaf level upward, hex;
//! * a single-leaf tree has root == leaf and an empty proof.

use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    env, is_promise_success, near, require, AccountId, BorshStorageKey, Gas, NearToken,
    PanicOnDefault, Promise,
};

#[cfg(test)]
mod tests;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const LEAF_PREFIX: &str = "knights-isle:v1";

pub const EVENT_STANDARD: &str = "knights-isle-rewards";
pub const EVENT_VERSION: &str = "1.0.0";

/// A proof of 64 siblings covers 2^64 leaves; anything longer is garbage.
pub const MAX_PROOF_LEN: usize = 64;
/// Gas reserved for `on_claim_settled` (a few storage writes and one log).
pub const GAS_FOR_CLAIM_CALLBACK: Gas = Gas::from_tgas(10);

// Error messages (constants so tests can match them).
pub const ERR_NOT_OWNER: &str = "Only the contract owner can call this method";
pub const ERR_NO_DEPOSIT: &str = "Attach some NEAR to deposit";
pub const ERR_BAD_HASH: &str = "must be 64 hex characters";
pub const ERR_EPOCH_EXISTS: &str = "Root for this epoch is already set";
pub const ERR_ZERO_TOTAL: &str = "total must be greater than 0";
pub const ERR_TOTAL_TOO_BIG: &str = "total exceeds the available pool balance";
pub const ERR_NO_EPOCH: &str = "Epoch root is not set";
pub const ERR_ZERO_AMOUNT: &str = "amount must be greater than 0";
pub const ERR_PROOF_TOO_LONG: &str = "proof is too long";
pub const ERR_ALREADY_CLAIMED: &str = "Already claimed for this epoch";
pub const ERR_BAD_PROOF: &str = "Invalid merkle proof";
pub const ERR_RECIPIENT: &str =
    "Only account_id itself may choose a recipient; other callers must pass recipient = null";
pub const ERR_RECIPIENT_IS_POOL: &str = "recipient must not be the pool contract";
pub const ERR_EPOCH_EXHAUSTED: &str = "Claim exceeds the epoch total";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Epochs,
    Claimed,
}

pub type Hash = [u8; 32];

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Epoch {
    pub root: Hash,
    pub total: u128,
    pub claimed_total: u128,
    pub claims: u64,
}

/// Returned by `get_epoch`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct EpochView {
    /// 64 lowercase hex chars.
    pub root: String,
    /// yoctoNEAR reserved for this epoch when the root was set.
    pub total: U128,
    /// yoctoNEAR already paid out (or being paid out right now).
    pub claimed_total: U128,
    /// Number of claims counted in `claimed_total`.
    pub claims: u64,
}

/// Returned by `get_pool`. All values in yoctoNEAR.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct PoolView {
    /// Deposited and not yet paid out.
    pub balance: U128,
    /// Part of `balance` promised to epochs and not yet claimed.
    pub reserved: U128,
    /// `balance - reserved`: what the next epoch may use.
    pub available: U128,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    /// Deposits minus payouts. Deliberately separate from the account balance,
    /// which also holds the NEAR that pays for the contract's storage.
    balance: u128,
    /// Sum over epochs of `total - claimed_total`. Always <= `balance`.
    reserved: u128,
    epochs: LookupMap<u64, Epoch>,
    claimed: LookupSet<(u64, AccountId)>,
    latest_epoch: Option<u64>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            balance: 0,
            reserved: 0,
            epochs: LookupMap::new(StorageKey::Epochs),
            claimed: LookupSet::new(StorageKey::Claimed),
            latest_epoch: None,
        }
    }

    // ------------------------------------------------------------------ pool

    /// Anyone. Adds the attached NEAR to the pool.
    #[payable]
    pub fn deposit(&mut self) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, ERR_NO_DEPOSIT);
        // Cannot overflow: total NEAR supply is far below u128::MAX.
        self.balance += amount;
        emit_event(
            "deposit",
            json!({
                "account_id": env::predecessor_account_id(),
                "amount": U128(amount),
                "balance": U128(self.balance),
            }),
        );
    }

    pub fn get_pool(&self) -> PoolView {
        PoolView {
            balance: U128(self.balance),
            reserved: U128(self.reserved),
            available: U128(self.balance - self.reserved),
        }
    }

    // ---------------------------------------------------------------- epochs

    /// Owner only. Publishes the merkle root of one epoch and reserves `total`
    /// yoctoNEAR for it. One root per epoch, it cannot be changed afterwards.
    pub fn set_epoch_root(&mut self, epoch: u64, root: String, total: U128) {
        require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER);
        let root = parse_hash("root", &root);
        require!(!self.epochs.contains_key(&epoch), ERR_EPOCH_EXISTS);
        require!(total.0 > 0, ERR_ZERO_TOTAL);
        require!(total.0 <= self.balance - self.reserved, ERR_TOTAL_TOO_BIG);

        self.reserved += total.0;
        self.epochs.insert(epoch, Epoch { root, total: total.0, claimed_total: 0, claims: 0 });
        if self.latest_epoch.is_none_or(|latest| epoch > latest) {
            self.latest_epoch = Some(epoch);
        }
        emit_event(
            "epoch_root_set",
            json!({ "epoch": epoch, "root": to_hex(&root), "total": total }),
        );
    }

    pub fn get_epoch(&self, epoch: u64) -> Option<EpochView> {
        self.epochs.get(&epoch).map(|e| EpochView {
            root: to_hex(&e.root),
            total: U128(e.total),
            claimed_total: U128(e.claimed_total),
            claims: e.claims,
        })
    }

    /// The highest epoch number that has a root.
    pub fn latest_epoch(&self) -> Option<u64> {
        self.latest_epoch
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    // ----------------------------------------------------------------- claim

    /// Pays `amount` yoctoNEAR of `epoch` for the leaf `(epoch, account_id, amount)`.
    ///
    /// * Called by `account_id` itself: the payout goes to `recipient`, or to
    ///   `account_id` when `recipient` is null.
    /// * Called by anyone else: `recipient` must be null and the payout goes to
    ///   `account_id` (this is how a DAO treasury leaf gets paid).
    ///
    /// Returns the result of `on_claim_settled`: `true` if the NEAR arrived,
    /// `false` if the transfer failed and the claim was restored.
    pub fn claim(
        &mut self,
        epoch: u64,
        account_id: AccountId,
        amount: U128,
        proof: Vec<String>,
        recipient: Option<AccountId>,
    ) -> Promise {
        let amount = amount.0;
        require!(amount > 0, ERR_ZERO_AMOUNT);
        require!(proof.len() <= MAX_PROOF_LEN, ERR_PROOF_TOO_LONG);

        let payout_to = if env::predecessor_account_id() == account_id {
            recipient.unwrap_or_else(|| account_id.clone())
        } else {
            require!(recipient.is_none(), ERR_RECIPIENT);
            account_id.clone()
        };
        require!(payout_to != env::current_account_id(), ERR_RECIPIENT_IS_POOL);

        let Some(ep) = self.epochs.get_mut(&epoch) else { env::panic_str(ERR_NO_EPOCH) };
        let key = (epoch, account_id.clone());
        require!(!self.claimed.contains(&key), ERR_ALREADY_CLAIMED);

        let proof: Vec<Hash> = proof.iter().map(|h| parse_hash("proof item", h)).collect();
        let leaf = leaf_hash(epoch, &account_id, amount);
        require!(compute_root(leaf, &proof) == ep.root, ERR_BAD_PROOF);

        // Guards against a root whose leaves add up to more than `total`.
        let claimed_total = ep.claimed_total.checked_add(amount).filter(|c| *c <= ep.total);
        let Some(claimed_total) = claimed_total else { env::panic_str(ERR_EPOCH_EXHAUSTED) };

        ep.claimed_total = claimed_total;
        ep.claims += 1;
        self.claimed.insert(key);
        // Cannot underflow: amount <= epoch remainder <= reserved <= balance.
        self.reserved -= amount;
        self.balance -= amount;

        Promise::new(payout_to.clone()).transfer(NearToken::from_yoctonear(amount)).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CLAIM_CALLBACK)
                .on_claim_settled(epoch, account_id, U128(amount), payout_to),
        )
    }

    /// Callback of the payout transfer. On failure (for example the receiving
    /// account does not exist) NEAR returns the amount to this contract, so the
    /// claim is un-marked and the amount is reserved again.
    #[private]
    pub fn on_claim_settled(
        &mut self,
        epoch: u64,
        account_id: AccountId,
        amount: U128,
        recipient: AccountId,
    ) -> bool {
        let paid = is_promise_success();
        if !paid {
            self.claimed.remove(&(epoch, account_id.clone()));
            if let Some(ep) = self.epochs.get_mut(&epoch) {
                ep.claimed_total = ep.claimed_total.saturating_sub(amount.0);
                ep.claims = ep.claims.saturating_sub(1);
            }
            self.reserved += amount.0;
            self.balance += amount.0;
        }
        emit_event(
            if paid { "claim" } else { "claim_failed" },
            json!({
                "epoch": epoch,
                "account_id": account_id,
                "amount": amount,
                "recipient": recipient,
            }),
        );
        paid
    }

    /// `true` once a claim for `(epoch, account_id)` is paid or being paid.
    pub fn is_claimed(&self, epoch: u64, account_id: AccountId) -> bool {
        self.claimed.contains(&(epoch, account_id))
    }

    /// View helper for clients: does this proof match the epoch root?
    /// `false` if the epoch has no root. Does not look at the claimed flag.
    pub fn verify_claim(
        &self,
        epoch: u64,
        account_id: AccountId,
        amount: U128,
        proof: Vec<String>,
    ) -> bool {
        require!(proof.len() <= MAX_PROOF_LEN, ERR_PROOF_TOO_LONG);
        let Some(ep) = self.epochs.get(&epoch) else { return false };
        let proof: Vec<Hash> = proof.iter().map(|h| parse_hash("proof item", h)).collect();
        compute_root(leaf_hash(epoch, &account_id, amount.0), &proof) == ep.root
    }
}

// ---------------------------------------------------------------------------
// Merkle
// ---------------------------------------------------------------------------

/// sha256 of `knights-isle:v1:{epoch}:{account_id}:{amount}`.
pub fn leaf_hash(epoch: u64, account_id: &AccountId, amount: u128) -> Hash {
    env::sha256_array(format!("{LEAF_PREFIX}:{epoch}:{account_id}:{amount}").as_bytes())
}

/// sha256(min(a, b) ‖ max(a, b)).
pub fn parent_hash(a: &Hash, b: &Hash) -> Hash {
    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
    let mut buf = [0u8; 64];
    buf[..32].copy_from_slice(lo);
    buf[32..].copy_from_slice(hi);
    env::sha256_array(&buf)
}

/// Folds a leaf with its sibling path into the root it belongs to.
pub fn compute_root(leaf: Hash, proof: &[Hash]) -> Hash {
    proof.iter().fold(leaf, |node, sibling| parent_hash(&node, sibling))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parses 64 hex chars (either case). Panics with `"{what} must be 64 hex characters"`.
fn parse_hash(what: &str, hex: &str) -> Hash {
    let bytes = hex.as_bytes();
    let nibble = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut out = [0u8; 32];
    let mut ok = bytes.len() == 64;
    if ok {
        for (i, byte) in out.iter_mut().enumerate() {
            match (nibble(bytes[2 * i]), nibble(bytes[2 * i + 1])) {
                (Some(hi), Some(lo)) => *byte = hi << 4 | lo,
                _ => ok = false,
            }
        }
    }
    if !ok {
        env::panic_str(&format!("{what} {ERR_BAD_HASH}"));
    }
    out
}

/// Lowercase hex.
pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// NEP-297 event: `EVENT_JSON:{"standard":"knights-isle-rewards","version":"1.0.0","event":..,"data":[..]}`
fn emit_event(event: &str, data: Value) {
    let payload = json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}
