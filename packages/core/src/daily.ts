import { BIOMES, RARE_OF, type Res } from './config.ts';
import { GameError, dayOf, islandLevel, type Island } from './island.ts';

/**
 * Daily reward: a 7-day calendar. Claim once per day; a missed day starts the calendar again.
 * Rewards grow with the island level. They give resources only, never season points,
 * so logging in alone cannot farm the weekly NEAR pool.
 */
export const DAILY_DAYS = 7;

export function dailyReward(island: Island, step: number): Partial<Record<Res, number>> {
  const k = 1 + islandLevel(island);
  const own = RARE_OF[island.biome];
  const foreign = BIOMES.filter((b) => b !== island.biome).map((b) => RARE_OF[b]);
  const r: Partial<Record<Res, number>> = {};
  switch (step) {
    case 1: r.credits = 60 * k; break;
    case 2: r.energy = 80 * k; r.materials = 60 * k; break;
    case 3: r.credits = 120 * k; break;
    case 4: r[own] = 4 + islandLevel(island); r.materials = 100 * k; break;
    case 5: r[foreign[0]] = 3; r[foreign[1]] = 3; r[foreign[2]] = 3; break;
    case 6: r.energy = 200 * k; r.credits = 150 * k; break;
    default: // day 7: the chest
      r.credits = 300 * k; r.materials = 200 * k;
      for (const f of foreign) r[f] = 6;
  }
  return r;
}

function daily(island: Island) {
  return island.daily ?? { lastDay: -1, step: 0 };
}

/** Which calendar day the next claim is, and whether it can be claimed now. */
export function dailyState(island: Island, now: number): { available: boolean; step: number; claimedToday: boolean } {
  const d = daily(island);
  const today = dayOf(now);
  if (d.lastDay === today) return { available: false, step: d.step, claimedToday: true };
  const step = d.lastDay === today - 1 && d.step < DAILY_DAYS ? d.step + 1 : 1;
  return { available: true, step, claimedToday: false };
}

export function claimDaily(island: Island, now: number): { step: number; reward: Partial<Record<Res, number>> } {
  const s = dailyState(island, now);
  if (!s.available) throw new GameError('daily', 'already claimed today');
  const reward = dailyReward(island, s.step);
  for (const [r, n] of Object.entries(reward) as [Res, number][]) island.res[r] += n;
  island.daily = { lastDay: dayOf(now), step: s.step };
  return { step: s.step, reward };
}
