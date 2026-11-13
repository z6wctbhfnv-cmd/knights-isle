use super::*;
use near_sdk::serde_json;
use near_sdk::test_utils::{accounts, get_logs, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const ALL_IDS: [&str; 7] = ["energy", "materials", "credits", "ice", "fruit", "glass", "wood"];

fn contract_id() -> AccountId {
    "resources.isle.testnet".parse().unwrap()
}
fn owner() -> AccountId {
    accounts(0)
}
fn minter() -> AccountId {
    accounts(1)
}
fn stranger() -> AccountId {
    accounts(2)
}
fn tg(n: u64) -> AccountId {
    format!("tg{n}.isle.testnet").parse().unwrap()
}

fn set_ctx(predecessor: AccountId, yocto: u128) {
    let ctx = VMContextBuilder::new()
        .current_account_id(contract_id())
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .build();
    testing_env!(ctx);
}

fn setup() -> Contract {
    set_ctx(owner(), 0);
    let mut c = Contract::new(owner());
    c.add_minter(minter());
    c
}

fn ids(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}
fn amts(list: &[u128]) -> Vec<U128> {
    list.iter().map(|a| U128(*a)).collect()
}

fn mint(c: &mut Contract, to: &AccountId, list: &[&str], amounts: &[u128]) {
    set_ctx(minter(), 0);
    c.mint_batch(to.clone(), ids(list), amts(amounts), None);
}

fn bal(c: &Contract, account: &AccountId, id: &str) -> u128 {
    c.mt_balance_of(account.clone(), id.to_string()).0
}
fn supply(c: &Contract, id: &str) -> u128 {
    c.mt_supply(id.to_string()).unwrap().0
}

/// All NEP-297 events logged since the last `set_ctx`.
fn events() -> Vec<serde_json::Value> {
    get_logs()
        .iter()
        .map(|l| l.strip_prefix("EVENT_JSON:").expect("every log line is an event"))
        .map(|j| serde_json::from_str::<serde_json::Value>(j).unwrap())
        .collect()
}

// ---------------------------------------------------------------- init / admin

#[test]
fn new_sets_owner_and_no_minters() {
    set_ctx(owner(), 0);
    let c = Contract::new(owner());
    assert_eq!(c.get_owner(), owner());
    assert!(c.get_minters().is_empty());
    assert_eq!(c.get_token_ids(), ids(&ALL_IDS));
    for id in ALL_IDS {
        assert_eq!(supply(&c, id), 0);
    }
}

#[test]
fn owner_adds_and_removes_minters() {
    let mut c = setup();
    assert_eq!(c.get_minters(), vec![minter()]);
    assert!(c.is_minter(minter()));
    assert!(!c.add_minter(minter()), "second add reports false");
    assert!(c.add_minter(stranger()));
    assert_eq!(c.get_minters().len(), 2);
    assert!(c.remove_minter(minter()));
    assert!(!c.remove_minter(minter()), "second remove reports false");
    assert_eq!(c.get_minters(), vec![stranger()]);
    assert!(!c.is_minter(minter()));
}

#[test]
#[should_panic(expected = "Only the contract owner can call this method")]
fn add_minter_by_non_owner_panics() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.add_minter(stranger());
}

#[test]
#[should_panic(expected = "Only the contract owner can call this method")]
fn remove_minter_by_non_owner_panics() {
    let mut c = setup();
    set_ctx(stranger(), 0);
    c.remove_minter(minter());
}

// ------------------------------------------------------------------------ mint

