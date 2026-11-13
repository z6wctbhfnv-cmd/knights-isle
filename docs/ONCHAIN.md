# Knight's Isle on NEAR testnet

Everything below is on NEAR **testnet** and can be checked in the explorer. Recorded on 13 Nov 2026.

## Accounts

| What | Account |
|---|---|
| Game account (relayer, pays gas, owner of both contracts) | [`knights-isle.testnet`](https://testnet.nearblocks.io/address/knights-isle.testnet) |
| Resources, NEP-245 multi-token (`contracts/resources`) | [`res.knights-isle.testnet`](https://testnet.nearblocks.io/address/res.knights-isle.testnet) |
| Weekly reward pool with merkle claims (`contracts/rewards-pool`) | [`pool.knights-isle.testnet`](https://testnet.nearblocks.io/address/pool.knights-isle.testnet) |
| Wandering trader (NPC with its own account) | `trader.knights-isle.testnet` |
| Resident islands (NPCs with their own accounts and knights) | `npc-snow`, `npc-tropical`, `npc-desert`, `npc-forest` `.knights-isle.testnet` |
| A player and their knight | `<id>.knights-isle.testnet`, `knight-<id>.knights-isle.testnet` |
| Archipelago treasury (Sputnik DAO v2), created when the archipelago first won a week | [`kisle-310f8b.sputnikv2.testnet`](https://testnet.nearblocks.io/address/kisle-310f8b.sputnikv2.testnet) |

Players never see a wallet. The game creates their accounts and holds their keys (custodial): every key is derived from one server secret, so the database stores no private keys. A player's or knight's own account signs each token transfer as a NEP-366 meta-transaction; the game account relays it and pays the gas.

## Proof run (scripts/testnet-setup.ts)

| Step | Transaction |
|---|---|
| Create a player, a knight and a neighbour account | [HXYZ7YFq…](https://testnet.nearblocks.io/txns/HXYZ7YFqep5SVE82P12s7JoMHqZr4GvJnmuVvVW4SX14), [6CHAofJP…](https://testnet.nearblocks.io/txns/6CHAofJPLrKQDhPskyvtgnK6X1tckELXWqYEn2QdvpHE), [7pS7i35f…](https://testnet.nearblocks.io/txns/7pS7i35frZYdVxHJhFGe2UsCzL8pFJ8YMe4Ca99UGiWM) |
| Mint 20 ice to the player | [6Fv2PhV3…](https://testnet.nearblocks.io/txns/6Fv2PhV3sGPMLRT4HzPYSm87u94pCMMtzAuv3YFcVQsj) |
| Player → own knight, 15 ice (meta-transaction) | [Dq5xaMdt…](https://testnet.nearblocks.io/txns/Dq5xaMdtP2mQvgvQAqNg5iP7rp84jZr9LaQfW9cMZHER) |
| Knight → neighbour, 12 ice (meta-transaction) | [36V4y6ve…](https://testnet.nearblocks.io/txns/36V4y6vefgJCBJCjfHzzz5AfqREyJrsciyfB4BVBEXPd) |
| Pool deposit 0.3 NEAR | [5YA1S8nc…](https://testnet.nearblocks.io/txns/5YA1S8ncEuhZ6RHyi337S2bvsU9dBU435sMTNx3t6hNe) |
| Epoch root, 2 leaves | [8YHPtSpC…](https://testnet.nearblocks.io/txns/8YHPtSpCimXDfRHKSt4YL1PFCWYM6o8X3C9sfhkPVH4H) |
| Claim 0.02 NEAR for a leaf | [3xVgYWMe…](https://testnet.nearblocks.io/txns/3xVgYWMe63ctsf3NY5V8QnWSCbNdTkjL7e1rDZZ4Sy4S) |

Balances after the caravan: player 5, knight 3, neighbour 12 ice, as expected.

## Live game run (server with CHAIN=testnet)

A new player picked a Snow island, built, sent ice to a resident's request, asked for timber (the forest resident's knight brought it), founded an archipelago, and the time machine closed the week. `scripts/check-chain.ts` then found every player's game balances equal to the contract's balances.

| Operation | What | Transaction |
|---|---|---|
| create_account | create knight-npc-snow.knights-isle.testnet | [Az2UHXrSyS…](https://testnet.nearblocks.io/txns/Az2UHXrSySmH1QaWRoVA7K7hCrEjsFgxYZrY2ZRiFmtV) |
| create_account | create npc-tropical.knights-isle.testnet | [8L3u7QnP63…](https://testnet.nearblocks.io/txns/8L3u7QnP63a1C2yF9TQUM1uiUqA8JqnvpL4greF9JZar) |
| create_account | create knight-npc-tropical.knights-isle.testnet | [HAvMGD3PgU…](https://testnet.nearblocks.io/txns/HAvMGD3PgUJbwr37BGrsbkvBe5kAbBSX1hUNMksxYgQR) |
| create_account | create npc-desert.knights-isle.testnet | [8UnCGLHMmq…](https://testnet.nearblocks.io/txns/8UnCGLHMmqq1RhZZd9f8oozEjCbBzovJ5jzorU6FuDnB) |
| create_account | create knight-npc-desert.knights-isle.testnet | [44Zj8pskLd…](https://testnet.nearblocks.io/txns/44Zj8pskLdeahpb3GcW5JxM8AUwffrkjJFztzgoRZwdd) |
| create_account | create npc-forest.knights-isle.testnet | [9wGaSxmZCo…](https://testnet.nearblocks.io/txns/9wGaSxmZCo3zhbRw3ynARAqKa1276cDhQj5sA5bRLjXx) |
| create_account | create knight-npc-forest.knights-isle.testnet | [ByhoDcGfVM…](https://testnet.nearblocks.io/txns/ByhoDcGfVM6AqDYQv6sACAM4fSzBUQVQmFrUvzupGDnF) |
| mint | mint to npc-snow.knights-isle.testnet {"energy": 150, "materials": 150, "credits": 150, "ice": 300} | [GuFCE3viCx…](https://testnet.nearblocks.io/txns/GuFCE3viCxEr1CZgN9Q73cnxP2RpybTiU7yTauK9nx5t) |
| mint | mint to npc-tropical.knights-isle.testnet {"energy": 150, "materials": 150, "credits": 150, "fruit": 300} | [GuFCE3viCx…](https://testnet.nearblocks.io/txns/GuFCE3viCxEr1CZgN9Q73cnxP2RpybTiU7yTauK9nx5t) |
| mint | mint to npc-desert.knights-isle.testnet {"energy": 150, "materials": 150, "credits": 150, "glass": 300} | [GuFCE3viCx…](https://testnet.nearblocks.io/txns/GuFCE3viCxEr1CZgN9Q73cnxP2RpybTiU7yTauK9nx5t) |
| mint | mint to npc-forest.knights-isle.testnet {"energy": 150, "materials": 150, "credits": 150, "wood": 300} | [GuFCE3viCx…](https://testnet.nearblocks.io/txns/GuFCE3viCxEr1CZgN9Q73cnxP2RpybTiU7yTauK9nx5t) |
| create_account | create if2bec600e1.knights-isle.testnet | [SgJgnYebTc…](https://testnet.nearblocks.io/txns/SgJgnYebTcuHB5ThpMn1Lq8DrDSajZRrmARLmBstX8X) |
| create_account | create knight-if2bec600e1.knights-isle.testnet | [AgGb6xTbqV…](https://testnet.nearblocks.io/txns/AgGb6xTbqVcHWnE4AUoS2A32u3yqL2uwFyCwmQEWtKi) |
| create_account | create trader.knights-isle.testnet | [EULkCFt7QL…](https://testnet.nearblocks.io/txns/EULkCFt7QL1tzTb44m8yF72VJUd1rvg9jX34d6ZPNg1u) |
| mint | mint to trader.knights-isle.testnet {"ice": 200, "fruit": 200, "glass": 200, "wood": 200, "credits": 1000000} | [GuFCE3viCx…](https://testnet.nearblocks.io/txns/GuFCE3viCxEr1CZgN9Q73cnxP2RpybTiU7yTauK9nx5t) |
| mint | mint to if2bec600e1.knights-isle.testnet {"energy": 150, "materials": 150, "credits": 150} | [GuFCE3viCx…](https://testnet.nearblocks.io/txns/GuFCE3viCxEr1CZgN9Q73cnxP2RpybTiU7yTauK9nx5t) |
| burn | burn from if2bec600e1.knights-isle.testnet {"energy": 150, "materials": 150, "credits": 70} | [4eNPH2DP8Y…](https://testnet.nearblocks.io/txns/4eNPH2DP8YUk35R5gvCb7gCe38jxviBV1NXLQgeMgNUx) |
| mint | mint to if2bec600e1.knights-isle.testnet {"energy": 240, "materials": 160, "credits": 162} | [DUCf6u4D6d…](https://testnet.nearblocks.io/txns/DUCf6u4D6d5efbCWiYBPat69RZ6aFdRJiW4YXJnCCJYm) |
| burn | burn from if2bec600e1.knights-isle.testnet {"energy": 60, "materials": 80, "credits": 40} | [732YDkxfZ2…](https://testnet.nearblocks.io/txns/732YDkxfZ27TQvF4H5BtpuXMzdRkCtCyfAGgXXLcn9f1) |
| transfer | npc-forest.knights-isle.testnet → knight-npc-forest.knights-isle.testnet: 12 wood (caravan cbcd4305e43 departs) | [EdJWUcXeUu…](https://testnet.nearblocks.io/txns/EdJWUcXeUuVkaxBVcGokePRRvw1Cbk5BVdJ8zvaT3jB3) |
| mint | mint to npc-forest.knights-isle.testnet {"credits": 225} | [DUCf6u4D6d…](https://testnet.nearblocks.io/txns/DUCf6u4D6d5efbCWiYBPat69RZ6aFdRJiW4YXJnCCJYm) |
| mint | mint to npc-forest.knights-isle.testnet {"wood": 12} | [DUCf6u4D6d…](https://testnet.nearblocks.io/txns/DUCf6u4D6d5efbCWiYBPat69RZ6aFdRJiW4YXJnCCJYm) |
| transfer | knight-npc-forest.knights-isle.testnet → if2bec600e1.knights-isle.testnet: 12 wood (caravan cbcd4305e43 arrives) | [51FonFZ2ts…](https://testnet.nearblocks.io/txns/51FonFZ2ts8oxCiH7SuLqwmA2WU6JXrSELoZbgq9P9zJ) |
| mint | mint to npc-forest.knights-isle.testnet {"credits": 240} | [DUCf6u4D6d…](https://testnet.nearblocks.io/txns/DUCf6u4D6d5efbCWiYBPat69RZ6aFdRJiW4YXJnCCJYm) |
| mint | mint to if2bec600e1.knights-isle.testnet {"energy": 240, "materials": 160, "credits": 132, "ice": 8} | [DUCf6u4D6d…](https://testnet.nearblocks.io/txns/DUCf6u4D6d5efbCWiYBPat69RZ6aFdRJiW4YXJnCCJYm) |
| burn | burn from if2bec600e1.knights-isle.testnet {"energy": 90, "materials": 140, "credits": 80} | [732YDkxfZ2…](https://testnet.nearblocks.io/txns/732YDkxfZ27TQvF4H5BtpuXMzdRkCtCyfAGgXXLcn9f1) |
| transfer | if2bec600e1.knights-isle.testnet → knight-if2bec600e1.knights-isle.testnet: 5 ice (caravan c82050e3f31 departs) | [EfNXYip12j…](https://testnet.nearblocks.io/txns/EfNXYip12jkDWDqxJVMPWJCbHnq9THm2oEsSeDFPcMMt) |
| mint | mint to if2bec600e1.knights-isle.testnet {"credits": 30} | [DUCf6u4D6d…](https://testnet.nearblocks.io/txns/DUCf6u4D6d5efbCWiYBPat69RZ6aFdRJiW4YXJnCCJYm) |
| transfer | knight-if2bec600e1.knights-isle.testnet → npc-tropical.knights-isle.testnet: 5 ice (caravan c82050e3f31 arrives) | [9Z1XiiZ1wo…](https://testnet.nearblocks.io/txns/9Z1XiiZ1woYnjLscD79u2FqfyxLqb555Pw5yry9ZM7tL) |
| mint | mint to if2bec600e1.knights-isle.testnet {"credits": 100} | [CxpJ64mmpc…](https://testnet.nearblocks.io/txns/CxpJ64mmpc1ff7H28XkkxYUFAqydFK94sh9v5sAZBq5o) |
| create_dao | Sputnik DAO kisle-310f8b.sputnikv2.testnet, council if2bec600e1.knights-isle.testnet | [Gs9wXrHmio…](https://testnet.nearblocks.io/txns/Gs9wXrHmioVvus1kJN1aQiUPRDYbrn3zMzxNRXEEv4Ys) |
| set_epoch_root | epoch 1794576305001 root 2efa82223b8f… total 2000000000000000000000 yocto | [9TmAxA6nPL…](https://testnet.nearblocks.io/txns/9TmAxA6nPLABBjar816JMETSDbnvNBNh5SwoUSM5LpLD) || claim (script) | Treasury leaf of week 1 paid into the archipelago's DAO, +0.002 NEAR | [TyQnAGrC…](https://testnet.nearblocks.io/txns/TyQnAGrC8Y8boWXDwrxKRHBKWRHb5j64J7d8D58g5aE) |

## Costs measured on testnet

| Action | Cost to the game account |
|---|---|
| Deploy resources contract (214 KB) | ~2.15 NEAR locked for storage |
| Deploy reward pool (170 KB) | ~1.70 NEAR locked for storage |
| Create a game account (5 milliNEAR funding included) | 0.0121 NEAR |
| Mint, burn, epoch root | 0.0002 NEAR |
| Relayed token transfer (meta-transaction) | 0.0003 NEAR |
| Claim | 0.00045 NEAR |
| Sputnik DAO for an archipelago | 6 NEAR (5.4 locked for its storage) |

Every transaction took 12–19 s to execute. The game never waits for the chain: actions are queued and a background processor sends them in order (`apps/server/src/ops.ts`).
