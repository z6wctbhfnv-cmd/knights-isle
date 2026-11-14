import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, DAY, EGGS, HOUR, HUNT_TILES, RARE, arrive, buildTree, buy, caravanCapacity, caravanSlots, collect, dig,
  digsLeft, eligible, foreignRareFor, fullAt, huntMap, isFull, islandLevel, knightLevel, leafHash, newIsland, pending,
  questProgress, quote, ratePerHour, risk, rollJourney, sell, sendCaravan, splitPool, upgrade, upgradeBlock,
  upgradeCost, verifyProof, type Caravan, type Island, type Stock,
} from '../src/index.ts';

const T0 = 1000 * DAY;
const rich = (biome: Parameters<typeof newIsland>[0] = 'snow'): Island => {
  const i = newIsland(biome, T0);
  for (const r of Object.keys(i.res) as (keyof Island['res'])[]) i.res[r] = 1e9;
  return i;
};

describe('island economy', () => {
  it('starts with four buildings and 150 of each basic resource', () => {
    const i = newIsland('forest', T0);
    expect(i.levels).toMatchObject({ solar: 1, factory: 1, datacenter: 1, storage: 1, house: 0, lab: 0, fun: 0, harbor: 0 });
    expect(i.res).toMatchObject({ energy: 150, materials: 150, credits: 150, wood: 0 });
    expect(islandLevel(i)).toBe(0);
  });

  it('produces at the documented rates and applies biome bonuses', () => {
    const snow = newIsland('snow', T0);
    expect(ratePerHour(snow, 'solar')).toBe(60);
    expect(ratePerHour(snow, 'factory')).toBe(40);
    expect(ratePerHour(snow, 'datacenter')).toBeCloseTo(33);
    expect(ratePerHour(newIsland('desert', T0), 'solar')).toBeCloseTo(66);
    expect(ratePerHour(newIsland('forest', T0), 'factory')).toBeCloseTo(44);
    expect(ratePerHour(snow, 'solar', 10)).toBeCloseTo(60 * 1.45 ** 9);
    expect(ratePerHour(snow, 'house')).toBe(0);
  });

  it('stops producing when the storage is full (4 hours at Storage 1)', () => {
    const i = newIsland('tropical', T0);
    expect(pending(i, 'solar', T0 + 2 * HOUR)).toBeCloseTo(120);
    expect(pending(i, 'solar', T0 + 40 * HOUR)).toBeCloseTo(240);
    expect(isFull(i, 'solar', T0 + 3 * HOUR)).toBe(false);
    expect(isFull(i, 'solar', T0 + 4 * HOUR)).toBe(true);
    expect(fullAt(i)).toBe(T0 + 4 * HOUR);
  });

  it('collects whole units and keeps the fraction', () => {
    const i = newIsland('tropical', T0);
    const got = collect(i, T0 + 0.51 * HOUR);
    expect(got).toEqual({ energy: 30, materials: 20, credits: 15 });
    expect(i.res.energy).toBe(180);
    expect(pending(i, 'solar', T0 + 0.51 * HOUR)).toBeCloseTo(0.6);
    expect(collect(i, T0 + 0.51 * HOUR)).toEqual({});
  });

  it('prices upgrades by the 1.9 curve and asks for rares from level 5', () => {
    expect(upgradeCost('snow', 'solar', 1)).toEqual({ materials: 60, credits: 40 });
    expect(upgradeCost('snow', 'solar', 2)).toEqual({ materials: 114, credits: 76 });
    expect(upgradeCost('snow', 'lab', 4)).toEqual({ energy: 1029, materials: 1029, credits: 686 });
    expect(upgradeCost('snow', 'solar', 5)).toEqual({ materials: 782, credits: 521, ice: 15, fruit: 10 });
    expect(upgradeCost('snow', 'solar', 10)).toMatchObject({ ice: 157, wood: 105 });
  });

  it('rotates the foreign rare so every island needs all three other biomes', () => {
    expect([5, 6, 7, 8, 9, 10].map((l) => foreignRareFor('snow', l))).toEqual(['fruit', 'glass', 'wood', 'fruit', 'glass', 'wood']);
    expect([5, 6, 7].map((l) => foreignRareFor('forest', l))).toEqual(['ice', 'fruit', 'glass']);
    for (const biome of ['snow', 'tropical', 'desert', 'forest'] as const) {
      const own = { snow: 'ice', tropical: 'fruit', desert: 'glass', forest: 'wood' }[biome];
      const asked = new Set([5, 6, 7].map((l) => foreignRareFor(biome, l)));
      expect(asked.size).toBe(3);
      expect(asked.has(own as never)).toBe(false);
    }
  });

  it('gates buildings by the Research Lab and by resources', () => {
    const i = newIsland('snow', T0);
    expect(upgradeBlock(i, 'solar')).toBe('lab');
    expect(upgradeBlock(i, 'house')).toBe(null);
    i.res.energy = 0;
    expect(upgradeBlock(i, 'lab')).toBe('resources');
    const r = rich();
    upgrade(r, 'lab', T0);
    expect(upgrade(r, 'solar', T0).level).toBe(2);
    expect(() => upgrade(r, 'solar', T0)).toThrow(/lab/);
  });

  it('gives 10 x level points per upgrade, 4400 for a full island', () => {
    const r = rich();
    let total = 0;
    for (let lvl = 1; lvl <= 10; lvl++) {
      for (const b of ['lab', ...BUILDINGS.filter((x) => x !== 'lab')] as const) {
        if (r.levels[b] >= lvl) continue;
        total += upgrade(r, b, T0).points.filter((p) => p.kind === 'upgrade').reduce((s, p) => s + p.amount, 0);
      }
    }
    expect(islandLevel(r)).toBe(10);
    expect(upgradeBlock(r, 'solar')).toBe('max');
    // Four buildings start at level 1, so their first level (10 points each) is not earned.
    expect(total).toBe(4400 - 40);
  });

  it('collects at the old rate before an upgrade', () => {
    const i = rich();
    upgrade(i, 'lab', T0);
    const before = i.res.energy;
    const { cost } = upgrade(i, 'solar', T0 + HOUR);
    expect(i.res.energy - before).toBe(60 - (cost.energy ?? 0));
    expect(pending(i, 'solar', T0 + HOUR)).toBeCloseTo(0);
  });
});

