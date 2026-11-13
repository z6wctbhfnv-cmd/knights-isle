import {
  TRADER_BASE_PRICE, TRADER_BUY_MARKUP, TRADER_ELASTICITY, TRADER_MAX_PER_DEAL, TRADER_MAX_PRICE, TRADER_MIN_PRICE,
  TRADER_SELL_MARKDOWN, TRADER_TARGET_STOCK, type Rare,
} from './config.ts';
import { GameError, type Island } from './island.ts';

/** The wandering trader is an NPC with its own account. Its only pricing rule: scarce stock is expensive. */
export type Stock = Record<Rare, number>;

export function midPrice(stock: number): number {
  const p = TRADER_BASE_PRICE * (TRADER_TARGET_STOCK / Math.max(stock, 1)) ** TRADER_ELASTICITY;
  return Math.min(TRADER_MAX_PRICE, Math.max(TRADER_MIN_PRICE, p));
}

export interface Quote { buy: number; sell: number; stock: number; mood: 'scarce' | 'normal' | 'plenty' }

export function quote(stock: number): Quote {
  const mid = midPrice(stock);
  return {
    buy: Math.ceil(mid * TRADER_BUY_MARKUP),
    sell: Math.max(1, Math.floor(mid * TRADER_SELL_MARKDOWN)),
    stock,
    mood: stock < TRADER_TARGET_STOCK * 0.5 ? 'scarce' : stock > TRADER_TARGET_STOCK * 1.5 ? 'plenty' : 'normal',
  };
}

function checkAmount(amount: number): number {
  const n = Math.floor(amount);
  if (!(n > 0)) throw new GameError('amount', 'nothing to trade');
  if (n > TRADER_MAX_PER_DEAL) throw new GameError('amount', `at most ${TRADER_MAX_PER_DEAL} per deal`);
  return n;
}

/** Player buys a rare resource for credits. Each unit is priced at the stock left at that moment. */
export function buy(island: Island, stock: Stock, res: Rare, amount: number): { credits: number } {
  const n = checkAmount(amount);
  if (stock[res] < n) throw new GameError('stock', 'the trader does not have that much');
  let credits = 0;
  for (let i = 0; i < n; i++) credits += quote(stock[res] - i).buy;
  if (island.res.credits < credits) throw new GameError('resources', 'not enough credits');
  island.res.credits -= credits;
  island.res[res] += n;
  stock[res] -= n;
  return { credits };
}

export function sell(island: Island, stock: Stock, res: Rare, amount: number): { credits: number } {
  const n = checkAmount(amount);
  if (island.res[res] < n) throw new GameError('resources', `not enough ${res}`);
  let credits = 0;
  for (let i = 0; i < n; i++) credits += quote(stock[res] + i).sell;
  island.res[res] -= n;
  island.res.credits += credits;
  stock[res] += n;
  return { credits };
}
