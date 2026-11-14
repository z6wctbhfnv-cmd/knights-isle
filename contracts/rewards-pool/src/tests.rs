use super::*;
use near_sdk::mock::MockAction;
use near_sdk::serde_json;
use near_sdk::test_utils::{accounts, get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::{test_vm_config, testing_env, PromiseResult, RuntimeFeesConfig};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const VECTORS_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/test-vectors.json");

/// The fixed test-vector leaves (epoch 3), in tree order.
const EPOCH: u64 = 3;
const LEAVES: [(&str, u128); 5] = [
    ("tg1.isle.testnet", 1_000_000_000_000_000_000_000_000),
    ("tg2.isle.testnet", 2_500_000_000_000_000_000_000_000),
    ("tg3.isle.testnet", 1),
    ("harbor.sputnik-dao.testnet", 500_000_000_000_000_000_000_000),
    ("tg5.isle.testnet", 42),
];
const LEAVES_TOTAL: u128 = 4_000_000_000_000_000_000_000_043;

fn pool_id() -> AccountId {
    "pool.isle.testnet".parse().unwrap()
}
fn owner() -> AccountId {
    accounts(0)
}
fn donor() -> AccountId {
    accounts(1)
}
fn stranger() -> AccountId {
    accounts(2)
}
fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(predecessor: AccountId, deposit: u128) -> near_sdk::VMContext {
    VMContextBuilder::new()
        .current_account_id(pool_id())
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(1_000))
        .build()
}

fn set_ctx(predecessor: AccountId, deposit: u128) {
    testing_env!(ctx(predecessor, deposit));
}

