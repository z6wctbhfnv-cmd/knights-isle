# Competitor scouting — NEAR Hackathon (snapshot 2026-11-13)

Source: `nearhackathon.com/api/projects` (782 projects, was 494 on 11.11) + the demo post texts on X.
By track: **games 69**, **swarms 84**, nfts 68. The number of games has doubled in 2 days.

## 1. Main conclusion

**The market of AI traders with their own wallet and dynamic prices is overcrowded.** About 15 teams do it:
Nims, Meridian, Bazaar Sovereign, Ashes of the Ninth Heaven, Capybazaar, Hearthmarket, Squeek Market, DeepSea Hunter, DiveMarket, Farmverse, Buddies Blitz, Copper Acorn, Worldo, Merchants of NEAR, Lantern Caravan, Coop Tycoon, Lunearcy.
→ Making "one more bazaar with AI traders" = dissolving in the crowd. We can take the mechanic, but **not as the main feature**.

**Free niches (nobody has closed them):**
| Niche | Who is nearby | How occupied |
|---|---|---|
| A game that lives **in Telegram** (bot + Mini App) | NEAR Saboteur (they have "also a TG bot"), Near Legion (NFT staking in TG, track nfts) | almost empty |
| **Idle/cozy island** — you build your own, it grows offline | Lunearcy (a cozy dragon shelter), Farmverse (a farm) | empty by genre |
| **A personal AI companion with memory** that lives with you | Petri (an AI pet NFT pays for its own "brain"), NEARlyHuman (an AI rooster) | weak |
| Social mechanics through **Telegram groups/chats** (visits, raids, help) | DUEL (disputes in a group chat) | empty |
| **Real players already exist** | Yupland Heroes (600+ players, 66K DARAI holders) | 1 project |

## 2. Top by attention (likes / views)

| Project | ♥ / 👁 | What it is | What to take |
|---|---|---|---|
| Merchants of NEAR | 186 / 1.3K | a trading civilization, 10 AI traders, caravans, guilds, a business = an on-chain asset | a business building as a transferable asset; soulbound achievement badges |
| Crownfall | 140 / 3.9K | 3D, 8 houses with memecoins, entering the game burns a coin, season → prize pool | **season + a prize pool for the winning side**; Google login, the account is created by itself |
| KEYFALL | 110 / 2.1K | a memecoin game, raids on "red bags", post-quantum keys | a story hook clear in 1 phrase |
| DUEL | 73 / 1.3K | disputes with friends, escrow, voting in a group chat | **group chat mechanic** — native to TG |
| Yupland Heroes | 68 / 1.2K | a fantasy world, "hero first, crypto later", 600+ players, match-3 | "play first, wallet optional"; real player numbers in the pitch |
| Crucible | 66 / 2.2K | trick an AI guard in 3 messages → the contract pays 0.5 NEAR | **a short AI challenge with a payout** — a great mini-game |
| Hangry Mochi | 53 / 31K | a memecoin "starves", burn to feed it | the virality of a "living" creature that must be fed |
| CT Life | 53 / 1.6K | "Sims for crypto" | positioning in one phrase |
| DiveMarket | 37 / 1.4K | fishing, every fish has a real supply and price | — |
| Nims | 32 / 1.8K | 8 trader agents, bargaining in character, **they notice that you play them against each other**; a council of players+traders on Sputnik DAO | emergent behavior of agents with memory; a vote that changes the economy tomorrow |
| Feral | 29 / 840 | a swarm of AI creatures, each = a NEAR account, spends MUNCH on "thoughts", breeds, dies into stone | **an agent pays for its own inference**; offspring = new accounts; Chain Signatures |

## 3. Recurring technical "norms" (judges already see them everywhere — without them we are below the bar)

- **No wallet at entry**: Google/email → a real NEAR account (NEAR Auth / relayer), no popups (NEP-366 meta-tx / function-call keys). Crownfall, Worldo, Lunearcy, Nims, Farmverse, Nearverse have it.
- **Items = NEP-245** in one contract (Nims, Worldo, Lunearcy, Squeek).
- **NPCs with their own NEAR account and a limited key** (Meridian: a key for 3 methods; Hearthmarket: "limits the AI cannot break").
- **NEAR AI Cloud in a TEE** + signature check (Petri, Realsies, Bluffalo).
- **A code link + a live demo** in the post — almost all strong ones have it.
- Guilds = **Sputnik DAO** (Meridian, Nims).
- NEAR payouts through **NEAR Intents** (NEAR Saboteur: the weekly top 3 are paid on mainnet).

