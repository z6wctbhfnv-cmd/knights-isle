import {
  BASE_COST, BASIC, BIOME_BONUS, BIOMES, BUILDINGS, COST_GROWTH, DAY, FUN_BONUS_PER_LEVEL, HOUR, MAX_LEVEL,
  PROD_GROWTH, PRODUCERS, PRODUCTION, QUEST_POINTS, RARE, RARE_FOREIGN_BASE, RARE_FROM_LEVEL, RARE_GROWTH, RARE_OF,
  RARE_OWN_BASE, RESOURCES, START_LEVELS, START_RES, STORAGE_HOURS, STREAK_POINTS_CAP, STREAK_POINTS_PER_DAY,
  UPGRADE_POINTS_PER_LEVEL,
  type Biome, type Building, type Egg, type Producer, type Rare, type Res,
} from './config.ts';

export const QUESTS = ['collect', 'upgrade', 'caravan', 'visit', 'hunt', 'knight'] as const;
export type Quest = (typeof QUESTS)[number];
/** How many times the action must happen in a day for the quest to count. */
export const QUEST_GOAL: Record<Quest, number> = { collect: 1, upgrade: 1, caravan: 1, visit: 3, hunt: 1, knight: 1 };

export interface Island {
  biome: Biome;
  levels: Record<Building, number>;
  res: Record<Res, number>;
  /** Game time of the last collection, per producer. */
  collectedAt: Record<Producer, number>;
  createdAt: number;
  knight: { deliveries: number };
  quests: { day: number; progress: Partial<Record<Quest, number>>; done: Quest[] };
  streak: { lastDay: number; days: number };
  /** Number of distinct days with at least one finished quest (anti-sybil gate). */
  activeDays: number;
  hunt: { day: number; digs: number; opened: number[] };
  eggs: Egg[];
  reputation: number;
  tutorial: number;
  /** Daily reward calendar; absent on islands created before it existed. */
  daily?: { lastDay: number; step: number };
}

export interface PointEvent { kind: 'upgrade' | 'delivery' | 'quest' | 'streak'; amount: number; note?: string }

export type Cost = Partial<Record<Res, number>>;

export function newIsland(biome: Biome, now: number): Island {
  const res = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Res, number>;
  for (const b of BASIC) res[b] = START_RES[b];
  return {
    biome,
    levels: { ...START_LEVELS },
    res,
    collectedAt: { solar: now, factory: now, datacenter: now, house: now },
    createdAt: now,
    knight: { deliveries: 0 },
    quests: { day: dayOf(now), progress: {}, done: [] },
    streak: { lastDay: -1, days: 0 },
    activeDays: 0,
    hunt: { day: dayOf(now), digs: 0, opened: [] },
    eggs: [],
    reputation: 0,
    tutorial: 0,
  };
}

export const dayOf = (now: number) => Math.floor(now / DAY);

export function islandLevel(island: Island): number {
  const sum = BUILDINGS.reduce((s, b) => s + island.levels[b], 0);
  return Math.floor(sum / BUILDINGS.length);
}

/** Which resource a producer makes on this island. */
export function productOf(island: Island, b: Producer): Res {
  const p = PRODUCTION[b].res;
  return p === 'rare' ? RARE_OF[island.biome] : p;
}

const BIOME_BOOST: Partial<Record<Biome, Producer>> = { snow: 'datacenter', desert: 'solar', forest: 'factory' };

/** Units per hour at the building's current level, biome bonus included. */
export function ratePerHour(island: Island, b: Producer, level = island.levels[b]): number {
  if (level <= 0) return 0;
  const bonus = BIOME_BOOST[island.biome] === b ? 1 + BIOME_BONUS : 1;
  return PRODUCTION[b].perHour * PROD_GROWTH ** (level - 1) * bonus;
}

export function storageHours(island: Island): number {
  return STORAGE_HOURS[Math.max(1, island.levels.storage) - 1];
}

/** What a producer has made since the last collection; it stops when the storage is full. */
export function pending(island: Island, b: Producer, now: number): number {
  const hours = Math.min(Math.max(0, now - island.collectedAt[b]) / HOUR, storageHours(island));
  return ratePerHour(island, b) * hours;
}

export function isFull(island: Island, b: Producer, now: number): boolean {
  return island.levels[b] > 0 && now - island.collectedAt[b] >= storageHours(island) * HOUR;
}

/** Game time when the first producer fills up (for the "storage is full" notification). */
export function fullAt(island: Island): number | null {
  const built = PRODUCERS.filter((b) => island.levels[b] > 0);
  if (!built.length) return null;
  return Math.min(...built.map((b) => island.collectedAt[b])) + storageHours(island) * HOUR;
}

/** Moves pending production into the balance. Returns whole units gained per resource. */
export function collect(island: Island, now: number, only?: Producer): Partial<Record<Res, number>> {
  const gained: Partial<Record<Res, number>> = {};
  for (const b of only ? [only] : PRODUCERS) {
    if (island.levels[b] <= 0) continue;
    const amount = pending(island, b, now);
    const whole = Math.floor(amount);
    if (whole <= 0) continue;
    const r = productOf(island, b);
    island.res[r] += whole;
    gained[r] = (gained[r] ?? 0) + whole;
    // Keep the fractional remainder by moving the mark back a little.
    const rate = ratePerHour(island, b);
    island.collectedAt[b] = now - ((amount - whole) / rate) * HOUR;
  }
  return gained;
}