describe('quests and streak', () => {
  it('pays a quest once a day, counts visits to three', () => {
    const i = newIsland('snow', T0);
    expect(questProgress(i, 'visit', T0)).toEqual([]);
    expect(questProgress(i, 'visit', T0)).toEqual([]);
    const pts = questProgress(i, 'visit', T0);
    expect(pts).toEqual([{ kind: 'quest', amount: 5, note: 'visit' }, { kind: 'streak', amount: 5, note: 'day 1' }]);
    expect(i.res.credits).toBe(150 + 30);
    expect(questProgress(i, 'visit', T0)).toEqual([]);
    expect(questProgress(i, 'knight', T0)).toEqual([{ kind: 'quest', amount: 5, note: 'knight' }]);
  });

  it('grows the streak on consecutive days, caps it at 35 and resets after a gap', () => {
    const i = newIsland('snow', T0);
    const streak = (day: number) => questProgress(i, 'knight', T0 + day * DAY).find((p) => p.kind === 'streak')?.amount;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(streak)).toEqual([5, 10, 15, 20, 25, 30, 35, 35, 35]);
    expect(i.activeDays).toBe(9);
    expect(streak(10)).toBe(5);
    expect(i.activeDays).toBe(10);
  });
});

describe('caravans and the knight', () => {
  it('scales capacity, slots and risk as documented', () => {
    expect([0, 1, 5, 10].map(caravanCapacity)).toEqual([0, 20, 57, 212]);
    expect([0, 1, 3, 4, 7, 8, 10].map(caravanSlots)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(risk(1)).toEqual({ chance: 0.25, loss: 0.3 });
    expect(risk(10).chance).toBeCloseTo(0.07);
    expect(risk(10).loss).toBeCloseTo(0.12);
    expect([0, 2, 3, 8, 149, 150, 999].map(knightLevel)).toEqual([1, 1, 2, 3, 9, 10, 10]);
  });

  const setup = () => {
    const a = rich('snow');
    const b = newIsland('forest', T0);
    upgrade(a, 'harbor', T0);
    return { a, b };
  };

  it('moves cargo from sender to receiver and pays the sender for a requested delivery', () => {
    const { a, b } = setup();
    const ice = a.res.ice;
    const { caravan } = sendCaravan(a, { id: 'c-safe-1', from: 'A', to: 'B', res: 'ice', amount: 20, requestId: 'r1', inTransit: 0 }, T0);
    expect(a.res.ice).toBe(ice - 20);
    expect(caravan.arriveAt - caravan.departAt).toBe(30 * 60 * 1000);
    const credits = a.res.credits;
    const out = arrive(caravan, a, b, 0);
    expect(out.delivered + out.lost).toBe(20);
    expect(b.res.ice).toBe(out.delivered);
    expect(a.res.credits - credits).toBe(out.delivered * 20);
    expect(out.reputation).toBe(out.delivered);
    expect(out.points).toEqual([{ kind: 'delivery', amount: out.delivered * 2, note: `${out.delivered} ice to B` }]);
    expect(a.knight.deliveries).toBe(1);
    expect(() => arrive(caravan, a, b, 0)).toThrow(/already/);
  });

  it('halves points for repeat deliveries to the same player and stops at the fourth', () => {
    const pts = [0, 1, 2, 3].map((earlier) => {
      const { a, b } = setup();
      const { caravan } = sendCaravan(a, { id: `c-decay`, from: 'A', to: 'B', res: 'ice', amount: 20, requestId: 'r', inTransit: 0 }, T0);
      const out = arrive(caravan, a, b, earlier);
      return [out.points[0]?.amount ?? 0, out.delivered];
    });
    const d = pts[0][1];
    expect(pts.map((p) => p[0])).toEqual([d * 2, d, Math.round(d * 0.5), 0]);
  });

  it('gives no rewards for a gift without a request, but the cargo still arrives', () => {
    const { a, b } = setup();
    const { caravan } = sendCaravan(a, { id: 'gift', from: 'A', to: 'B', res: 'ice', amount: 5, inTransit: 0 }, T0);
    const out = arrive(caravan, a, b, 0);
    expect(out.points).toEqual([]);
    expect(out.credits).toBe(0);
    expect(b.res.ice).toBe(out.delivered);
  });

  it('rejects bad caravans', () => {
    const { a } = setup();
    const send = (over: object) => sendCaravan(a, { id: 'x', from: 'A', to: 'B', res: 'ice', amount: 5, inTransit: 0, ...over }, T0);
    expect(() => send({ to: 'A' })).toThrow(/yourself/);
    expect(() => send({ amount: 21 })).toThrow(/larger/);
    expect(() => send({ inTransit: 1 })).toThrow(/free/);
    expect(() => send({ amount: 0 })).toThrow(/nothing/);
    a.res.ice = 3;
    expect(() => send({})).toThrow(/enough/);
    expect(() => sendCaravan(newIsland('snow', T0), { id: 'y', from: 'A', to: 'B', res: 'energy', amount: 5, inTransit: 0 }, T0)).toThrow(/free/);
  });

  it('loses cargo about as often and as much as the knight level says', () => {
    const base: Caravan = { id: '', from: 'A', to: 'B', res: 'ice', amount: 100, departAt: 0, arriveAt: 1, requestId: null, status: 'travel', event: null, lost: 0, delivered: 0 };
    const rate = (level: number) => {
      let hits = 0;
      let lost = 0;
      for (let n = 0; n < 4000; n++) {
        const r = rollJourney({ ...base, id: `sample-${n}` }, level);
        if (r.event) { hits++; lost += r.lost; }
      }
      return { chance: hits / 4000, loss: hits ? lost / hits : 0 };
    };
    const l1 = rate(1);
    const l10 = rate(10);
    expect(l1.chance).toBeGreaterThan(0.22);
    expect(l1.chance).toBeLessThan(0.28);
    expect(l1.loss).toBe(30);
    expect(l10.chance).toBeGreaterThan(0.05);
    expect(l10.chance).toBeLessThan(0.09);
    expect(l10.loss).toBe(12);
    expect(rollJourney({ ...base, id: 'same' }, 1)).toEqual(rollJourney({ ...base, id: 'same' }, 1));
  });
});

describe('rewards', () => {
  const NEAR = 10n ** 24n;
  const s = (account: string, points: number, activeDays = 5, level = 4) => ({ account, points, activeDays, islandLevel: level });

  it('needs three active days and island level three to claim', () => {
    expect(eligible({ activeDays: 3, islandLevel: 3 })).toBe(true);
    expect(eligible({ activeDays: 2, islandLevel: 9 })).toBe(false);
    expect(eligible({ activeDays: 9, islandLevel: 2 })).toBe(false);
  });

  it('splits 80% by points and sends 20% to the best archipelago', () => {
    const { payouts, distributed } = splitPool(100n * NEAR, [s('a', 300), s('b', 100), s('bot', 900, 1, 1)], 'dao');
    expect(payouts).toEqual([
      { account: 'a', amount: 60n * NEAR },
      { account: 'b', amount: 20n * NEAR },
      { account: 'dao', amount: 20n * NEAR },
    ]);
    expect(distributed).toBe(100n * NEAR);
  });

  it('caps one player at 5% of the pool on a big server and keeps the rest in the pool', () => {
    const scores = [s('whale', 1_000_000), ...Array.from({ length: 99 }, (_, i) => s(`p${i}`, 10))];
    const { payouts, distributed, cap } = splitPool(100n * NEAR, scores, null);
    expect(cap).toBe(5n * NEAR);
    expect(payouts[0]).toEqual({ account: 'whale', amount: 5n * NEAR });
    expect(distributed < 6n * NEAR).toBe(true);
  });

  it('never pays out more than the pool', () => {
    for (const n of [1, 2, 3, 7, 40, 41]) {
      const { distributed } = splitPool(7n * NEAR + 13n, Array.from({ length: n }, (_, i) => s(`p${i}`, 1 + i * 7)), 'dao');
      expect(distributed <= 7n * NEAR + 13n).toBe(true);
    }
    expect(splitPool(NEAR, [], null).payouts).toEqual([]);
  });

  it('builds a merkle tree whose proofs verify, for any number of leaves', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 33]) {
      const payouts = Array.from({ length: n }, (_, i) => ({ account: `tg${i}.isle.testnet`, amount: BigInt(i + 1) * NEAR }));
      const tree = buildTree(3, payouts);
      expect(tree.root).toMatch(/^[0-9a-f]{64}$/);
      for (const p of payouts) {
        expect(verifyProof(tree.root, 3, p.account, p.amount, tree.proofs[p.account])).toBe(true);
        expect(verifyProof(tree.root, 3, p.account, p.amount + 1n, tree.proofs[p.account])).toBe(false);
        expect(verifyProof(tree.root, 4, p.account, p.amount, tree.proofs[p.account])).toBe(false);
      }
    }
    const one = buildTree(1, [{ account: 'a.testnet', amount: 5n }]);
    expect(one.proofs['a.testnet']).toEqual([]);
    expect(one.root).toBe(Buffer.from(leafHash(1, 'a.testnet', 5n)).toString('hex'));
    expect(() => buildTree(1, [{ account: 'a', amount: 1n }, { account: 'a', amount: 2n }])).toThrow(/duplicate/);
  });
});