#[test]
fn mint_batch_updates_balances_supply_and_emits_event() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.mint_batch(tg(1), ids(&["ice", "wood"]), amts(&[20, 5]), Some("tick 7".into()));

    assert_eq!(bal(&c, &tg(1), "ice"), 20);
    assert_eq!(bal(&c, &tg(1), "wood"), 5);
    assert_eq!(bal(&c, &tg(1), "energy"), 0);
    assert_eq!(supply(&c, "ice"), 20);
    assert_eq!(supply(&c, "wood"), 5);
    assert_eq!(supply(&c, "glass"), 0);

    assert_eq!(
        events(),
        vec![serde_json::json!({
            "standard": "nep245",
            "version": "1.0.0",
            "event": "mt_mint",
            "data": [{
                "owner_id": "tg1.isle.testnet",
                "token_ids": ["ice", "wood"],
                "amounts": ["20", "5"],
                "memo": "tick 7"
            }]
        })]
    );

    // A second mint adds up.
    mint(&mut c, &tg(1), &["ice"], &[1]);
    assert_eq!(bal(&c, &tg(1), "ice"), 21);
    assert_eq!(supply(&c, "ice"), 21);
}

#[test]
fn mint_event_without_memo_has_no_memo_key() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["credits"], &[3]);
    let ev = events();
    assert_eq!(ev.len(), 1);
    assert!(ev[0]["data"][0].get("memo").is_none());
    assert!(ev[0]["data"][0].get("authorized_id").is_none());
}

#[test]
fn mint_all_seven_ids_with_u128_max() {
    let mut c = setup();
    mint(&mut c, &tg(1), &ALL_IDS, &[u128::MAX; 7]);
    for id in ALL_IDS {
        assert_eq!(bal(&c, &tg(1), id), u128::MAX);
        assert_eq!(supply(&c, id), u128::MAX);
    }
    assert_eq!(events()[0]["data"][0]["amounts"][0], u128::MAX.to_string());
}

#[test]
#[should_panic(expected = "Only minters can call this method")]
fn mint_by_stranger_panics() {
    let mut c = setup();
    set_ctx(stranger(), 0);
    c.mint_batch(tg(1), ids(&["ice"]), amts(&[1]), None);
}

#[test]
#[should_panic(expected = "Only minters can call this method")]
fn mint_by_owner_who_is_not_minter_panics() {
    let mut c = setup();
    set_ctx(owner(), 0);
    c.mint_batch(tg(1), ids(&["ice"]), amts(&[1]), None);
}

#[test]
#[should_panic(expected = "Only minters can call this method")]
fn removed_minter_cannot_mint() {
    let mut c = setup();
    set_ctx(owner(), 0);
    c.remove_minter(minter());
    set_ctx(minter(), 0);
    c.mint_batch(tg(1), ids(&["ice"]), amts(&[1]), None);
}

#[test]
#[should_panic(expected = "Unknown token id: gold")]
fn mint_unknown_token_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice", "gold"], &[1, 1]);
}

#[test]
#[should_panic(expected = "token_ids and amounts must have the same length")]
fn mint_length_mismatch_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice", "wood"], &[1]);
}

#[test]
#[should_panic(expected = "token_ids must not be empty")]
fn mint_empty_batch_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &[], &[]);
}

#[test]
#[should_panic(expected = "Amount must be greater than 0")]
fn mint_zero_amount_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[0]);
}

#[test]
#[should_panic(expected = "Duplicate token id in one batch")]
fn mint_duplicate_token_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice", "ice"], &[1, 1]);
}

#[test]
#[should_panic(expected = "Total supply overflow")]
fn mint_supply_overflow_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[u128::MAX]);
    mint(&mut c, &tg(2), &["ice"], &[1]);
}

#[test]
#[should_panic(expected = "memo must be <= 256 bytes")]
fn mint_long_memo_panics() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.mint_batch(tg(1), ids(&["ice"]), amts(&[1]), Some("x".repeat(257)));
}

// ------------------------------------------------------------------- mint_many