/** The foreign rare resource an upgrade to `toLevel` needs: the three other biomes take turns. */
export function foreignRareFor(biome: Biome, toLevel: number): Rare {
  const i = BIOMES.indexOf(biome);
  const step = ((toLevel - RARE_FROM_LEVEL) % 3) + 1;
  return RARE_OF[BIOMES[(i + step) % BIOMES.length]];
}

export function upgradeCost(biome: Biome, b: Building, toLevel: number): Cost {
  const [e, m, c] = BASE_COST[b];
  const k = COST_GROWTH ** (toLevel - 1);
  const cost: Cost = {};
  if (e) cost.energy = Math.round(e * k);
  if (m) cost.materials = Math.round(m * k);
  if (c) cost.credits = Math.round(c * k);
  if (toLevel >= RARE_FROM_LEVEL) {
    const g = RARE_GROWTH ** (toLevel - RARE_FROM_LEVEL);
    cost[RARE_OF[biome]] = Math.round(RARE_OWN_BASE * g);
    cost[foreignRareFor(biome, toLevel)] = Math.round(RARE_FOREIGN_BASE * g);
  }
  return cost;
}

export type UpgradeBlock = 'max' | 'lab' | 'resources';

/** Why an upgrade is not possible right now, or null when it is. */
export function upgradeBlock(island: Island, b: Building): UpgradeBlock | null {
  const to = island.levels[b] + 1;
  if (to > MAX_LEVEL) return 'max';
  if (b !== 'lab' && to > island.levels.lab + 1) return 'lab';
  const cost = upgradeCost(island.biome, b, to);
  for (const r of RESOURCES) if ((cost[r] ?? 0) > island.res[r]) return 'resources';
  return null;
}

export function missing(island: Island, cost: Cost): Cost {
  const out: Cost = {};
  for (const r of RESOURCES) {
    const lack = (cost[r] ?? 0) - Math.floor(island.res[r]);
    if (lack > 0) out[r] = lack;
  }
  return out;
}

export function spend(island: Island, cost: Cost): void {
  for (const r of RESOURCES) {
    const need = cost[r] ?? 0;
    if (need > island.res[r]) throw new GameError('resources', `not enough ${r}`);
  }
  for (const r of RESOURCES) island.res[r] -= cost[r] ?? 0;
}

export class GameError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Builds or upgrades. Collects the building first so no production is lost at the old rate. */
export function upgrade(island: Island, b: Building, now: number): { level: number; cost: Cost; points: PointEvent[] } {
  const block = upgradeBlock(island, b);
  if (block) throw new GameError(block, `cannot upgrade ${b}: ${block}`);
  const to = island.levels[b] + 1;
  const cost = upgradeCost(island.biome, b, to);
  if (b === 'storage') collect(island, now);
  else if ((PRODUCERS as readonly string[]).includes(b)) collect(island, now, b as Producer);
  spend(island, cost);
  island.levels[b] = to;
  if ((PRODUCERS as readonly string[]).includes(b) && to === 1) island.collectedAt[b as Producer] = now;
  const points: PointEvent[] = [{ kind: 'upgrade', amount: UPGRADE_POINTS_PER_LEVEL * to, note: `${b}:${to}` }];
  points.push(...questProgress(island, 'upgrade', now));
  return { level: to, cost, points };
}

/** Bonus multiplier for quest and Treasure Hunt rewards. */
export function rewardBonus(island: Island): number {
  return (1 + island.levels.fun * FUN_BONUS_PER_LEVEL) * (island.biome === 'tropical' ? 1 + BIOME_BONUS : 1);
}

export function questReward(island: Island): number {
  return Math.round(30 * (1 + islandLevel(island)) * rewardBonus(island));
}

function rollDay(island: Island, now: number): void {
  const day = dayOf(now);
  if (island.quests.day !== day) island.quests = { day, progress: {}, done: [] };
  if (island.hunt.day !== day) island.hunt = { day, digs: 0, opened: [] };
}

/** Call before reading daily state so a new day starts clean. */
export function touch(island: Island, now: number): void {
  rollDay(island, now);
}

/** Counts an action towards a daily quest. Pays credits and returns season points when the quest completes. */
export function questProgress(island: Island, q: Quest, now: number, by = 1): PointEvent[] {
  rollDay(island, now);
  if (island.quests.done.includes(q)) return [];
  const have = (island.quests.progress[q] ?? 0) + by;
  island.quests.progress[q] = have;
  if (have < QUEST_GOAL[q]) return [];
  island.quests.done.push(q);
  island.res.credits += questReward(island);
  const points: PointEvent[] = [{ kind: 'quest', amount: QUEST_POINTS, note: q }];
  const day = dayOf(now);
  if (island.streak.lastDay !== day) {
    island.streak.days = island.streak.lastDay === day - 1 ? island.streak.days + 1 : 1;
    island.streak.lastDay = day;
    island.activeDays += 1;
    points.push({ kind: 'streak', amount: Math.min(STREAK_POINTS_PER_DAY * island.streak.days, STREAK_POINTS_CAP), note: `day ${island.streak.days}` });
  }
  return points;
}

export const isRare = (r: Res): r is Rare => (RARE as readonly string[]).includes(r);
