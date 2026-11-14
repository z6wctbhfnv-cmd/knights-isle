import { EGGS, HUNT_BASE_DIGS, HUNT_EGG_CHANCE, HUNT_GRID, HUNT_TREASURES, type Egg, type Res } from './config.ts';
import { GameError, dayOf, islandLevel, questProgress, rewardBonus, touch, type Island, type PointEvent } from './island.ts';
import { rng } from './rng.ts';

export interface Treasure { tile: number; res: Res; amount: number; egg: Egg | null }

export const HUNT_TILES = HUNT_GRID * HUNT_GRID;

/** Where today's treasures are buried on this player's island. Same seed, same map. */
export function huntMap(playerId: string, island: Island, now: number): Treasure[] {
  const next = rng(`hunt:${playerId}:${dayOf(now)}`);
  const tiles = new Set<number>();
  while (tiles.size < HUNT_TREASURES) tiles.add(Math.floor(next() * HUNT_TILES));
  const kinds: Res[] = ['credits', 'materials', 'energy'];
  const scale = (1 + islandLevel(island)) * rewardBonus(island);
  const missing = EGGS.filter((e) => !island.eggs.includes(e));
  const eggSlot = missing.length && next() < HUNT_EGG_CHANCE ? Math.floor(next() * HUNT_TREASURES) : -1;
  return [...tiles].map((tile, i) => ({
    tile,
    res: kinds[i % kinds.length],
    amount: Math.round((40 + Math.floor(next() * 40)) * scale),
    egg: i === eggSlot ? missing[Math.floor(next() * missing.length)] : null,
  }));
}

export function digsLeft(island: Island, now: number): number {
  touch(island, now);
  return Math.max(0, HUNT_BASE_DIGS + island.levels.fun - island.hunt.digs);
}

const distance = (a: number, b: number) =>
  Math.abs((a % HUNT_GRID) - (b % HUNT_GRID)) + Math.abs(Math.floor(a / HUNT_GRID) - Math.floor(b / HUNT_GRID));

export interface Dig { found: Treasure | null; /** Steps to the nearest treasure still buried, or null when none is left. */ hint: number | null; left: number; points: PointEvent[] }

export function dig(playerId: string, island: Island, tile: number, now: number): Dig {
  touch(island, now);
  if (!(tile >= 0 && tile < HUNT_TILES) || !Number.isInteger(tile)) throw new GameError('tile', 'no such tile');
  if (island.hunt.opened.includes(tile)) throw new GameError('opened', 'already dug here');
  if (digsLeft(island, now) <= 0) throw new GameError('digs', 'no digs left today');
  // The map is computed before the dig so an egg found now does not reshuffle it.
  const map = huntMap(playerId, island, now);
  island.hunt.digs += 1;
  island.hunt.opened.push(tile);
  const found = map.find((t) => t.tile === tile) ?? null;
  if (found) {
    island.res[found.res] += found.amount;
    if (found.egg && !island.eggs.includes(found.egg)) island.eggs.push(found.egg);
  }
  const buried = map.filter((t) => !island.hunt.opened.includes(t.tile));
  const hint = buried.length ? Math.min(...buried.map((t) => distance(t.tile, tile))) : null;
  return { found, hint, left: digsLeft(island, now), points: questProgress(island, 'hunt', now) };
}