#[test]
fn mint_many_mints_to_several_players_in_one_event() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.mint_many(vec![
        (tg(1), ids(&["ice", "energy"]), amts(&[10, 3])),
        (tg(2), ids(&["ice"]), amts(&[7])),
        (tg(1), ids(&["ice"]), amts(&[1])), // the same player twice is fine
    ]);
    assert_eq!(bal(&c, &tg(1), "ice"), 11);
    assert_eq!(bal(&c, &tg(1), "energy"), 3);
    assert_eq!(bal(&c, &tg(2), "ice"), 7);
    assert_eq!(supply(&c, "ice"), 18);
    assert_eq!(supply(&c, "energy"), 3);

    assert_eq!(
        events(),
        vec![serde_json::json!({
            "standard": "nep245",
            "version": "1.0.0",
            "event": "mt_mint",
            "data": [
                {"owner_id": "tg1.isle.testnet", "token_ids": ["ice", "energy"], "amounts": ["10", "3"]},
                {"owner_id": "tg2.isle.testnet", "token_ids": ["ice"], "amounts": ["7"]},
                {"owner_id": "tg1.isle.testnet", "token_ids": ["ice"], "amounts": ["1"]}
            ]
        })]
    );
}

/// Worst-case entries: 64-byte account ids, all 7 ids, 39-digit amounts.
fn fat_entries(n: u128) -> Vec<(AccountId, Vec<String>, Vec<U128>)> {
    (0..n)
        .map(|i| {
            let account: AccountId = format!("{:0>64}", i).parse().unwrap();
            (account, ids(&ALL_IDS), amts(&[u128::MAX / 400 - i; 7]))
        })
        .collect()
}

#[test]
fn mint_many_worst_case_batch_fits_one_event() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.mint_many(fat_entries(35));

    let logs = get_logs();
    assert_eq!(logs.len(), 1);
    assert!(logs[0].len() <= 16_384, "log line of {} bytes", logs[0].len());
    assert_eq!(events()[0]["data"].as_array().unwrap().len(), 35);
    assert_eq!(supply(&c, "wood"), (0..35u128).map(|i| u128::MAX / 400 - i).sum::<u128>());
}

#[test]
fn mint_many_typical_batch_of_100_players_fits_one_event() {
    let mut c = setup();
    set_ctx(minter(), 0);
    let entries: Vec<_> = (0..100u64)
        .map(|i| (tg(6_100_000_000 - i), ids(&["energy", "ice", "wood"]), amts(&[120, 45, 9])))
        .collect();
    c.mint_many(entries);
    let logs = get_logs();
    assert_eq!(logs.len(), 1);
    assert!(logs[0].len() <= 16_384, "log line of {} bytes", logs[0].len());
    assert_eq!(supply(&c, "energy"), 12_000);
}

#[test]
#[should_panic(expected = "Batch is too large")]
fn mint_many_with_event_over_16kb_panics() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.mint_many(fat_entries(45));
}

#[test]
#[should_panic(expected = "Only minters can call this method")]
fn mint_many_by_stranger_panics() {
    let mut c = setup();
    set_ctx(stranger(), 0);
    c.mint_many(vec![(tg(1), ids(&["ice"]), amts(&[1]))]);
}

#[test]
#[should_panic(expected = "entries must not be empty")]
fn mint_many_empty_panics() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.mint_many(vec![]);
}

#[test]
#[should_panic(expected = "Unknown token id: gold")]
fn mint_many_with_one_bad_entry_panics() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.mint_many(vec![
        (tg(1), ids(&["ice"]), amts(&[1])),
        (tg(2), ids(&["gold"]), amts(&[1])),
    ]);
}

// ------------------------------------------------------------------------ burn

#[test]
fn burn_batch_updates_balances_supply_and_emits_event() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice", "wood"], &[20, 5]);
    mint(&mut c, &tg(2), &["ice"], &[4]);

    set_ctx(minter(), 0);
    c.burn_batch(tg(1), ids(&["ice", "wood"]), amts(&[8, 5]), Some("build sawmill".into()));

    assert_eq!(bal(&c, &tg(1), "ice"), 12);
    assert_eq!(bal(&c, &tg(1), "wood"), 0);
    assert_eq!(bal(&c, &tg(2), "ice"), 4);
    assert_eq!(supply(&c, "ice"), 16);
    assert_eq!(supply(&c, "wood"), 0);

    assert_eq!(
        events(),
        vec![serde_json::json!({
            "standard": "nep245",
            "version": "1.0.0",
            "event": "mt_burn",
            "data": [{
                "owner_id": "tg1.isle.testnet",
                "authorized_id": minter(),
                "token_ids": ["ice", "wood"],
                "amounts": ["8", "5"],
                "memo": "build sawmill"
            }]
        })]
    );
}