describe('treasure hunt', () => {
  it('buries three treasures a day, the same for the same player and day', () => {
    const i = newIsland('snow', T0);
    const map = huntMap('p1', i, T0);
    expect(map.length).toBe(3);
    expect(new Set(map.map((t) => t.tile)).size).toBe(3);
    expect(huntMap('p1', i, T0 + HOUR)).toEqual(map);
    expect(huntMap('p1', i, T0 + DAY).map((t) => t.tile)).not.toEqual(map.map((t) => t.tile));
  });

  it('pays for a hit, hints the distance, limits digs and resets next day', () => {
    const i = newIsland('snow', T0);
    const map = huntMap('p1', i, T0);
    const empty = [...Array(HUNT_TILES).keys()].filter((t) => !map.some((m) => m.tile === t));
    const miss = dig('p1', i, empty[0], T0);
    expect(miss.found).toBe(null);
    expect(miss.hint).toBeGreaterThan(0);
    expect(miss.points.map((p) => p.note)).toEqual(['hunt', 'day 1']);
    const before = i.res[map[0].res];
    const hit = dig('p1', i, map[0].tile, T0);
    expect(hit.found?.amount).toBe(map[0].amount);
    expect(i.res[map[0].res]).toBe(before + map[0].amount);
    expect(() => dig('p1', i, map[0].tile, T0)).toThrow(/already/);
    for (const t of empty.slice(1, 5)) dig('p1', i, t, T0);
    expect(digsLeft(i, T0)).toBe(0);
    expect(() => dig('p1', i, empty[6], T0)).toThrow(/no digs/);
    expect(digsLeft(i, T0 + DAY)).toBe(6);
  });

  it('hands out each collectible at most once', () => {
    const i = newIsland('snow', T0);
    for (let day = 0; day < 200 && i.eggs.length < EGGS.length; day++) {
      const now = T0 + day * DAY;
      for (const t of huntMap('p1', i, now)) dig('p1', i, t.tile, now);
    }
    expect([...i.eggs].sort()).toEqual([...EGGS].sort());
    expect(new Set(i.eggs).size).toBe(EGGS.length);
  });
});