/// Context of the `on_claim_settled` callback with the transfer's result.
fn set_callback_ctx(transfer_ok: bool) {
    let result =
        if transfer_ok { PromiseResult::Successful(vec![]) } else { PromiseResult::Failed };
    testing_env!(
        ctx(pool_id(), 0),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}

fn setup() -> Contract {
    set_ctx(owner(), 0);
    Contract::new(owner())
}

fn deposit(c: &mut Contract, amount: u128) {
    set_ctx(donor(), amount);
    c.deposit();
}

fn pool(c: &Contract) -> (u128, u128, u128) {
    let p = c.get_pool();
    (p.balance.0, p.reserved.0, p.available.0)
}

fn events() -> Vec<serde_json::Value> {
    get_logs()
        .iter()
        .map(|l| l.strip_prefix("EVENT_JSON:").expect("every log line is an event"))
        .map(|j| serde_json::from_str::<serde_json::Value>(j).unwrap())
        .collect()
}

/// `(receiver, yocto)` of every NEAR transfer created by the last call.
fn transfers() -> Vec<(AccountId, u128)> {
    get_created_receipts()
        .iter()
        .flat_map(|r| {
            r.actions.iter().filter_map(|a| match a {
                MockAction::Transfer { deposit, .. } => {
                    Some((r.receiver_id.clone(), deposit.as_yoctonear()))
                }
                _ => None,
            })
        })
        .collect()
}

/// Method names of the function calls scheduled on the pool itself.
fn self_calls() -> Vec<String> {
    get_created_receipts()
        .iter()
        .filter(|r| r.receiver_id == pool_id())
        .flat_map(|r| r.actions.iter())
        .filter_map(|a| match a {
            MockAction::FunctionCallWeight { method_name, .. } => {
                Some(String::from_utf8(method_name.clone()).unwrap())
            }
            _ => None,
        })
        .collect()
}

// ----------------------------------------------------- reference merkle builder

struct Tree {
    root: Hash,
    /// `proofs[i]` belongs to `leaves[i]`.
    proofs: Vec<Vec<Hash>>,
}

/// Straightforward builder of the tree format described in lib.rs.
fn build_tree(leaves: &[Hash]) -> Tree {
    assert!(!leaves.is_empty());
    let mut proofs = vec![Vec::new(); leaves.len()];
    // Position of every original leaf inside the current level.
    let mut positions: Vec<usize> = (0..leaves.len()).collect();
    let mut level = leaves.to_vec();
    while level.len() > 1 {
        for (leaf, pos) in positions.iter_mut().enumerate() {
            let sibling = *pos ^ 1;
            if sibling < level.len() {
                proofs[leaf].push(level[sibling]);
            } // else: odd last node, promoted with no sibling
            *pos /= 2;
        }
        level = level
            .chunks(2)
            .map(|pair| if pair.len() == 2 { parent_hash(&pair[0], &pair[1]) } else { pair[0] })
            .collect();
    }
    Tree { root: level[0], proofs }
}

fn leaves_of(epoch: u64, list: &[(&str, u128)]) -> Vec<Hash> {
    list.iter().map(|(a, amount)| leaf_hash(epoch, &acc(a), *amount)).collect()
}

fn hex_proof(proof: &[Hash]) -> Vec<String> {
    proof.iter().map(|h| to_hex(h)).collect()
}

/// Pool with 10 NEAR deposited and the 5-leaf vector tree set as epoch 3.
fn setup_with_epoch() -> (Contract, Tree) {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    let tree = build_tree(&leaves_of(EPOCH, &LEAVES));
    set_ctx(owner(), 0);
    c.set_epoch_root(EPOCH, to_hex(&tree.root), U128(LEAVES_TOTAL));
    (c, tree)
}

/// `claim` for vector leaf `i`, called by `caller`.
fn claim_leaf(c: &mut Contract, tree: &Tree, i: usize, caller: AccountId, to: Option<AccountId>) {
    set_ctx(caller, 0);
    let (account, amount) = LEAVES[i];
    // Dropping the returned Promise schedules its receipts in the mock.
    drop(c.claim(EPOCH, acc(account), U128(amount), hex_proof(&tree.proofs[i]), to));
}

// ------------------------------------------------------------------ init / pool

#[test]
fn new_starts_empty() {
    let c = setup();
    assert_eq!(c.get_owner(), owner());
    assert_eq!(pool(&c), (0, 0, 0));
    assert_eq!(c.latest_epoch(), None);
    assert_eq!(c.get_epoch(0), None);
    assert!(!c.is_claimed(0, owner()));
}

#[test]
fn anyone_can_deposit_and_deposits_add_up() {
    let mut c = setup();
    deposit(&mut c, 3 * NEAR);
    assert_eq!(
        events(),
        vec![serde_json::json!({
            "standard": "knights-isle-rewards",
            "version": "1.0.0",
            "event": "deposit",
            "data": [{
                "account_id": donor(),
                "amount": "3000000000000000000000000",
                "balance": "3000000000000000000000000"
            }]
        })]
    );
    set_ctx(stranger(), 7);
    c.deposit();
    assert_eq!(pool(&c), (3 * NEAR + 7, 0, 3 * NEAR + 7));
    assert_eq!(
        serde_json::to_value(c.get_pool()).unwrap(),
        serde_json::json!({
            "balance": "3000000000000000000000007",
            "reserved": "0",
            "available": "3000000000000000000000007"
        })
    );
}

#[test]
#[should_panic(expected = "Attach some NEAR to deposit")]
fn deposit_without_near_panics() {
    let mut c = setup();
    deposit(&mut c, 0);
}

// ---------------------------------------------------------------- set_epoch_root

#[test]
fn set_epoch_root_reserves_total_and_emits_event() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    let root = "ab".repeat(32);

    set_ctx(owner(), 0);
    c.set_epoch_root(7, root.clone(), U128(4 * NEAR));

    assert_eq!(pool(&c), (10 * NEAR, 4 * NEAR, 6 * NEAR));
    assert_eq!(c.latest_epoch(), Some(7));
    assert_eq!(
        serde_json::to_value(c.get_epoch(7)).unwrap(),
        serde_json::json!({
            "root": root,
            "total": "4000000000000000000000000",
            "claimed_total": "0",
            "claims": 0
        })
    );
    assert_eq!(
        events(),
        vec![serde_json::json!({
            "standard": "knights-isle-rewards",
            "version": "1.0.0",
            "event": "epoch_root_set",
            "data": [{"epoch": 7, "root": root, "total": "4000000000000000000000000"}]
        })]
    );
}

