//! Knight's Isle — game resources as a NEP-245 multi-token.
//!
//! Seven fixed fungible token ids (`energy`, `materials`, `credits`, `ice`,
//! `fruit`, `glass`, `wood`), whole units, no decimals.
//!
//! The game backend is authoritative: whitelisted *minter* accounts mint what
//! buildings produced and burn what the player spent. Players (their
//! `tg<id>.<game>.testnet` sub-accounts) move resources between each other with
//! the NEP-245 core transfers (caravans).
//!
//! Implemented: NEP-245 core without `mt_transfer_call` /
//! `mt_batch_transfer_call`, the NEP-245 metadata views and NEP-245 events
//! (NEP-297 format). Approval management and storage management are not
//! implemented: the contract account pays for all storage.

use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{assert_one_yocto, env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

#[cfg(test)]
mod tests;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// `(token_id, display name, symbol)`. The position is the internal index.
pub const TOKENS: [(&str, &str, &str); 7] = [
    ("energy", "Energy", "ENERGY"),
    ("materials", "Materials", "MATERIALS"),
    ("credits", "Credits", "CREDITS"),
    ("ice", "Ice", "ICE"),
    ("fruit", "Fruit", "FRUIT"),
    ("glass", "Glass", "GLASS"),
    ("wood", "Wood", "WOOD"),
];

pub const MT_METADATA_SPEC: &str = "mt-1.0.0";
pub const CONTRACT_NAME: &str = "Knight's Isle Resources";

pub const EVENT_STANDARD: &str = "nep245";
pub const EVENT_VERSION: &str = "1.0.0";

pub const MAX_MEMO_BYTES: usize = 256;
/// NEAR limits the total length of all logs of one function call to 16 KB.
/// Every method here emits exactly one log line, so this bounds that line.
/// It is what limits the size of a `mint_many` batch (see README).
pub const MAX_EVENT_LOG_BYTES: usize = 16_384;

// Error messages (constants so tests can match them).
pub const ERR_NOT_OWNER: &str = "Only the contract owner can call this method";
pub const ERR_NOT_MINTER: &str = "Only minters can call this method";
pub const ERR_UNKNOWN_TOKEN: &str = "Unknown token id";
pub const ERR_LEN_MISMATCH: &str = "token_ids and amounts must have the same length";
pub const ERR_EMPTY_BATCH: &str = "token_ids must not be empty";
pub const ERR_DUPLICATE_TOKEN: &str = "Duplicate token id in one batch";
pub const ERR_ZERO_AMOUNT: &str = "Amount must be greater than 0";
pub const ERR_INSUFFICIENT: &str = "Not enough balance";
pub const ERR_SUPPLY_OVERFLOW: &str = "Total supply overflow";
pub const ERR_APPROVALS: &str = "Approvals are not supported";
pub const ERR_SELF_TRANSFER: &str = "Sender and receiver must differ";
pub const ERR_MEMO_TOO_LONG: &str = "memo must be <= 256 bytes";
pub const ERR_EMPTY_ENTRIES: &str = "entries must not be empty";
pub const ERR_EVENT_TOO_LONG: &str =
    "Batch is too large: its event log would exceed 16384 bytes, split it into several calls";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Minters,
    Balances,
}

/// NEP-245 `Token` (core) plus `base_metadata_id` from the metadata extension.
/// These tokens are fungible, so `owner_id` is always `null`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Token {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
    pub base_metadata_id: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct MTContractMetadata {
    pub spec: String,
    pub name: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct MTBaseTokenMetadata {
    pub name: String,
    /// Unique id of this metadata; equals the token id here.
    pub id: String,
    pub symbol: Option<String>,
    pub icon: Option<String>,
    /// The spec types `decimals` as a string. Always `"0"` here.
    pub decimals: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub copies: Option<u64>,
    pub reference_hash: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Default)]
pub struct MTTokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct MTTokenMetadataAll {
    pub base: MTBaseTokenMetadata,
    pub token: MTTokenMetadata,
}