describe('wandering trader', () => {
  const stock = (): Stock => Object.fromEntries(RARE.map((r) => [r, 200])) as Stock;

  it('charges more when stock is scarce and less when there is plenty', () => {
    expect(quote(200)).toMatchObject({ buy: 14, sell: 9, mood: 'normal' });
    expect(quote(20).buy).toBeGreaterThan(quote(200).buy * 4);
    expect(quote(2000).buy).toBeLessThan(quote(200).buy / 2);
    expect(quote(0).buy).toBe(132);
    expect(quote(1e9).sell).toBe(3);
    expect(quote(50).mood).toBe('scarce');
    expect(quote(400).mood).toBe('plenty');
  });

  it('moves the price with every deal and never sells below what it pays', () => {
    const i = rich();
    const st = stock();
    const paid = buy(i, st, 'wood', 50).credits;
    expect(st.wood).toBe(150);
    expect(paid).toBeGreaterThan(50 * 14);
    const got = sell(i, st, 'wood', 50).credits;
    expect(st.wood).toBe(200);
    expect(got).toBeLessThan(paid);
    for (const n of [1, 10, 100, 1000, 100000]) expect(quote(n).buy).toBeGreaterThan(quote(n).sell);
  });

  it('rejects deals it cannot do', () => {
    const i = newIsland('snow', T0);
    const st = stock();
    expect(() => buy(i, st, 'wood', 50)).toThrow(/credits/);
    expect(() => sell(i, st, 'wood', 1)).toThrow(/enough/);
    expect(() => buy(rich(), st, 'wood', 51)).toThrow(/at most/);
    st.wood = 3;
    expect(() => buy(rich(), st, 'wood', 4)).toThrow(/does not have/);
  });
});

