import {
  CARAVAN_BASE_CAPACITY, CARAVAN_CAPACITY_GROWTH, CARAVAN_TRIP_MS, DELIVERY_CREDITS_PER_UNIT, DELIVERY_POINTS_PER_UNIT,
  DELIVERY_REP_PER_UNIT, KNIGHT_LEVELS, PAIR_DECAY, RISK_CHANCE, RISK_LOSS, RISK_PER_KNIGHT_LEVEL, type Res,
} from './config.ts';
import { GameError, questProgress, type Island, type PointEvent } from './island.ts';
import { rng } from './rng.ts';

export interface Caravan {
  id: string;
  from: string;
  to: string;
  res: Res;
  amount: number;
  departAt: number;
  arriveAt: number;
  requestId: string | null;
  status: 'travel' | 'done';
  event: 'pirates' | 'storm' | null;
  lost: number;
  delivered: number;
}

export function knightLevel(deliveries: number): number {
  return 1 + KNIGHT_LEVELS.filter((n) => deliveries >= n).length;
}

/** Deliveries still needed for the next knight level, or null at the top. */
export function knightNext(deliveries: number): number | null {
  const next = KNIGHT_LEVELS.find((n) => deliveries < n);
  return next === undefined ? null : next - deliveries;
}

export function caravanCapacity(harborLevel: number): number {
  return harborLevel <= 0 ? 0 : Math.round(CARAVAN_BASE_CAPACITY * CARAVAN_CAPACITY_GROWTH ** (harborLevel - 1));
}

export function caravanSlots(harborLevel: number): number {
  return harborLevel >= 8 ? 3 : harborLevel >= 4 ? 2 : harborLevel >= 1 ? 1 : 0;
}

export function risk(level: number): { chance: number; loss: number } {
  const cut = RISK_PER_KNIGHT_LEVEL * (level - 1);
  return { chance: Math.max(0, RISK_CHANCE - cut), loss: Math.max(0, RISK_LOSS - cut) };
}

/** Takes the cargo from the sender and puts the caravan on the road. */
export function sendCaravan(
  sender: Island,
  args: { id: string; from: string; to: string; res: Res; amount: number; requestId?: string | null; inTransit: number },
  now: number,
): { caravan: Caravan; points: PointEvent[] } {
  const { id, from, to, res, requestId = null, inTransit } = args;
  const amount = Math.floor(args.amount);
  if (from === to) throw new GameError('self', 'cannot send a caravan to yourself');
  if (!(amount > 0)) throw new GameError('amount', 'nothing to send');
  if (inTransit >= caravanSlots(sender.levels.harbor)) throw new GameError('slots', 'no free caravan');
  if (amount > caravanCapacity(sender.levels.harbor)) throw new GameError('capacity', 'cargo is larger than the caravan');
  if (sender.res[res] < amount) throw new GameError('resources', `not enough ${res}`);
  sender.res[res] -= amount;
  const caravan: Caravan = {
    id, from, to, res, amount, departAt: now, arriveAt: now + CARAVAN_TRIP_MS, requestId,
    status: 'travel', event: null, lost: 0, delivered: 0,
  };
  return { caravan, points: questProgress(sender, 'caravan', now) };
}

/** Pirates or a storm: decided by the caravan id, so the roll can be replayed. */
export function rollJourney(caravan: Caravan, level: number): { event: Caravan['event']; lost: number } {
  const next = rng(`caravan:${caravan.id}`);
  const { chance, loss } = risk(level);
  if (next() >= chance) return { event: null, lost: 0 };
  const event = next() < 0.5 ? 'pirates' : 'storm';
  return { event, lost: Math.min(caravan.amount, Math.max(1, Math.round(caravan.amount * loss))) };
}

export interface Arrival {
  delivered: number;
  lost: number;
  event: Caravan['event'];
  credits: number;
  reputation: number;
  points: PointEvent[];
  knightLevelUp: number | null;
}

/**
 * The caravan arrives: cargo to the receiver, rewards to the sender.
 * `earlierToSamePlayer` is how many rewarded deliveries this sender already made to this receiver in the epoch.
 * Rewards are paid only for deliveries that answer a request on the board.
 */
export function arrive(caravan: Caravan, sender: Island, receiver: Island, earlierToSamePlayer: number): Arrival {
  if (caravan.status !== 'travel') throw new GameError('done', 'caravan already arrived');
  const before = knightLevel(sender.knight.deliveries);
  const { event, lost } = rollJourney(caravan, before);
  const delivered = caravan.amount - lost;
  receiver.res[caravan.res] += delivered;
  caravan.status = 'done';
  caravan.event = event;
  caravan.lost = lost;
  caravan.delivered = delivered;
  sender.knight.deliveries += 1;
  const after = knightLevel(sender.knight.deliveries);

  let credits = 0;
  let reputation = 0;
  const points: PointEvent[] = [];
  if (caravan.requestId) {
    const decay = PAIR_DECAY[earlierToSamePlayer] ?? 0;
    credits = delivered * DELIVERY_CREDITS_PER_UNIT;
    reputation = Math.round(delivered * DELIVERY_REP_PER_UNIT * decay);
    sender.res.credits += credits;
    sender.reputation += reputation;
    const pts = Math.round(delivered * DELIVERY_POINTS_PER_UNIT * decay);
    if (pts > 0) points.push({ kind: 'delivery', amount: pts, note: `${delivered} ${caravan.res} to ${caravan.to}` });
  }
  return { delivered, lost, event, credits, reputation, points, knightLevelUp: after > before ? after : null };
}