#[test]
fn burn_whole_balance_then_mint_again() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["fruit"], &[9]);
    set_ctx(minter(), 0);
    c.burn_batch(tg(1), ids(&["fruit"]), amts(&[9]), None);
    assert_eq!(bal(&c, &tg(1), "fruit"), 0);
    assert_eq!(supply(&c, "fruit"), 0);
    mint(&mut c, &tg(1), &["fruit"], &[2]);
    assert_eq!(bal(&c, &tg(1), "fruit"), 2);
    assert_eq!(supply(&c, "fruit"), 2);
}

#[test]
#[should_panic(expected = "Not enough balance: tg1.isle.testnet has 5 ice, needs 6")]
fn burn_more_than_balance_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[5]);
    mint(&mut c, &tg(2), &["ice"], &[100]); // supply is enough, the balance is not
    set_ctx(minter(), 0);
    c.burn_batch(tg(1), ids(&["ice"]), amts(&[6]), None);
}

#[test]
#[should_panic(expected = "Not enough balance")]
fn burn_from_empty_account_panics() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.burn_batch(tg(1), ids(&["ice"]), amts(&[1]), None);
}

#[test]
#[should_panic(expected = "Only minters can call this method")]
fn burn_by_stranger_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[5]);
    set_ctx(tg(1), 0); // not even the holder itself
    c.burn_batch(tg(1), ids(&["ice"]), amts(&[1]), None);
}

#[test]
#[should_panic(expected = "Unknown token id: gold")]
fn burn_unknown_token_panics() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.burn_batch(tg(1), ids(&["gold"]), amts(&[1]), None);
}

#[test]
#[should_panic(expected = "token_ids and amounts must have the same length")]
fn burn_length_mismatch_panics() {
    let mut c = setup();
    set_ctx(minter(), 0);
    c.burn_batch(tg(1), ids(&["ice"]), amts(&[1, 2]), None);
}

#[test]
#[should_panic(expected = "Amount must be greater than 0")]
fn burn_zero_amount_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[5]);
    set_ctx(minter(), 0);
    c.burn_batch(tg(1), ids(&["ice"]), amts(&[0]), None);
}

// -------------------------------------------------------------------- transfer

#[test]
fn mt_transfer_moves_tokens_and_emits_event() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);

    set_ctx(tg(1), 1);
    c.mt_transfer(tg(2), "ice".into(), U128(20), None, Some("caravan #4".into()));

    assert_eq!(bal(&c, &tg(1), "ice"), 0);
    assert_eq!(bal(&c, &tg(2), "ice"), 20);
    assert_eq!(supply(&c, "ice"), 20, "a transfer does not change the supply");

    assert_eq!(
        events(),
        vec![serde_json::json!({
            "standard": "nep245",
            "version": "1.0.0",
            "event": "mt_transfer",
            "data": [{
                "old_owner_id": "tg1.isle.testnet",
                "new_owner_id": "tg2.isle.testnet",
                "token_ids": ["ice"],
                "amounts": ["20"],
                "memo": "caravan #4"
            }]
        })]
    );
}

#[test]
fn mt_transfer_partial_without_memo() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["glass"], &[10]);
    set_ctx(tg(1), 1);
    c.mt_transfer(tg(2), "glass".into(), U128(3), None, None);
    assert_eq!(bal(&c, &tg(1), "glass"), 7);
    assert_eq!(bal(&c, &tg(2), "glass"), 3);
    assert!(events()[0]["data"][0].get("memo").is_none());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn mt_transfer_without_deposit_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 0);
    c.mt_transfer(tg(2), "ice".into(), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn mt_transfer_with_two_yocto_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 2);
    c.mt_transfer(tg(2), "ice".into(), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Not enough balance: tg1.isle.testnet has 20 ice, needs 21")]
fn mt_transfer_more_than_balance_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 1);
    c.mt_transfer(tg(2), "ice".into(), U128(21), None, None);
}