describe('merkle format shared with contracts/rewards-pool', () => {
  it('reproduces the contract test vectors: every leaf, proof and the root', async () => {
    const { readFileSync } = await import('node:fs');
    const v = JSON.parse(readFileSync(new URL('../../../contracts/rewards-pool/test-vectors.json', import.meta.url), 'utf8'));
    const payouts = v.leaves.map((l: { account_id: string; amount: string }) => ({ account: l.account_id, amount: BigInt(l.amount) }));
    const tree = buildTree(v.epoch, payouts);
    expect(tree.root).toBe(v.root);
    for (const l of v.leaves) {
      expect(tree.leaves[l.account_id]).toBe(l.leaf);
      expect(tree.proofs[l.account_id]).toEqual(l.proof);
      expect(verifyProof(v.root, v.epoch, l.account_id, BigInt(l.amount), l.proof)).toBe(true);
    }
  });
});

describe('daily reward', async () => {
  const { claimDaily, dailyReward, dailyState } = await import('../src/daily.ts');
  it('walks a 7-day calendar, once per day, and starts over after a missed day or day 7', () => {
    const i = newIsland('snow', T0);
    expect(dailyState(i, T0)).toEqual({ available: true, step: 1, claimedToday: false });
    expect(claimDaily(i, T0)).toEqual({ step: 1, reward: { credits: 60 } });
    expect(i.res.credits).toBe(210);
    expect(() => claimDaily(i, T0 + HOUR)).toThrow(/already/);
    expect(dailyState(i, T0 + HOUR)).toMatchObject({ available: false, claimedToday: true });
    const steps = [1, 2, 3, 4, 5, 6].map((d) => claimDaily(i, T0 + d * DAY).step);
    expect(steps).toEqual([2, 3, 4, 5, 6, 7]);
    expect(claimDaily(i, T0 + 7 * DAY).step).toBe(1);
    expect(claimDaily(i, T0 + 9 * DAY).step).toBe(1);
  });

  it('pays the chest on day 7 with every foreign rare, grows with the island, gives no points', () => {
    const i = newIsland('forest', T0);
    expect(dailyReward(i, 7)).toEqual({ credits: 300, materials: 200, ice: 6, fruit: 6, glass: 6 });
    expect(dailyReward(i, 5)).toEqual({ ice: 3, fruit: 3, glass: 3 });
    for (const b of BUILDINGS) i.levels[b] = 4;
    expect(dailyReward(i, 1)).toEqual({ credits: 300 });
    expect(Object.keys(claimDaily(i, T0))).toEqual(['step', 'reward']);
  });
});
