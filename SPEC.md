# SPEC — Knight's Isle (TG game, NEAR Hackathon)

Working spec for the implementing session. Decisions: [BRIEF.md](BRIEF.md) · Market: [COMPETITORS.md](COMPETITORS.md) · Original concept: [docs/Your_Own_Island_Concept.docx](docs/Your_Own_Island_Concept.docx)

## 1. What we are building — one paragraph

A cozy idle builder in Telegram: every player has their own flying island in one of 4 biomes. Buildings collect resources while the player is offline. The player sends their own guardian knight (the character from the beanie won at the last NEAR hackathon) with caravans to neighbors: he helps and gives rare resources that the neighbors need to level up. Islands join into archipelagos with a shared treasury. Every week a NEAR pool is split between players by points, and the best archipelago gets a prize into its treasury. **Inside Telegram the blockchain is not visible at all.** Accounts, resources, gifts, treasuries and payouts still really live on NEAR testnet, and rewards are claimed on a separate site.

**Tracks:** 09 Games With Real Economies · 12 Social Money · 13 Open Innovation.
**Wedge against competitors:** of the 69 games in the hackathon, none lives in Telegram and none is an idle builder; we avoid the AI-trader market (~15 projects).

## 2. System parts

| Part | What | Stack |
|---|---|---|
| Bot | `/start` (+ `?start=ref_<id>`), opens the Mini App, notifications | grammY, webhook |
| Mini App | island (isometric), building, caravans, request board, archipelago, tasks, Treasure Hunt, visits | React |
| Backend | game state, idle ticks, points, anti-sybil, relayer for on-chain operations | TypeScript, Vercel + Turso |
| Contracts | NEP-245 resources, reward pool with merkle claim | Rust, testnet |
| DAO | archipelago treasury | Sputnik DAO (existing factory) |
| Rewards site | Telegram Login → link own wallet → claim; treasury votes; "proofs" page | static site + backend |

Telegram rule (core.telegram.org/bots/blockchain-guidelines): in the Mini App and the bot **not a word about NEAR**, no links to the rewards site or to wallets. People find the site through X and the README.

## 3. Game loop

- **Every 30 s:** tap "collect" on a full building, build or upgrade, a knight line (from a script).
- **Every 5 min:** send a caravan from the request board, post your own request, find a treasure in Treasure Hunt.
- **Every session (5–10 min):** collect what has built up, do the daily tasks, visit others and leave a like, check the archipelago.
- **Week (epoch):** points checkpoint → payout from the pool → archipelago ranking.
- **Season (4 weeks):** a theme, a final prize for the archipelago.

## 4. Content v1

- **Biomes (4):** Snow, Tropical, Desert, Forest. A small bonus from the docx plus its own rare resource.
- **Resources:** the basic Energy, Materials, Credits are for everyone. Rare: Ice (Snow), Fruit (Tropical), Glass (Desert), Wood (Forest).
- **Buildings (8 × 10 levels):** Solar Farm, Factory, Data Center, House, Storage, Research Lab, Entertainment Center, Harbor (port: caravans and their capacity). The AI Center from the docx is replaced by Harbor, because there is no AI. **From level 5 an upgrade needs other players' rare resources.**
- **Storage:** the storage is limited; when it fills up the bot writes "Your storage is full" (the HOT trick).
- **Tasks:** the daily ones from the docx and a day streak.
- **Mini-game:** Treasure Hunt — searching for something hidden on the island. NEAR easter eggs go here too: yoctoNEAR, Nightshade, Doomslug, House of Stake, "Attention Is All You Need".
- **Visits:** visiting other islands, likes. Likes give no season points.

## 5. Knight

One per player, always on the island, runs on scripts, no LLM. Reacts to events with template lines. Escorts caravans: on the way, pirates or a storm can take **part of the cargo**, and the knight's level lowers the chance and the size of the loss. Levels up for delivered caravans. We draw the art from the photo of the beanie — [assets/reference/knight-beanie.jpg](assets/reference/knight-beanie.jpg): a round light-gray helmet with a sharp crest on top, dark-gray visor slits, a blue screen "face" with two big black eyes with white highlights, small curved blue feather-horns on the sides. Chibi proportions, no body on the emblem — we draw the body in the same style.

**NEARchan** — the narrator: leads the tutorial and tells the season news (CC-BY, link to near-chan.github.io).