#[test]
fn several_epochs_share_the_pool_and_latest_is_the_highest() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(owner(), 0);
    c.set_epoch_root(5, "11".repeat(32), U128(4 * NEAR));
    c.set_epoch_root(2, "22".repeat(32), U128(6 * NEAR)); // exactly the rest
    assert_eq!(pool(&c), (10 * NEAR, 10 * NEAR, 0));
    assert_eq!(c.latest_epoch(), Some(5), "an older epoch number does not lower latest_epoch");
    assert_eq!(c.get_epoch(2).unwrap().total, U128(6 * NEAR));
    assert_eq!(c.get_epoch(3), None);
}

#[test]
fn uppercase_root_is_accepted_and_stored_lowercase() {
    let mut c = setup();
    deposit(&mut c, NEAR);
    set_ctx(owner(), 0);
    c.set_epoch_root(1, "AB".repeat(32), U128(1));
    assert_eq!(c.get_epoch(1).unwrap().root, "ab".repeat(32));
}

#[test]
#[should_panic(expected = "Only the contract owner can call this method")]
fn set_epoch_root_by_non_owner_panics() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(stranger(), 0);
    c.set_epoch_root(1, "ab".repeat(32), U128(NEAR));
}

#[test]
#[should_panic(expected = "Root for this epoch is already set")]
fn set_epoch_root_twice_panics() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(owner(), 0);
    c.set_epoch_root(1, "ab".repeat(32), U128(NEAR));
    c.set_epoch_root(1, "cd".repeat(32), U128(NEAR));
}

#[test]
#[should_panic(expected = "total exceeds the available pool balance")]
fn set_epoch_root_total_above_available_panics() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(owner(), 0);
    c.set_epoch_root(1, "ab".repeat(32), U128(10 * NEAR + 1));
}

#[test]
#[should_panic(expected = "total exceeds the available pool balance")]
fn set_epoch_root_cannot_use_reserved_funds() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(owner(), 0);
    c.set_epoch_root(1, "ab".repeat(32), U128(6 * NEAR));
    c.set_epoch_root(2, "cd".repeat(32), U128(4 * NEAR + 1));
}

#[test]
#[should_panic(expected = "total must be greater than 0")]
fn set_epoch_root_zero_total_panics() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(owner(), 0);
    c.set_epoch_root(1, "ab".repeat(32), U128(0));
}

#[test]
#[should_panic(expected = "root must be 64 hex characters")]
fn set_epoch_root_short_root_panics() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(owner(), 0);
    c.set_epoch_root(1, "ab".repeat(31), U128(NEAR));
}

#[test]
#[should_panic(expected = "root must be 64 hex characters")]
fn set_epoch_root_non_hex_root_panics() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(owner(), 0);
    c.set_epoch_root(1, "zz".repeat(32), U128(NEAR));
}

#[test]
#[should_panic(expected = "root must be 64 hex characters")]
fn set_epoch_root_multibyte_root_panics() {
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(owner(), 0);
    // 64 bytes, but not ASCII hex.
    c.set_epoch_root(1, "é".repeat(32), U128(NEAR));
}

// ------------------------------------------------------------------------ claim

#[test]
fn self_claim_without_recipient_pays_the_account() {
    let (mut c, tree) = setup_with_epoch();
    claim_leaf(&mut c, &tree, 0, acc("tg1.isle.testnet"), None);

    assert_eq!(transfers(), vec![(acc("tg1.isle.testnet"), NEAR)]);
    assert_eq!(self_calls(), vec!["on_claim_settled".to_string()]);
    assert!(c.is_claimed(EPOCH, acc("tg1.isle.testnet")));
    assert!(!c.is_claimed(EPOCH, acc("tg2.isle.testnet")));
    assert!(!c.is_claimed(EPOCH + 1, acc("tg1.isle.testnet")));
    assert_eq!(pool(&c), (9 * NEAR, LEAVES_TOTAL - NEAR, 10 * NEAR - LEAVES_TOTAL));
    let ep = c.get_epoch(EPOCH).unwrap();
    assert_eq!((ep.claimed_total.0, ep.claims), (NEAR, 1));
    assert_eq!(ep.total.0, LEAVES_TOTAL);
}