/// NEP-245 approval tuple `[owner_id, approval_id]`. Accepted in the method
/// signatures for spec compatibility; any non-null value is rejected.
pub type Approval = (AccountId, u64);

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    minters: IterableSet<AccountId>,
    /// (account, token index) -> balance. Zero balances are removed.
    balances: LookupMap<(AccountId, u8), u128>,
    /// Total supply per token index.
    supply: [u128; 7],
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            minters: IterableSet::new(StorageKey::Minters),
            balances: LookupMap::new(StorageKey::Balances),
            supply: [0; 7],
        }
    }

    // ----------------------------------------------------------------- admin

    /// Owner only. Returns `false` if the account already was a minter.
    pub fn add_minter(&mut self, account_id: AccountId) -> bool {
        self.assert_owner();
        self.minters.insert(account_id)
    }

    /// Owner only. Returns `false` if the account was not a minter.
    pub fn remove_minter(&mut self, account_id: AccountId) -> bool {
        self.assert_owner();
        self.minters.remove(&account_id)
    }

    pub fn get_minters(&self) -> Vec<AccountId> {
        self.minters.iter().cloned().collect()
    }

    pub fn is_minter(&self, account_id: AccountId) -> bool {
        self.minters.contains(&account_id)
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    /// The seven token ids, in their fixed order.
    pub fn get_token_ids(&self) -> Vec<String> {
        TOKENS.iter().map(|t| t.0.to_string()).collect()
    }

    // ----------------------------------------------------------- mint / burn

    /// Minter only. Mints `amounts[i]` of `token_ids[i]` to `account_id`.
    pub fn mint_batch(
        &mut self,
        account_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        memo: Option<String>,
    ) {
        self.assert_minter();
        check_memo(&memo);
        self.internal_mint(&account_id, &token_ids, &amounts);
        emit_event("mt_mint", vec![owner_log(&account_id, None, &token_ids, &amounts, &memo)]);
    }

    /// Minter only. Mints to several players in one transaction. Each entry is
    /// `[account_id, token_ids, amounts]`. All or nothing: any invalid entry
    /// panics and nothing is minted. The whole batch is logged as one
    /// `mt_mint` event, which must fit into 16 KB.
    pub fn mint_many(&mut self, entries: Vec<(AccountId, Vec<String>, Vec<U128>)>) {
        self.assert_minter();
        require!(!entries.is_empty(), ERR_EMPTY_ENTRIES);
        let mut logs = Vec::with_capacity(entries.len());
        for (account_id, token_ids, amounts) in &entries {
            self.internal_mint(account_id, token_ids, amounts);
            logs.push(owner_log(account_id, None, token_ids, amounts, &None));
        }
        emit_event("mt_mint", logs);
    }

    /// Minter only. Burns `amounts[i]` of `token_ids[i]` from `account_id`.
    /// Panics if any balance is too low.
    pub fn burn_batch(
        &mut self,
        account_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        memo: Option<String>,
    ) {
        self.assert_minter();
        check_memo(&memo);
        for (idx, amount) in checked_batch(&token_ids, &amounts) {
            self.internal_withdraw(&account_id, idx, amount);
            // Cannot underflow: supply >= every single balance.
            self.supply[idx] -= amount;
        }
        let minter = env::predecessor_account_id();
        let authorized = (minter != account_id).then_some(&minter);
        emit_event("mt_burn", vec![owner_log(&account_id, authorized, &token_ids, &amounts, &memo)]);
    }

    // ------------------------------------------------------- NEP-245: change

    /// NEP-245. Requires exactly 1 yoctoNEAR. The caller (predecessor) is the
    /// sender. `approval` must be null.
    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<Approval>,
        memo: Option<String>,
    ) {
        require!(approval.is_none(), ERR_APPROVALS);
        self.internal_transfer(receiver_id, vec![token_id], vec![amount], memo);
    }

    /// NEP-245. Requires exactly 1 yoctoNEAR. The caller (predecessor) is the
    /// sender. `approvals` must be null.
    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<Approval>>>,
        memo: Option<String>,
    ) {
        require!(approvals.is_none(), ERR_APPROVALS);
        self.internal_transfer(receiver_id, token_ids, amounts, memo);
    }

    // -------------------------------------------------------- NEP-245: views

    /// `null` for an unknown token id.
    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<Token>> {
        token_ids
            .into_iter()
            .map(|id| {
                token_index(&id).map(|_| Token {
                    base_metadata_id: id.clone(),
                    token_id: id,
                    owner_id: None,
                })
            })
            .collect()
    }

    /// `"0"` for an unknown token id or account.
    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(token_index(&token_id).map_or(0, |idx| self.balance(&account_id, idx)))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids
            .iter()
            .map(|id| U128(token_index(id).map_or(0, |idx| self.balance(&account_id, idx))))
            .collect()
    }

    /// `null` for an unknown token id.
    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        token_index(&token_id).map(|idx| U128(self.supply[idx]))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.iter().map(|id| token_index(id).map(|idx| U128(self.supply[idx]))).collect()
    }

    // ----------------------------------------------- NEP-245 metadata: views

    pub fn mt_metadata_contract(&self) -> MTContractMetadata {
        MTContractMetadata { spec: MT_METADATA_SPEC.to_string(), name: CONTRACT_NAME.to_string() }
    }

    /// Panics on an unknown token id (the spec's return type has no null).
    pub fn mt_metadata_token_all(&self, token_ids: Vec<String>) -> Vec<MTTokenMetadataAll> {
        token_ids
            .iter()
            .map(|id| {
                let idx = expect_token_index(id);
                MTTokenMetadataAll { base: base_metadata(idx), token: token_metadata(idx) }
            })
            .collect()
    }

    /// Panics on an unknown token id.
    pub fn mt_metadata_token_by_token_id(&self, token_ids: Vec<String>) -> Vec<MTTokenMetadata> {
        token_ids.iter().map(|id| token_metadata(expect_token_index(id))).collect()
    }

    /// Panics on an unknown token id.
    pub fn mt_metadata_base_by_token_id(&self, token_ids: Vec<String>) -> Vec<MTBaseTokenMetadata> {
        token_ids.iter().map(|id| base_metadata(expect_token_index(id))).collect()
    }

    /// Base metadata ids are the token ids. Panics on an unknown id.
    pub fn mt_metadata_base_by_metadata_id(
        &self,
        base_metadata_ids: Vec<String>,
    ) -> Vec<MTBaseTokenMetadata> {
        self.mt_metadata_base_by_token_id(base_metadata_ids)
    }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