## 4. Direct overlaps with our idea

| Project | Overlap | How we differ |
|---|---|---|
| **NEAR Saboteur** | TG bot, weekly top-3 rewards in NEAR (mainnet, Intents), referrals, Play Pass | for them TG is an add-on to the site; for us the game is **entirely in TG**. Their weekly payouts are a direct reference for our claim. |
| Near Legion (nfts) | NFT + market inside Telegram | it is not a game; and **crypto inside TG** is exactly the TON rule risk, we avoid it with the claim site |
| Lantern Caravan | caravans + autonomous carriers | if we take caravans with a knight — the difference: TG, islands, a personal Buddy |
| Lunearcy / Farmverse | cozy, "one shelf — another's sale moves your price" | we have our own island + idle + Buddy; we can take the shared market |
| Petri / NEARlyHuman | an AI creature with a balance | our Buddy is an island resident with memory, not an NFT tamagotchi |

## 5. Feature candidates to "steal" (to decide)

1. Entry without a wallet: the account is created from the Telegram ID, the wallet is linked only for claim. *(a norm)*
2. A 1–2 week season → a prize pool for the best (Crownfall / NEAR Saboteur).
3. The Buddy pays for its own inference from the island balance (Feral, Petri) — nice for track 05.
4. NPC agents with memory that **notice your patterns** (Nims).
5. A mini-game "persuade the AI" with a payout from a capped pool (Crucible, Bouncer).
6. A players' vote that changes the economy tomorrow (Nims / Sputnik DAO).
7. A shared market: another player's sale moves your price (Lunearcy).
8. Soulbound achievement badges (Merchants of NEAR).
9. A group chat as the game field: disputes, raids, helping neighbors (DUEL).
10. Real player metrics in the pitch (Yupland).
11. A building/plot = a transferable asset with a history (Merchants, Capybazaar).

## 6. The bar we have to clear

Code in an open repo + a live demo + a "what is really on-chain" table + a judge's path. The strongest games (Crownfall, Nims, Merchants) do all this; **none lives in Telegram and none is an idle builder with a personal AI**. This is our wedge.

---

# Similar games in Telegram (outside the hackathon)

| Game | Mechanic | What worked / failed | What we take |
|---|---|---|---|
| Hamster Kombat (TON) | tap + "income per hour" from upgrade cards, Daily Combo/Cipher, referrals | 300M players → 41M a month after the airdrop: the reason to play was gone | income per hour, a daily puzzle; **do not** build the game around a future token |
| Notcoin | pure tap | the token outlived the game | — |
| Catizen | idle merge of cats, passive income, tournaments, then a game center | holds DAU longer than tappers: collection + growth | idle income + collecting |
| HOT Wallet (**NEAR**) | a wallet-miner: the "storage" fills up, come in every 2 h and collect; boosters; **"villages"** (clans, 5% of income to the village) | a NEAR-native TG project, a precedent | "storage is full — come collect" = our Storage; **villages → archipelagos** |
| EggDrop (Gomble) | social challenges, treasure hunt | 2.8M MAU, retention without a token | treasure hunt, challenges |
| Blum / Major / Tomarket | daily check-in, tasks, leaderboards, squads | | streak check-in, squads |
| Boinkers / Dig It | a parody of crypto culture; digging | | humor and easter eggs |

**Conclusion from the TG market:** the games that survive have quests, social mechanics and growth that work **at a token price = 0**. We start from this: the NEAR reward is a bonus, not the reason to play.

## ⚠️ Telegram rule (core.telegram.org/bots/blockchain-guidelines) — clarifications

- It applies to **Mini Apps and their bots**. Ordinary bots **without a Mini App are excluded** from the rule.
- Forbidden in a Mini App: issuing/distributing tokens and **NFTs not on TON**; connecting wallets not through TON Connect; **promoting or linking to platforms with non-TON assets**.
- Consequence for us: NFT buildings on NEAR passing from hand to hand **inside the Mini App** are "distribution of NFTs not on TON". A link to the claim site from the Mini App is also a gray zone. We need to choose (see the questions).