#[test]
fn self_claim_with_recipient_pays_the_recipient() {
    let (mut c, tree) = setup_with_epoch();
    let wallet = acc("player-wallet.testnet");
    claim_leaf(&mut c, &tree, 1, acc("tg2.isle.testnet"), Some(wallet.clone()));

    assert_eq!(transfers(), vec![(wallet, 2_500_000_000_000_000_000_000_000)]);
    assert!(c.is_claimed(EPOCH, acc("tg2.isle.testnet")));
}

#[test]
fn third_party_claim_pays_the_leaf_account() {
    let (mut c, tree) = setup_with_epoch();
    // Anyone can trigger the DAO treasury payout; it still goes to the DAO.
    claim_leaf(&mut c, &tree, 3, stranger(), None);

    assert_eq!(transfers(), vec![(acc("harbor.sputnik-dao.testnet"), NEAR / 2)]);
    assert!(c.is_claimed(EPOCH, acc("harbor.sputnik-dao.testnet")));
    assert!(!c.is_claimed(EPOCH, stranger()));
}

#[test]
#[should_panic(expected = "Only account_id itself may choose a recipient")]
fn third_party_claim_with_recipient_panics() {
    let (mut c, tree) = setup_with_epoch();
    claim_leaf(&mut c, &tree, 3, stranger(), Some(stranger()));
}

#[test]
#[should_panic(expected = "Only account_id itself may choose a recipient")]
fn third_party_claim_with_recipient_equal_to_account_panics() {
    let (mut c, tree) = setup_with_epoch();
    // Strict rule: a foreign caller passes null, even for the "same" target.
    claim_leaf(&mut c, &tree, 3, stranger(), Some(acc("harbor.sputnik-dao.testnet")));
}

#[test]
#[should_panic(expected = "recipient must not be the pool contract")]
fn claim_to_the_pool_itself_panics() {
    let (mut c, tree) = setup_with_epoch();
    claim_leaf(&mut c, &tree, 0, acc("tg1.isle.testnet"), Some(pool_id()));
}

#[test]
fn all_five_leaves_claim_and_drain_the_epoch() {
    let (mut c, tree) = setup_with_epoch();
    for (i, (account, amount)) in LEAVES.iter().enumerate() {
        claim_leaf(&mut c, &tree, i, stranger(), None);
        assert_eq!(transfers(), vec![(acc(account), *amount)]);
        set_callback_ctx(true);
        assert!(c.on_claim_settled(EPOCH, acc(account), U128(*amount), acc(account)));
    }
    let ep = c.get_epoch(EPOCH).unwrap();
    assert_eq!((ep.claimed_total.0, ep.claims), (LEAVES_TOTAL, 5));
    assert_eq!(pool(&c), (10 * NEAR - LEAVES_TOTAL, 0, 10 * NEAR - LEAVES_TOTAL));
}

#[test]
#[should_panic(expected = "Already claimed for this epoch")]
fn double_claim_panics() {
    let (mut c, tree) = setup_with_epoch();
    claim_leaf(&mut c, &tree, 0, acc("tg1.isle.testnet"), None);
    set_callback_ctx(true);
    c.on_claim_settled(EPOCH, acc("tg1.isle.testnet"), U128(NEAR), acc("tg1.isle.testnet"));
    claim_leaf(&mut c, &tree, 0, acc("tg1.isle.testnet"), None);
}

#[test]
#[should_panic(expected = "Already claimed for this epoch")]
fn second_claim_while_the_first_transfer_is_in_flight_panics() {
    let (mut c, tree) = setup_with_epoch();
    claim_leaf(&mut c, &tree, 0, acc("tg1.isle.testnet"), None);
    // No callback yet.
    claim_leaf(&mut c, &tree, 0, stranger(), None);
}