impl Contract {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, ERR_NOT_OWNER);
    }

    fn assert_minter(&self) {
        require!(self.minters.contains(&env::predecessor_account_id()), ERR_NOT_MINTER);
    }

    fn balance(&self, account_id: &AccountId, idx: usize) -> u128 {
        self.balances.get(&(account_id.clone(), idx as u8)).copied().unwrap_or(0)
    }

    fn internal_deposit(&mut self, account_id: &AccountId, idx: usize, amount: u128) {
        // Cannot overflow: a balance never exceeds the (checked) total supply.
        let new_balance = self.balance(account_id, idx) + amount;
        self.balances.insert((account_id.clone(), idx as u8), new_balance);
    }

    fn internal_withdraw(&mut self, account_id: &AccountId, idx: usize, amount: u128) {
        let balance = self.balance(account_id, idx);
        if balance < amount {
            env::panic_str(&format!(
                "{ERR_INSUFFICIENT}: {account_id} has {balance} {}, needs {amount}",
                TOKENS[idx].0
            ));
        }
        let key = (account_id.clone(), idx as u8);
        if balance == amount {
            self.balances.remove(&key);
        } else {
            self.balances.insert(key, balance - amount);
        }
    }

    fn internal_mint(&mut self, account_id: &AccountId, token_ids: &[String], amounts: &[U128]) {
        for (idx, amount) in checked_batch(token_ids, amounts) {
            self.supply[idx] = self.supply[idx]
                .checked_add(amount)
                .unwrap_or_else(|| env::panic_str(ERR_SUPPLY_OVERFLOW));
            self.internal_deposit(account_id, idx, amount);
        }
    }

    fn internal_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        check_memo(&memo);
        let sender_id = env::predecessor_account_id();
        require!(sender_id != receiver_id, ERR_SELF_TRANSFER);
        for (idx, amount) in checked_batch(&token_ids, &amounts) {
            self.internal_withdraw(&sender_id, idx, amount);
            self.internal_deposit(&receiver_id, idx, amount);
        }
        let mut log = json!({
            "old_owner_id": sender_id,
            "new_owner_id": receiver_id,
            "token_ids": token_ids,
            "amounts": amounts,
        });
        if let Some(memo) = memo {
            log["memo"] = json!(memo);
        }
        emit_event("mt_transfer", vec![log]);
    }
}