## 6. Caravans and request board (core of 09 + 12)

- A player posts a request "need 20 ice". Any player sends a caravan with a knight.
- Delivery is a **real NEP-245 transfer between sub-accounts** (relayer, no popups).
- The sender gets Credits and **reputation**: it can be traced on-chain through the gift transfers.
- Repeat caravans to the same pair of players give diminishing points.

## 7. Archipelagos (12 Social)

- Created and joined **inside the game**. A friend who comes through a ref link goes straight into the inviter's archipelago.
- Each archipelago is a **Sputnik DAO** (`<name>.sputnik-dao.testnet`), the players are its members.
- The archipelago prize goes into the DAO treasury. Small payouts to members by reputation go **automatically**, big ones by a council vote on the rewards site.

## 8. On-chain (testnet)

| What | How |
|---|---|
| Account | the backend creates `tg<id>.<game>.testnet` on first login; the player does not see a wallet |
| Resources | one NEP-245 contract: 7 fungible types, mint on production (in batches), transfer on caravans |
| Epoch | once a week the backend writes the merkle root of the points into the pool contract |
| Pool | anyone can top it up (`deposit`); for the demo — the team's testnet NEAR from the faucet |
| Claim | on the site: Telegram Login → own wallet → `claim(proof)` |
| Treasury | the archipelago's Sputnik DAO |

## 9. Points, rewards, anti-sybil

- **Season points:** island growth + help (delivered caravans) + tasks and streak.
- **Epoch payout:** pool × the player's share of points, no more than X% of the pool per player. The prize for the best archipelago goes to its DAO.
- **Claim eligibility:** at least N days in the game and an island level not below a threshold.
- **Referrals:** XP to the inviter for the friend's achievements from the docx table (nothing for the registration itself).

## 10. For judges

- **Acceleration** "a week in a minute" (a requirement of track 09): ticks, caravans, checkpoint and payout in front of their eyes.
- README: a "really on-chain / simulation" table, a "do X — see Y" path, links to transactions in the explorer, the team's experience (a TG bot at the last NEAR hackathon).
- X post: "last time we built a TG bot and won this beanie — now its knight guards our islands".

## 11. Organization

- A new private repository on `z6wctbhfnv-cmd`, collaborators — the team. We make it public at night on submission.
- A separate application, **a different team lineup** than Pilot.
- License as in Pilot: MIT for contracts, Apache-2.0 for the rest.

## 12. Still open

1. Economy numbers: building cost and output by level, biome bonuses, N days, X% cap, caravan loss size. The implementer proposes a table, Alexander approves.
2. **Fit with the tracks is an open question.** We apply to 09 + 12 + 13, but the fit is uneven:

   | Track | What the track asks for | What we have | What is missing / risk | Rating |
   |---|---|---|---|---|
   | **09 Games With Real Economies** | economy = gameplay: NPCs with wallets, a player market, an economy that changes without a patch; NEP-245; entry without a wallet; a bonus if the chain is not noticeable; acceleration mode | NEP-245 resources in one contract; gifts = real transfers; biome interdependence; Telegram entry without a wallet; chain fully hidden; "a week in a minute" acceleration | no NPCs with wallets (the knight runs on scripts, has no account of his own) and no market with prices — the track's main example. Prices do not "live" | **medium** |
   | **12 Social Money** | shared budgets, programmable rewards, collective ownership, reputation-based access — on Sputnik DAO / Trezu, no own multisig | archipelago = Sputnik DAO with a treasury; auto-payouts by reputation, big ones by the council; reputation from on-chain gifts; request board ≈ bounty board | reputation is computed by the backend, not by a contract; voting only on the site; we do not use Trezu | **strong** |
   | **13 Open Innovation** | an idea that does not fit a category | a TG game without a single word about crypto, and under the hood accounts, a DAO and a merkle claim on NEAR | a weak argument on its own; added to any application | **as an extra** |

   **Options to strengthen 09 (to decide):**
   - a) the knight gets his own sub-account `knight-<id>` and carries the cargo himself by script (an NPC with a wallet, no LLM);
   - b) a "wandering trader" — an NPC account with a price based on stock and demand for rare resources, price rules in one file, the reason for the price in a hint;
   - c) leave as is and put the emphasis on 12 Social.
   - Separate risk: the Telegram rule — NEP-245 resources and sub-accounts in the Mini App are formally "distribution of non-TON assets", even if hidden.