#[test]
#[should_panic(expected = "Invalid merkle proof")]
fn claim_with_wrong_amount_panics() {
    let (mut c, tree) = setup_with_epoch();
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(
        EPOCH,
        acc("tg1.isle.testnet"),
        U128(NEAR + 1),
        hex_proof(&tree.proofs[0]),
        None,
    ));
}

#[test]
#[should_panic(expected = "Invalid merkle proof")]
fn claim_with_someone_elses_proof_panics() {
    let (mut c, tree) = setup_with_epoch();
    set_ctx(stranger(), 0);
    // tg2's amount and proof, but claimed for the stranger's own account.
    drop(c.claim(EPOCH, stranger(), U128(LEAVES[1].1), hex_proof(&tree.proofs[1]), None));
}

#[test]
#[should_panic(expected = "Invalid merkle proof")]
fn claim_with_tampered_sibling_panics() {
    let (mut c, tree) = setup_with_epoch();
    let mut proof = hex_proof(&tree.proofs[0]);
    proof[1] = "00".repeat(32);
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(EPOCH, acc("tg1.isle.testnet"), U128(NEAR), proof, None));
}

#[test]
#[should_panic(expected = "Invalid merkle proof")]
fn claim_with_truncated_proof_panics() {
    let (mut c, tree) = setup_with_epoch();
    let mut proof = hex_proof(&tree.proofs[0]);
    proof.pop();
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(EPOCH, acc("tg1.isle.testnet"), U128(NEAR), proof, None));
}

#[test]
#[should_panic(expected = "Invalid merkle proof")]
fn claim_with_empty_proof_on_a_big_tree_panics() {
    let (mut c, _) = setup_with_epoch();
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(EPOCH, acc("tg1.isle.testnet"), U128(NEAR), vec![], None));
}

#[test]
#[should_panic(expected = "Invalid merkle proof")]
fn proof_of_another_epoch_does_not_work() {
    let (mut c, tree) = setup_with_epoch();
    // Same leaves (accounts, amounts) are valid for epoch 3 only: the epoch is
    // part of the leaf. Epoch 4 gets a different root here.
    set_ctx(owner(), 0);
    c.set_epoch_root(4, "ab".repeat(32), U128(NEAR));
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(4, acc("tg1.isle.testnet"), U128(NEAR), hex_proof(&tree.proofs[0]), None));
}

#[test]
#[should_panic(expected = "Invalid merkle proof")]
fn same_root_reused_for_another_epoch_does_not_pay_again() {
    let (mut c, tree) = setup_with_epoch();
    set_ctx(owner(), 0);
    c.set_epoch_root(4, to_hex(&tree.root), U128(NEAR));
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(4, acc("tg1.isle.testnet"), U128(NEAR), hex_proof(&tree.proofs[0]), None));
}

#[test]
#[should_panic(expected = "Epoch root is not set")]
fn claim_for_unknown_epoch_panics() {
    let (mut c, tree) = setup_with_epoch();
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(99, acc("tg1.isle.testnet"), U128(NEAR), hex_proof(&tree.proofs[0]), None));
}

#[test]
#[should_panic(expected = "proof item must be 64 hex characters")]
fn claim_with_bad_proof_hex_panics() {
    let (mut c, _) = setup_with_epoch();
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(EPOCH, acc("tg1.isle.testnet"), U128(NEAR), vec!["xyz".into()], None));
}

#[test]
#[should_panic(expected = "proof is too long")]
fn claim_with_oversized_proof_panics() {
    let (mut c, _) = setup_with_epoch();
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(EPOCH, acc("tg1.isle.testnet"), U128(NEAR), vec!["00".repeat(32); 65], None));
}

#[test]
#[should_panic(expected = "amount must be greater than 0")]
fn claim_zero_amount_panics() {
    let (mut c, _) = setup_with_epoch();
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(EPOCH, acc("tg1.isle.testnet"), U128(0), vec![], None));
}

#[test]
fn uppercase_proof_hex_is_accepted() {
    let (mut c, tree) = setup_with_epoch();
    let proof: Vec<String> = hex_proof(&tree.proofs[2]).iter().map(|h| h.to_uppercase()).collect();
    set_ctx(stranger(), 0);
    drop(c.claim(EPOCH, acc("tg3.isle.testnet"), U128(1), proof, None));
    assert_eq!(transfers(), vec![(acc("tg3.isle.testnet"), 1)]);
}

