# TG game for the NEAR Hackathon — decisions (updated 2026-11-13)

Concept: [docs/Your_Own_Island_Concept.docx](docs/Your_Own_Island_Concept.docx) · Scouting: [COMPETITORS.md](COMPETITORS.md)
A separate session will write the code from this file.

## ✅ Decided

| Topic | Decision |
|---|---|
| Name | **Knight's Isle** |
| Genre | Idle/cozy "own flying island" builder from the docx. This is the base of the game. |
| Caravans | A secondary mechanic: **own caravans to neighbors — help and gifts** (a social mechanic: points and reputation). |
| Hero | **The knight from the beanie = every player's Buddy**, lives on the island, guards caravans. **On scripts, no LLM, no AI chat.** |
| NEARchan | The narrator: leads the tutorial and the season news. |
| Interface | Mini App (island, isometric) + a bot for notifications ("storage is full", "caravan arrived", "season is ending"). |
| v1 scope | MVP per the docx: 4 biomes, 8 buildings × 10 levels, Energy/Materials/Credits, daily tasks, visits and likes, 1 mini-game. |
| Tracks | **09 Games + 12 Social + 13 Open.** 10 NFT and 05 Swarms dropped. |
| NFT | **We do not do them.** |
| Strengthening 09 | Biome resources are fungible NEP-245 tokens in one contract (not NFT, not visible in TG). A gift caravan = a real transfer between sub-accounts. Biomes depend on each other for resources. |
| Social 12 | Archipelago = Sputnik DAO with a treasury; reputation = history of gifts/help, traceable on-chain. |
| AI swarm | Track 05 dropped. |
| Account | The backend creates a sub-account from the Telegram ID (entry without a wallet). The player's own wallet — only for claim. |
| NEAR rewards | **Season pool by share of points** (with a per-player cap, anti-sybil) + **a prize for the best archipelago**. |
| Archipelago | A clan of islands, created/joined **inside the game**. Shared treasury. |
| On-chain | Epoch checkpoint (merkle root of points in the contract, claim by proof); anyone can top up the pool; archipelago treasury. |
| Pool for the demo | The team's test NEAR (faucet). In the README: the mainnet pool is funded by sponsors/a grant. |
| Network | Testnet. |
| Claim | A separate site. **In Telegram there is nothing about NEAR** — no words, no link from the bot. People find the site through X/README, login through Telegram Login. |
| Mini-game v1 | **Treasure Hunt** — searching for something hidden on the island, NEAR easter eggs go here too. |
| Caravan risk | Pirates/storm — **part of the cargo can be lost**; the knight's level lowers the chance. |
| Resources | 3 basic (Energy/Materials/Credits) for everyone + 4 rare by biome: Ice (Snow), Fruit (Tropical), Glass (Desert), Wood (Forest). Building levels 5+ need other players' rare resources. |
| Request board | "Need 20 ice" → anyone sends a caravan, gets reputation + Credits. This is a bounty board with reputation for track 12. |
| Archipelago treasury | Sputnik DAO: the NEAR prize goes there; small payouts to members by reputation — automatic, big ones — a council vote (on the site). |
| Art | Generate isometric sprites in one style; the knight — from the beanie photo (**we need the photo from Alexander**). |
| Season | Epoch = a week (checkpoint + payout), season = 4 weeks. Demo: "a week in a minute" acceleration. |
| Season points | Island growth + helping others (caravans from the board) + tasks and streak. Likes give no points. |
| Anti-sybil | Claim only after N days of play and an island level; a cap of X% of the pool per player. |
| Stack | As in Pilot: TS backend on Vercel + Turso, Mini App on React, Rust contracts, grammY bot via webhook. |
| Referrals | Simple in v1: `t.me/<bot>?start=ref`, XP for the friend's achievements (docx table), the friend goes straight into the inviter's archipelago. |
| Keep for sure | X post about the beanie and the knight · the knight as is · NEAR easter eggs (yoctoNEAR, Nightshade, Doomslug, House of Stake, "Attention Is All You Need" + Alexander's finds). |
| README | The team's experience: a TG bot at the last NEAR hackathon. A "really / simulation" table, the judge's path "do X — see Y". |

## ❓ Open

6. Biome bonuses, production formulas, building prices, anti-sybil (economy details).