#[test]
#[should_panic(expected = "Not enough balance")]
fn mt_transfer_of_someone_elses_tokens_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    // tg2 owns nothing; the minter cannot move players' tokens either.
    set_ctx(minter(), 1);
    c.mt_transfer(tg(2), "ice".into(), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Approvals are not supported")]
fn mt_transfer_with_approval_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(2), 1);
    c.mt_transfer(tg(2), "ice".into(), U128(1), Some((tg(1), 0)), None);
}

#[test]
#[should_panic(expected = "Sender and receiver must differ")]
fn mt_transfer_to_self_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 1);
    c.mt_transfer(tg(1), "ice".into(), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Unknown token id: gold")]
fn mt_transfer_unknown_token_panics() {
    let mut c = setup();
    set_ctx(tg(1), 1);
    c.mt_transfer(tg(2), "gold".into(), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Amount must be greater than 0")]
fn mt_transfer_zero_amount_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 1);
    c.mt_transfer(tg(2), "ice".into(), U128(0), None, None);
}

#[test]
#[should_panic(expected = "memo must be <= 256 bytes")]
fn mt_transfer_long_memo_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 1);
    c.mt_transfer(tg(2), "ice".into(), U128(1), None, Some("x".repeat(257)));
}

#[test]
fn mt_batch_transfer_moves_tokens_and_emits_one_event() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice", "wood", "fruit"], &[20, 5, 9]);

    set_ctx(tg(1), 1);
    c.mt_batch_transfer(tg(2), ids(&["ice", "fruit"]), amts(&[15, 9]), None, None);

    assert_eq!(bal(&c, &tg(1), "ice"), 5);
    assert_eq!(bal(&c, &tg(1), "wood"), 5);
    assert_eq!(bal(&c, &tg(1), "fruit"), 0);
    assert_eq!(bal(&c, &tg(2), "ice"), 15);
    assert_eq!(bal(&c, &tg(2), "fruit"), 9);
    assert_eq!(supply(&c, "ice"), 20);
    assert_eq!(supply(&c, "fruit"), 9);

    assert_eq!(
        events(),
        vec![serde_json::json!({
            "standard": "nep245",
            "version": "1.0.0",
            "event": "mt_transfer",
            "data": [{
                "old_owner_id": "tg1.isle.testnet",
                "new_owner_id": "tg2.isle.testnet",
                "token_ids": ["ice", "fruit"],
                "amounts": ["15", "9"]
            }]
        })]
    );
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn mt_batch_transfer_without_deposit_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 0);
    c.mt_batch_transfer(tg(2), ids(&["ice"]), amts(&[1]), None, None);
}

#[test]
#[should_panic(expected = "Approvals are not supported")]
fn mt_batch_transfer_with_approvals_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 1);
    c.mt_batch_transfer(tg(2), ids(&["ice"]), amts(&[1]), Some(vec![None]), None);
}

#[test]
#[should_panic(expected = "token_ids and amounts must have the same length")]
fn mt_batch_transfer_length_mismatch_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 1);
    c.mt_batch_transfer(tg(2), ids(&["ice", "wood"]), amts(&[1]), None, None);
}

#[test]
#[should_panic(expected = "Not enough balance: tg1.isle.testnet has 0 wood, needs 1")]
fn mt_batch_transfer_with_one_short_balance_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 1);
    c.mt_batch_transfer(tg(2), ids(&["ice", "wood"]), amts(&[1, 1]), None, None);
}

#[test]
#[should_panic(expected = "Duplicate token id in one batch")]
fn mt_batch_transfer_duplicate_token_panics() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice"], &[20]);
    set_ctx(tg(1), 1);
    c.mt_batch_transfer(tg(2), ids(&["ice", "ice"]), amts(&[1, 1]), None, None);
}

// ----------------------------------------------------------------------- views

