# Economy — draft for approval (2026-11-13)

Closes the open item "economy numbers" from [SPEC.md](SPEC.md) §12.1. All numbers are the implementer's proposal, nothing is approved. The pace was checked with a simple player simulation (see the end).

## 1. Two multipliers for the whole game

- **Output** of a building at level L = base × 1.45^(L−1).
- **Cost** of an upgrade to level L = base × 1.9^(L−1).

The cost grows faster than the output, so every next level takes longer to wait for.

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Output × | 1 | 1.45 | 2.1 | 3.05 | 4.4 | 6.4 | 9.3 | 13.5 | 19.5 | 28.3 |
| Cost × | 1 | 1.9 | 3.6 | 6.9 | 13 | 25 | 47 | 89 | 170 | 323 |

## 2. Buildings

| Building | What it gives | Level 1 per hour | Level 1 cost (Energy / Materials / Credits) |
|---|---|---|---|
| Solar Farm | Energy | 60 | 0 / 60 / 40 |
| Factory | Materials | 40 | 80 / 0 / 50 |
| Data Center | Credits | 30 | 120 / 100 / 0 |
| House | the rare resource of its biome | 2 | 60 / 80 / 40 |
| Storage | storage capacity | see §3 | 50 / 120 / 30 |
| Research Lab | level cap of the other buildings = Lab level + 1 | — | 150 / 150 / 100 |
| Entertainment Center | +5% to task and Treasure Hunt rewards per level | — | 100 / 100 / 120 |
| Harbor | caravans: cargo and number at once | see §5 | 90 / 140 / 80 |

Start: Solar Farm, Factory, Data Center and Storage already stand at level 1, and the account holds 150 of each basic resource. The player builds the rest.

**Rare resources from level 5.** Each upgrade needs its own rare resource and one foreign one:

| To level | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|
| Own rare | 15 | 24 | 38 | 61 | 98 | 157 |
| Foreign rare | 10 | 16 | 26 | 41 | 66 | 105 |

The foreign resource rotates: levels 5 and 8 — the first neighboring biome, 6 and 9 — the second, 7 and 10 — the third. So everyone needs all three foreign biomes. One building up to level 10 uses 264 foreign rare resources, the whole island — 2112.

**Island level** = sum of building levels ÷ 8, rounded down.

## 3. Storage

The storage holds the output of N hours. After that the buildings stand still, and the bot writes "Your storage is full".

| Storage level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Hours | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 14 |

## 4. Biome bonuses

| Biome | Bonus | Rare resource |
|---|---|---|
| Snow | +10% Credits from Data Center | Ice |
| Tropical | +10% to task and Treasure Hunt rewards | Fruit |
| Desert | +10% Energy from Solar Farm | Glass |
| Forest | +10% Materials from Factory | Wood |

## 5. Caravans and knight

- **Cargo** of one caravan: 20 units at Harbor 1, ×1.3 per level (57 at level 5, 212 at level 10).
- **At once:** 1 caravan at Harbor 1–3, 2 at 4–7, 3 at 8–10.
- **Trip:** 30 minutes.
- **Pirates or storm:** 25% chance, 30% of the cargo is lost. Each knight level takes 2 percentage points off the chance and 2 off the loss. At level 10: chance 7%, loss 12%.
- **Knight level** — by total number of deliveries: 3, 8, 15, 25, 40, 60, 85, 115, 150.
- **Reward for a delivery on a request:** 20 Credits and 1 reputation per delivered unit.
- **The same recipient within an epoch:** the first delivery gives 100% of points and reputation, the second 50%, the third 25%, then 0. The cargo itself always arrives.

## 6. Season points

| For what | Points |
|---|---|
| Upgrading a building to level L | 10 × L (the whole island to level 10 — 4400) |
| Delivery on a request | 2 per unit, with the decay from §5 |
| Daily task | 5 each, 6 tasks a day |
| Day streak | 5 × streak day, no more than 35 a day |
| Likes, visits | 0 |

## 7. Rewards and bot protection

- **Epoch pool:** 80% to players by share of points, 20% — to the treasury of the best archipelago.
- **Per-player cap (X):** 5% of the epoch pool. What is not paid out because of the cap moves to the next epoch.
- **Reward eligibility (N):** 3 days with a completed task and an island of level 3 or higher.
- **Archipelago:** up to 30 islands, the archipelago score = sum of its members' points.
- **Treasury:** automatically no more than 5% of the treasury per epoch goes to a member, by share of reputation. Anything bigger — a council vote.
- **Referrals:** the docx table unchanged (25 + 25 + 50 + 100 + 150 = 350 XP per friend).

## 8. Pace check

Simulation: the player collects resources and always buys the cheapest available upgrade; foreign rare resources come by exchange.

| Island level | 2 | 3 | 5 | 7 | 10 |
|---|---|---|---|---|---|
| Active (logs in every 2 hours) | day 1.4 | day 2.6 | day 6 | day 12 | day 31 |
| Relaxed (3 times a day) | day 3 | day 4.7 | day 9 | day 15 | day 35 |

Conclusion: rare resources and caravans start by the end of the first week, a full island takes about a season (4 weeks). An active player gets reward eligibility on day three.

What the simulation does not check: whether there will be enough foreign rare resources for everyone with few players and skewed biomes. With 5–10 players on the demo we need a backup source — see the trader question in SPEC §12.2.