#[test]
#[should_panic(expected = "Claim exceeds the epoch total")]
fn claims_cannot_exceed_the_epoch_total() {
    // A root whose leaves add up to more than the reserved total.
    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    let list = [("tg1.isle.testnet", 3 * NEAR), ("tg2.isle.testnet", 3 * NEAR)];
    let tree = build_tree(&leaves_of(1, &list));
    set_ctx(owner(), 0);
    c.set_epoch_root(1, to_hex(&tree.root), U128(4 * NEAR));

    set_ctx(stranger(), 0);
    drop(c.claim(1, acc(list[0].0), U128(list[0].1), hex_proof(&tree.proofs[0]), None));
    assert_eq!(pool(&c), (7 * NEAR, NEAR, 6 * NEAR));
    set_ctx(stranger(), 0);
    drop(c.claim(1, acc(list[1].0), U128(list[1].1), hex_proof(&tree.proofs[1]), None));
}

// --------------------------------------------------------------------- callback

#[test]
fn callback_success_keeps_the_claim_and_emits_claim_event() {
    let (mut c, tree) = setup_with_epoch();
    let wallet = acc("player-wallet.testnet");
    claim_leaf(&mut c, &tree, 0, acc("tg1.isle.testnet"), Some(wallet.clone()));
    assert!(events().is_empty(), "the claim event is emitted once the transfer settled");
    let before = pool(&c);

    set_callback_ctx(true);
    assert!(c.on_claim_settled(EPOCH, acc("tg1.isle.testnet"), U128(NEAR), wallet));

    assert_eq!(
        events(),
        vec![serde_json::json!({
            "standard": "knights-isle-rewards",
            "version": "1.0.0",
            "event": "claim",
            "data": [{
                "epoch": 3,
                "account_id": "tg1.isle.testnet",
                "amount": "1000000000000000000000000",
                "recipient": "player-wallet.testnet"
            }]
        })]
    );
    assert!(c.is_claimed(EPOCH, acc("tg1.isle.testnet")));
    assert_eq!(pool(&c), before);
    assert_eq!(c.get_epoch(EPOCH).unwrap().claims, 1);
}

#[test]
fn callback_failure_restores_the_claim_and_it_can_be_claimed_again() {
    let (mut c, tree) = setup_with_epoch();
    let before = pool(&c);
    let gone = acc("deleted-wallet.testnet");
    claim_leaf(&mut c, &tree, 0, acc("tg1.isle.testnet"), Some(gone.clone()));
    assert_ne!(pool(&c), before);

    set_callback_ctx(false);
    assert!(!c.on_claim_settled(EPOCH, acc("tg1.isle.testnet"), U128(NEAR), gone));

    assert_eq!(events()[0]["event"], "claim_failed");
    assert_eq!(events()[0]["data"][0]["recipient"], "deleted-wallet.testnet");
    assert!(!c.is_claimed(EPOCH, acc("tg1.isle.testnet")));
    assert_eq!(pool(&c), before);
    let ep = c.get_epoch(EPOCH).unwrap();
    assert_eq!((ep.claimed_total.0, ep.claims), (0, 0));

    // The player retries with a wallet that exists.
    claim_leaf(&mut c, &tree, 0, acc("tg1.isle.testnet"), None);
    assert_eq!(transfers(), vec![(acc("tg1.isle.testnet"), NEAR)]);
    assert!(c.is_claimed(EPOCH, acc("tg1.isle.testnet")));
}

// ----------------------------------------------------------------- verify_claim

#[test]
fn verify_claim_view() {
    let (c, tree) = setup_with_epoch();
    for (i, (account, amount)) in LEAVES.iter().enumerate() {
        assert!(c.verify_claim(EPOCH, acc(account), U128(*amount), hex_proof(&tree.proofs[i])));
        assert!(!c.verify_claim(
            EPOCH,
            acc(account),
            U128(*amount + 1),
            hex_proof(&tree.proofs[i])
        ));
        assert!(!c.verify_claim(99, acc(account), U128(*amount), hex_proof(&tree.proofs[i])));
    }
}