fn token_index(token_id: &str) -> Option<usize> {
    TOKENS.iter().position(|t| t.0 == token_id)
}

fn expect_token_index(token_id: &str) -> usize {
    token_index(token_id)
        .unwrap_or_else(|| env::panic_str(&format!("{ERR_UNKNOWN_TOKEN}: {token_id}")))
}

/// Validates a `(token_ids, amounts)` pair and resolves ids to indexes:
/// same length, not empty, known ids, no id twice, every amount > 0.
fn checked_batch(token_ids: &[String], amounts: &[U128]) -> Vec<(usize, u128)> {
    require!(token_ids.len() == amounts.len(), ERR_LEN_MISMATCH);
    require!(!token_ids.is_empty(), ERR_EMPTY_BATCH);
    let mut seen = 0u8;
    token_ids
        .iter()
        .zip(amounts)
        .map(|(id, amount)| {
            let idx = expect_token_index(id);
            require!(seen & (1 << idx) == 0, ERR_DUPLICATE_TOKEN);
            seen |= 1 << idx;
            require!(amount.0 > 0, ERR_ZERO_AMOUNT);
            (idx, amount.0)
        })
        .collect()
}

fn check_memo(memo: &Option<String>) {
    if let Some(memo) = memo {
        require!(memo.len() <= MAX_MEMO_BYTES, ERR_MEMO_TOO_LONG);
    }
}

fn base_metadata(idx: usize) -> MTBaseTokenMetadata {
    let (id, name, symbol) = TOKENS[idx];
    MTBaseTokenMetadata {
        name: name.to_string(),
        id: id.to_string(),
        symbol: Some(symbol.to_string()),
        icon: None,
        decimals: Some("0".to_string()),
        base_uri: None,
        reference: None,
        copies: None,
        reference_hash: None,
    }
}

fn token_metadata(idx: usize) -> MTTokenMetadata {
    MTTokenMetadata { title: Some(TOKENS[idx].1.to_string()), ..Default::default() }
}

/// `MtMintLog` / `MtBurnLog` entry.
fn owner_log(
    owner_id: &AccountId,
    authorized_id: Option<&AccountId>,
    token_ids: &[String],
    amounts: &[U128],
    memo: &Option<String>,
) -> Value {
    let mut log = json!({
        "owner_id": owner_id,
        "token_ids": token_ids,
        "amounts": amounts,
    });
    if let Some(authorized_id) = authorized_id {
        log["authorized_id"] = json!(authorized_id);
    }
    if let Some(memo) = memo {
        log["memo"] = json!(memo);
    }
    log
}

/// One NEP-297 log line in NEP-245 shape:
/// `EVENT_JSON:{"standard":"nep245","version":"1.0.0","event":..,"data":[..]}`.
fn emit_event(event: &str, data: Vec<Value>) {
    let payload = json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event,
        "data": data,
    });
    let line = format!("EVENT_JSON:{payload}");
    require!(line.len() <= MAX_EVENT_LOG_BYTES, ERR_EVENT_TOO_LONG);
    env::log_str(&line);
}
