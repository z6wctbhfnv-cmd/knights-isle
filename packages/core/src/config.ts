// Every number of the game economy lives here. See ECONOMY.md for the reasoning.

export const BIOMES = ['snow', 'tropical', 'desert', 'forest'] as const;
export type Biome = (typeof BIOMES)[number];

export const BASIC = ['energy', 'materials', 'credits'] as const;
export const RARE = ['ice', 'fruit', 'glass', 'wood'] as const;
export const RESOURCES = [...BASIC, ...RARE] as const;
export type Basic = (typeof BASIC)[number];
export type Rare = (typeof RARE)[number];
export type Res = (typeof RESOURCES)[number];

export const RARE_OF: Record<Biome, Rare> = { snow: 'ice', tropical: 'fruit', desert: 'glass', forest: 'wood' };

export const BUILDINGS = ['solar', 'factory', 'datacenter', 'house', 'storage', 'lab', 'fun', 'harbor'] as const;
export type Building = (typeof BUILDINGS)[number];
export const PRODUCERS = ['solar', 'factory', 'datacenter', 'house'] as const;
export type Producer = (typeof PRODUCERS)[number];

export const MAX_LEVEL = 10;
export const PROD_GROWTH = 1.45;
export const COST_GROWTH = 1.9;

/** What a producer makes per hour at level 1. `rare` means the island's own rare resource. */
export const PRODUCTION: Record<Producer, { res: Basic | 'rare'; perHour: number }> = {
  solar: { res: 'energy', perHour: 60 },
  factory: { res: 'materials', perHour: 40 },
  datacenter: { res: 'credits', perHour: 30 },
  house: { res: 'rare', perHour: 2 },
};

/** Level 1 price in energy / materials / credits. */
export const BASE_COST: Record<Building, [number, number, number]> = {
  solar: [0, 60, 40],
  factory: [80, 0, 50],
  datacenter: [120, 100, 0],
  house: [60, 80, 40],
  storage: [50, 120, 30],
  lab: [150, 150, 100],
  fun: [100, 100, 120],
  harbor: [90, 140, 80],
};

export const START_LEVELS: Record<Building, number> = {
  solar: 1, factory: 1, datacenter: 1, storage: 1, house: 0, lab: 0, fun: 0, harbor: 0,
};
export const START_RES: Record<Basic, number> = { energy: 150, materials: 150, credits: 150 };

/** From this level an upgrade also needs rare resources: the island's own and one foreign kind. */
export const RARE_FROM_LEVEL = 5;
export const RARE_OWN_BASE = 15;
export const RARE_FOREIGN_BASE = 10;
export const RARE_GROWTH = 1.6;

/** Hours of production the storage holds, by Storage level 1..10. */
export const STORAGE_HOURS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14];

export const BIOME_BONUS = 0.1; // snow: credits, desert: energy, forest: materials, tropical: quest and hunt rewards
export const FUN_BONUS_PER_LEVEL = 0.05;

// Caravans
export const CARAVAN_BASE_CAPACITY = 20;
export const CARAVAN_CAPACITY_GROWTH = 1.3;
export const CARAVAN_TRIP_MS = 30 * 60 * 1000;
export const RISK_CHANCE = 0.25;
export const RISK_LOSS = 0.3;
export const RISK_PER_KNIGHT_LEVEL = 0.02;
export const KNIGHT_LEVELS = [3, 8, 15, 25, 40, 60, 85, 115, 150]; // total deliveries needed for level 2..10
export const DELIVERY_CREDITS_PER_UNIT = 20;
export const DELIVERY_REP_PER_UNIT = 1;
export const DELIVERY_POINTS_PER_UNIT = 2;
export const PAIR_DECAY = [1, 0.5, 0.25]; // nth delivery to the same player within an epoch; later ones give 0
export const MAX_OPEN_REQUESTS = 2;

// Points
export const UPGRADE_POINTS_PER_LEVEL = 10;
export const QUEST_POINTS = 5;
export const STREAK_POINTS_PER_DAY = 5;
export const STREAK_POINTS_CAP = 35;

// Time (game clock, in ms)
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
export const EPOCH = 7 * DAY;
export const EPOCHS_PER_SEASON = 4;

// Rewards and anti-sybil
export const PLAYERS_SHARE = 0.8; // of the epoch pool; the rest goes to the best archipelago's treasury
export const PLAYER_CAP = 0.05; // of the epoch pool
export const CLAIM_MIN_DAYS = 3; // days with at least one finished quest
export const CLAIM_MIN_ISLAND_LEVEL = 3;
export const ARCHIPELAGO_MAX = 30;
export const TREASURY_AUTO_PAYOUT_CAP = 0.05; // of the treasury per member per epoch

// Treasure Hunt
export const HUNT_GRID = 6;
export const HUNT_TREASURES = 3;
export const HUNT_BASE_DIGS = 6;
export const HUNT_EGG_CHANCE = 0.35; // chance that one of the day's treasures is a collectible
export const EGGS = ['yocto', 'nightshade', 'doomslug', 'stakehouse', 'attention'] as const;
export type Egg = (typeof EGGS)[number];

// Wandering trader (NPC with its own account): price follows its stock.
export const TRADER_TARGET_STOCK = 200;
export const TRADER_BASE_PRICE = 12; // credits per unit when stock is at target
export const TRADER_ELASTICITY = 0.7;
export const TRADER_MIN_PRICE = 4;
export const TRADER_MAX_PRICE = 120;
export const TRADER_BUY_MARKUP = 1.1; // player buys
export const TRADER_SELL_MARKDOWN = 0.8; // player sells
export const TRADER_MAX_PER_DEAL = 50;

// Referral XP, straight from the concept doc.
export const REFERRAL_XP = { joined: 25, island: 25, quests3: 50, level5: 100, days7: 150 } as const;