// ----------------------------------------------------------------- merkle format

#[test]
fn leaf_is_sha256_of_the_documented_string() {
    set_ctx(owner(), 0);
    // Independent constant: `printf %s 'knights-isle:v1:3:tg3.isle.testnet:1' | shasum -a 256`
    assert_eq!(
        to_hex(&leaf_hash(3, &acc("tg3.isle.testnet"), 1)),
        "74fe4d718b13654487c5c74c0c9888c062551741da67a858ad12bc7b089e3f2c"
    );
    assert_eq!(
        leaf_hash(3, &acc("tg3.isle.testnet"), 1),
        env::sha256_array(b"knights-isle:v1:3:tg3.isle.testnet:1")
    );
}

#[test]
fn parent_is_order_independent_and_sorted() {
    set_ctx(owner(), 0);
    let lo = [0x01u8; 32];
    let hi = [0xfeu8; 32];
    let mut concat = lo.to_vec();
    concat.extend_from_slice(&hi);
    assert_eq!(parent_hash(&lo, &hi), env::sha256_array(&concat));
    assert_eq!(parent_hash(&hi, &lo), env::sha256_array(&concat));

    // Bytewise comparison: the first differing byte decides.
    let mut a = [0x7fu8; 32];
    let mut b = [0x7fu8; 32];
    a[31] = 0x80;
    b[31] = 0x10;
    let mut concat = b.to_vec();
    concat.extend_from_slice(&a);
    assert_eq!(parent_hash(&a, &b), env::sha256_array(&concat));
}

#[test]
fn single_leaf_tree_has_root_equal_to_leaf_and_empty_proof() {
    let mut c = setup();
    deposit(&mut c, NEAR);
    let leaf = leaf_hash(9, &acc("tg1.isle.testnet"), 77);
    let tree = build_tree(&[leaf]);
    assert_eq!(tree.root, leaf);
    assert!(tree.proofs[0].is_empty());

    set_ctx(owner(), 0);
    c.set_epoch_root(9, to_hex(&leaf), U128(77));
    set_ctx(acc("tg1.isle.testnet"), 0);
    drop(c.claim(9, acc("tg1.isle.testnet"), U128(77), vec![], None));
    assert_eq!(transfers(), vec![(acc("tg1.isle.testnet"), 77)]);
    assert_eq!(pool(&c), (NEAR - 77, 0, NEAR - 77));
}

#[test]
fn five_leaf_tree_has_the_documented_shape() {
    set_ctx(owner(), 0);
    let l = leaves_of(EPOCH, &LEAVES);
    let tree = build_tree(&l);

    let h01 = parent_hash(&l[0], &l[1]);
    let h23 = parent_hash(&l[2], &l[3]);
    let h0123 = parent_hash(&h01, &h23);
    // The 5th leaf is promoted twice and meets the rest at the top.
    assert_eq!(tree.root, parent_hash(&h0123, &l[4]));
    assert_eq!(tree.proofs[0], vec![l[1], h23, l[4]]);
    assert_eq!(tree.proofs[1], vec![l[0], h23, l[4]]);
    assert_eq!(tree.proofs[2], vec![l[3], h01, l[4]]);
    assert_eq!(tree.proofs[3], vec![l[2], h01, l[4]]);
    assert_eq!(tree.proofs[4], vec![h0123]);
}

/// sha256 over, for n = 1..=33: root ‖ every proof item (leaves in order), for
/// leaves `(epoch n, tg{i}.isle.testnet, i + 1)`, i in 0..n.
/// verify-vectors.mjs computes the same digest with its own tree builder, so
/// both implementations agree on every tree shape up to 33 leaves.
const SHAPES_DIGEST: &str = "5a0c3e6a810bc2f1ddfcbe9591942cb001a99f422bdece7e0ccfe8ace8124169";