#[test]
fn balance_and_supply_views() {
    let mut c = setup();
    mint(&mut c, &tg(1), &["ice", "wood"], &[20, 5]);

    assert_eq!(
        c.mt_batch_balance_of(tg(1), ids(&["wood", "ice", "energy", "gold"])),
        amts(&[5, 20, 0, 0])
    );
    assert_eq!(bal(&c, &tg(1), "gold"), 0, "unknown token id reads as 0");
    assert_eq!(bal(&c, &tg(9), "ice"), 0, "unknown account reads as 0");

    assert_eq!(c.mt_supply("ice".into()), Some(U128(20)));
    assert_eq!(c.mt_supply("energy".into()), Some(U128(0)));
    assert_eq!(c.mt_supply("gold".into()), None);
    assert_eq!(
        c.mt_batch_supply(ids(&["wood", "gold", "ice"])),
        vec![Some(U128(5)), None, Some(U128(20))]
    );
}

#[test]
fn mt_token_view_and_json_shape() {
    let c = setup();
    let tokens = c.mt_token(ids(&["ice", "gold"]));
    assert_eq!(
        serde_json::to_value(&tokens).unwrap(),
        serde_json::json!([
            {"token_id": "ice", "owner_id": null, "base_metadata_id": "ice"},
            null
        ])
    );
}

#[test]
fn metadata_views_and_json_shape() {
    let c = setup();
    assert_eq!(
        serde_json::to_value(c.mt_metadata_contract()).unwrap(),
        serde_json::json!({"spec": "mt-1.0.0", "name": "Knight's Isle Resources"})
    );

    let base = serde_json::json!({
        "name": "Ice", "id": "ice", "symbol": "ICE", "icon": null, "decimals": "0",
        "base_uri": null, "reference": null, "copies": null, "reference_hash": null
    });
    assert_eq!(
        serde_json::to_value(c.mt_metadata_base_by_token_id(ids(&["ice"]))).unwrap(),
        serde_json::json!([base])
    );
    assert_eq!(
        c.mt_metadata_base_by_metadata_id(ids(&["ice"])),
        c.mt_metadata_base_by_token_id(ids(&["ice"]))
    );

    let all = serde_json::to_value(c.mt_metadata_token_all(ids(&ALL_IDS))).unwrap();
    assert_eq!(all.as_array().unwrap().len(), 7);
    assert_eq!(all[3]["base"], base);
    assert_eq!(all[3]["token"]["title"], "Ice");
    assert_eq!(all[3]["token"]["media"], serde_json::Value::Null);
    assert_eq!(all[3]["token"].as_object().unwrap().len(), 11);
    for (i, id) in ALL_IDS.iter().enumerate() {
        assert_eq!(all[i]["base"]["id"], *id);
        assert_eq!(all[i]["base"]["decimals"], "0");
    }

    let token = c.mt_metadata_token_by_token_id(ids(&["wood"]));
    assert_eq!(token[0].title.as_deref(), Some("Wood"));
}

#[test]
#[should_panic(expected = "Unknown token id: gold")]
fn metadata_for_unknown_token_panics() {
    let c = setup();
    c.mt_metadata_token_all(ids(&["ice", "gold"]));
}

/// The call arguments exactly as a NEP-245 client sends them must deserialize
/// (near-sdk does the same `serde_json` parsing on-chain).
#[test]
fn argument_json_shapes_deserialize() {
    let approval: Option<Approval> = serde_json::from_str(r#"["tg1.isle.testnet", 7]"#).unwrap();
    assert_eq!(approval, Some((tg(1), 7)));
    let approvals: Option<Vec<Option<Approval>>> =
        serde_json::from_str(r#"[null, ["tg1.isle.testnet", 7]]"#).unwrap();
    assert_eq!(approvals, Some(vec![None, Some((tg(1), 7))]));
    let entries: Vec<(AccountId, Vec<String>, Vec<U128>)> =
        serde_json::from_str(r#"[["tg1.isle.testnet", ["ice", "wood"], ["20", "5"]]]"#).unwrap();
    assert_eq!(entries, vec![(tg(1), ids(&["ice", "wood"]), amts(&[20, 5]))]);
}