#[test]
fn every_proof_verifies_for_tree_sizes_1_to_33() {
    set_ctx(owner(), 0);
    let mut all = Vec::new();
    for n in 1..=33u128 {
        let leaves: Vec<Hash> = (0..n)
            .map(|i| leaf_hash(n as u64, &acc(&format!("tg{i}.isle.testnet")), i + 1))
            .collect();
        let tree = build_tree(&leaves);
        all.extend_from_slice(&tree.root);
        for (i, leaf) in leaves.iter().enumerate() {
            assert_eq!(compute_root(*leaf, &tree.proofs[i]), tree.root, "n={n} leaf={i}");
            // A leaf that is not in the tree does not verify with this path.
            let outsider = leaf_hash(n as u64, &acc("mallory.testnet"), i as u128 + 1);
            assert_ne!(compute_root(outsider, &tree.proofs[i]), tree.root, "n={n} leaf={i}");
            tree.proofs[i].iter().for_each(|h| all.extend_from_slice(h));
        }
    }
    assert_eq!(to_hex(&env::sha256_array(&all)), SHAPES_DIGEST);
}

// ----------------------------------------------------------------- test vectors

fn vectors_json() -> serde_json::Value {
    let leaves = leaves_of(EPOCH, &LEAVES);
    let tree = build_tree(&leaves);
    let items: Vec<serde_json::Value> = LEAVES
        .iter()
        .enumerate()
        .map(|(i, (account, amount))| {
            serde_json::json!({
                "account_id": account,
                "amount": amount.to_string(),
                "leaf": to_hex(&leaves[i]),
                "proof": hex_proof(&tree.proofs[i]),
            })
        })
        .collect();
    serde_json::json!({ "epoch": EPOCH, "leaves": items, "root": to_hex(&tree.root) })
}

/// `test-vectors.json` is the contract between this crate and the TypeScript
/// merkle builder. Regenerate with `UPDATE_TEST_VECTORS=1 cargo test vectors`.
#[test]
fn test_vectors_file_matches_the_contract() {
    set_ctx(owner(), 0);
    let expected = vectors_json();
    if std::env::var("UPDATE_TEST_VECTORS").is_ok() {
        let mut text = serde_json::to_string_pretty(&expected).unwrap();
        text.push('\n');
        std::fs::write(VECTORS_PATH, text).unwrap();
    }
    let text = std::fs::read_to_string(VECTORS_PATH)
        .expect("test-vectors.json is missing; run UPDATE_TEST_VECTORS=1 cargo test vectors");
    let on_disk: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(on_disk, expected);
    assert_eq!(LEAVES.iter().map(|l| l.1).sum::<u128>(), LEAVES_TOTAL);
}

/// The vectors in the file, replayed as real claims against the contract.
#[test]
fn test_vectors_file_claims_on_the_contract() {
    let text = std::fs::read_to_string(VECTORS_PATH).expect("test-vectors.json is missing");
    let v: serde_json::Value = serde_json::from_str(&text).unwrap();
    let epoch = v["epoch"].as_u64().unwrap();

    let mut c = setup();
    deposit(&mut c, 10 * NEAR);
    set_ctx(owner(), 0);
    c.set_epoch_root(epoch, v["root"].as_str().unwrap().to_string(), U128(LEAVES_TOTAL));

    for leaf in v["leaves"].as_array().unwrap() {
        let account = acc(leaf["account_id"].as_str().unwrap());
        let amount: u128 = leaf["amount"].as_str().unwrap().parse().unwrap();
        let proof: Vec<String> = serde_json::from_value(leaf["proof"].clone()).unwrap();
        assert_eq!(to_hex(&leaf_hash(epoch, &account, amount)), leaf["leaf"].as_str().unwrap());
        set_ctx(stranger(), 0);
        drop(c.claim(epoch, account.clone(), U128(amount), proof, None));
        assert_eq!(transfers(), vec![(account, amount)]);
    }
    assert_eq!(c.get_epoch(epoch).unwrap().claimed_total, U128(LEAVES_TOTAL));
    assert_eq!(c.get_pool().reserved, U128(0));
}
