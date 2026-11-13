import { randomBytes } from 'node:crypto';
import {
  ARCHIPELAGO_MAX, BIOMES, BUILDINGS, DAY, EPOCH, EPOCHS_PER_SEASON, GameError, HOUR, MAX_OPEN_REQUESTS, RARE, RARE_OF,
  REFERRAL_XP, RESOURCES, TRADER_TARGET_STOCK, arrive, buildTree, buy, caravanCapacity, collect, dayOf, dig, digsLeft,
  eligible, huntMap, isRare, islandLevel, newIsland, questProgress, quote, sell, sendCaravan, splitPool, touch, upgrade,
  type Biome, type Building, type Caravan, type Island, type PointEvent, type Producer, type Rare, type Res, type Stock,
} from '@isle/core';
import type { Config } from './config.ts';
import { all, getMeta, one, run, setMeta, type Db, type Tx } from './db.ts';

export interface Player {
  id: string;
  tgId: string | null;
  name: string;
  lang: string;
  npc: boolean;
  island: Island;
  ledger: Partial<Record<Res, number>>;
  archipelagoId: string | null;
  refBy: string | null;
  refMarks: string[];
  wallet: string | null;
}

interface Clock { anchorReal: number; anchorGame: number; speed: number; genesis: number }

export interface Ctx {
  tx: Tx;
  cfg: Config;
  now: number;
  speed: number;
  epoch: number;
  genesis: number;
  players: Map<string, Player>;
}

const newId = (prefix: string) => prefix + randomBytes(5).toString('hex');
const NPCS: { id: string; biome: Biome; name: string }[] = [
  { id: 'npc-snow', biome: 'snow', name: 'Bjorn' },
  { id: 'npc-tropical', biome: 'tropical', name: 'Marisol' },
  { id: 'npc-desert', biome: 'desert', name: 'Zahir' },
  { id: 'npc-forest', biome: 'forest', name: 'Elowen' },
];
const NPC_STEP = 10 * 60 * 1000;

export class World {
  constructor(public db: Db, public cfg: Config) {}

  // ---------- accounts (never sent to the Mini App) ----------
  account = (playerId: string) => `${playerId}.${this.cfg.gameAccount}`;
  knightAccount = (playerId: string) => `knight-${playerId}.${this.cfg.gameAccount}`;
  traderAccount = () => `trader.${this.cfg.gameAccount}`;

  // ---------- clock ----------
  private async clock(tx: Tx): Promise<Clock> {
    let c = await getMeta<Clock>(tx, 'clock');
    if (!c) {
      const real = Date.now();
      c = { anchorReal: real, anchorGame: real, speed: 1, genesis: Math.floor(real / DAY) * DAY };
      await setMeta(tx, 'clock', c);
      // On-chain epoch ids are base * 1000 + epoch, so a fresh database never collides with roots already on chain.
      await setMeta(tx, 'epoch_base', Math.floor(real / 1000));
    }
    return c;
  }

  private gameNow = (c: Clock, real = Date.now()) => Math.floor(c.anchorGame + (real - c.anchorReal) * c.speed);

  async setSpeed(speed: number): Promise<void> {
    if (!(speed >= 1 && speed <= 20000)) throw new GameError('speed', 'speed must be between 1 and 20000');
    await this.db.write(async (tx) => {
      const c = await this.clock(tx);
      const real = Date.now();
      await setMeta(tx, 'clock', { ...c, anchorGame: this.gameNow(c, real), anchorReal: real, speed });
    });
  }

  /** Runs one game request: opens a transaction, moves the world forward, runs `fn`, saves everything touched. */
  async act<T>(fn: (ctx: Ctx) => Promise<T>): Promise<T> {
    return this.db.write(async (tx) => {
      const c = await this.clock(tx);
      const now = this.gameNow(c);
      const ctx: Ctx = {
        tx, cfg: this.cfg, now, speed: c.speed, genesis: c.genesis,
        epoch: Math.floor((now - c.genesis) / EPOCH) + 1, players: new Map(),
      };
      await this.tick(ctx);
      const out = await fn(ctx);
      await this.flush(ctx);
      return out;
    });
  }

  // ---------- players ----------
  private fromRow(r: Record<string, unknown>): Player {
    return {
      id: r.id as string, tgId: (r.tg_id as string) ?? null, name: r.name as string, lang: r.lang as string,
      npc: Number(r.npc) === 1, island: JSON.parse(r.island as string), ledger: JSON.parse(r.ledger as string),
      archipelagoId: (r.archipelago_id as string) ?? null, refBy: (r.ref_by as string) ?? null,
      refMarks: JSON.parse(r.ref_marks as string), wallet: (r.wallet as string) ?? null,
    };
  }

  async load(ctx: Ctx, id: string): Promise<Player> {
    const hit = ctx.players.get(id);
    if (hit) return hit;
    const row = await one(ctx.tx, 'SELECT * FROM players WHERE id = ?', [id]);
    if (!row) throw new GameError('player', 'no such player');
    const p = this.fromRow(row);
    touch(p.island, ctx.now);
    ctx.players.set(id, p);
    return p;
  }

  async byTg(ctx: Ctx, tgId: string): Promise<Player | null> {
    const row = await one<{ id: string }>(ctx.tx, 'SELECT id FROM players WHERE tg_id = ?', [tgId]);
    return row ? this.load(ctx, row.id) : null;
  }

  private async op(ctx: Ctx, kind: string, payload: unknown): Promise<void> {
    await run(ctx.tx, 'INSERT INTO chain_ops (kind, payload, created_at) VALUES (?, ?, ?)', [kind, JSON.stringify(payload), Date.now()]);
  }

  /** A real token transfer between two accounts; keeps the players' expected on-chain balances in step. */
  private async transfer(ctx: Ctx, from: { account: string; player?: Player }, to: { account: string; player?: Player }, res: Res, amount: number, memo: string): Promise<void> {
    if (amount <= 0) return;
    if (from.player) from.player.ledger[res] = (from.player.ledger[res] ?? 0) - amount;
    if (to.player) to.player.ledger[res] = (to.player.ledger[res] ?? 0) + amount;
    await this.op(ctx, 'transfer', { from: from.account, to: to.account, res, amount, memo });
  }

  private async addPoints(ctx: Ctx, playerId: string, events: PointEvent[]): Promise<void> {
    for (const e of events) {
      await run(ctx.tx, 'INSERT INTO points (player_id, epoch, kind, amount, note, at) VALUES (?, ?, ?, ?, ?, ?)',
        [playerId, ctx.epoch, e.kind, e.amount, e.note ?? null, ctx.now]);
    }
  }

  private async event(ctx: Ctx, playerId: string, kind: string, data: unknown = {}): Promise<void> {
    await run(ctx.tx, 'INSERT INTO events (player_id, kind, data, at) VALUES (?, ?, ?, ?)', [playerId, kind, JSON.stringify(data), ctx.now]);
  }

  /** Saves every touched player. Whatever changed in balances beyond explicit transfers becomes a mint or a burn. */
  private async flush(ctx: Ctx): Promise<void> {
    for (const p of ctx.players.values()) {
      const mint: Partial<Record<Res, number>> = {};
      const burn: Partial<Record<Res, number>> = {};
      for (const r of RESOURCES) {
        const want = Math.floor(p.island.res[r]);
        const diff = want - (p.ledger[r] ?? 0);
        if (diff > 0) mint[r] = diff;
        if (diff < 0) burn[r] = -diff;
        p.ledger[r] = want;
      }
      if (Object.keys(mint).length) await this.op(ctx, 'mint', { account: this.account(p.id), amounts: mint });
      if (Object.keys(burn).length) await this.op(ctx, 'burn', { account: this.account(p.id), amounts: burn });
      await this.referralMarks(ctx, p);
      await run(ctx.tx, 'UPDATE players SET island = ?, ledger = ?, archipelago_id = ?, ref_marks = ?, wallet = ?, lang = ?, name = ? WHERE id = ?',
        [JSON.stringify(p.island), JSON.stringify(p.ledger), p.archipelagoId, JSON.stringify(p.refMarks), p.wallet, p.lang, p.name, p.id]);
    }
  }

  /** XP for the inviter, paid for what the friend achieves and never for the sign-up alone. */
  private async referralMarks(ctx: Ctx, p: Player): Promise<void> {
    if (!p.refBy) return;
    const reached: (keyof typeof REFERRAL_XP)[] = ['joined', 'island'];
    if (islandLevel(p.island) >= 5) reached.push('level5');
    if (p.island.activeDays >= 7) reached.push('days7');
    if (!p.refMarks.includes('quests3')) {
      const q = await one<{ n: number }>(ctx.tx, "SELECT COUNT(*) AS n FROM points WHERE player_id = ? AND kind = 'quest'", [p.id]);
      if (Number(q?.n ?? 0) >= 3) reached.push('quests3');
    }
    for (const mark of reached) {
      if (p.refMarks.includes(mark)) continue;
      p.refMarks.push(mark);
      await run(ctx.tx, 'UPDATE players SET ref_xp = ref_xp + ? WHERE id = ?', [REFERRAL_XP[mark], p.refBy]);
    }
  }

  async createPlayer(ctx: Ctx, args: { tgId: string | null; name: string; lang: string; biome: Biome; ref?: string | null; npc?: boolean; id?: string }): Promise<Player> {
    if (!BIOMES.includes(args.biome)) throw new GameError('biome', 'unknown biome');
    if (args.tgId && (await this.byTg(ctx, args.tgId))) throw new GameError('exists', 'island already exists');
    const id = args.id ?? newId('i');
    let refBy: string | null = null;
    let archipelagoId: string | null = null;
    if (args.ref) {
      const inviter = await one<{ id: string; archipelago_id: string | null }>(ctx.tx, 'SELECT id, archipelago_id FROM players WHERE id = ? AND npc = 0', [args.ref]);
      if (inviter) {
        refBy = inviter.id;
        // A friend who came by a link lands in the inviter's archipelago straight away.
        if (inviter.archipelago_id && (await this.memberCount(ctx, inviter.archipelago_id)) < ARCHIPELAGO_MAX) archipelagoId = inviter.archipelago_id;
      }
    }
    const p: Player = {
      id, tgId: args.tgId, name: args.name.trim().slice(0, 40) || 'Islander', lang: args.lang, npc: !!args.npc,
      island: newIsland(args.biome, ctx.now), ledger: {}, archipelagoId, refBy, refMarks: [], wallet: null,
    };
    await run(ctx.tx, 'INSERT INTO players (id, tg_id, name, lang, npc, island, archipelago_id, ref_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.id, p.tgId, p.name, p.lang, p.npc ? 1 : 0, JSON.stringify(p.island), archipelagoId, refBy, ctx.now]);
    await this.op(ctx, 'create_account', { account: this.account(id) });
    await this.op(ctx, 'create_account', { account: this.knightAccount(id) });
    ctx.players.set(id, p);
    if (!p.npc) await this.event(ctx, id, 'welcome');
    return p;
  }

  // ---------- island actions ----------
  async collect(ctx: Ctx, p: Player, only?: Producer): Promise<Partial<Record<Res, number>>> {
    const gained = collect(p.island, ctx.now, only);
    if (Object.keys(gained).length) await this.addPoints(ctx, p.id, questProgress(p.island, 'collect', ctx.now));
    return gained;
  }

  async upgrade(ctx: Ctx, p: Player, b: Building) {
    if (!BUILDINGS.includes(b)) throw new GameError('building', 'unknown building');
    const out = upgrade(p.island, b, ctx.now);
    await this.addPoints(ctx, p.id, out.points);
    return out;
  }

  async talk(ctx: Ctx, p: Player): Promise<void> {
    await this.addPoints(ctx, p.id, questProgress(p.island, 'knight', ctx.now));
  }

  async dig(ctx: Ctx, p: Player, tile: number) {
    const out = dig(p.id, p.island, tile, ctx.now);
    await this.addPoints(ctx, p.id, out.points);
    return { found: out.found, hint: out.hint, left: out.left };
  }

  // ---------- caravans and the request board ----------
  async postRequest(ctx: Ctx, p: Player, res: Res, amount: number): Promise<string> {
    const n = Math.floor(amount);
    if (!isRare(res)) throw new GameError('res', 'only rare resources can be requested');
    if (res === RARE_OF[p.island.biome]) throw new GameError('res', 'you make this resource yourself');
    if (!(n >= 1 && n <= 200)) throw new GameError('amount', 'ask for 1 to 200');
    const open = await one<{ n: number }>(ctx.tx, "SELECT COUNT(*) AS n FROM requests WHERE player_id = ? AND status = 'open'", [p.id]);
    if (Number(open?.n ?? 0) >= MAX_OPEN_REQUESTS) throw new GameError('limit', 'too many open requests');
    const id = newId('r');
    await run(ctx.tx, "INSERT INTO requests (id, player_id, res, amount, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)", [id, p.id, res, n, ctx.now]);
    return id;
  }

  async cancelRequest(ctx: Ctx, p: Player, id: string): Promise<void> {
    await run(ctx.tx, "UPDATE requests SET status = 'cancelled' WHERE id = ? AND player_id = ? AND status = 'open'", [id, p.id]);
  }

  async send(ctx: Ctx, p: Player, args: { to?: string; res?: Res; amount: number; requestId?: string | null }): Promise<Caravan> {
    let { to, res } = args;
    let amount = Math.floor(args.amount);
    const requestId = args.requestId ?? null;
    if (requestId) {
      const rq = await one<{ player_id: string; res: Res; amount: number; filled: number; promised: number; status: string }>(ctx.tx, 'SELECT * FROM requests WHERE id = ?', [requestId]);
      if (!rq || rq.status !== 'open') throw new GameError('request', 'this request is closed');
      to = rq.player_id;
      res = rq.res;
      const left = Number(rq.amount) - Number(rq.filled) - Number(rq.promised);
      if (left <= 0) throw new GameError('request', 'other caravans are already on the way');
      amount = Math.min(amount, left);
    }
    if (!to || !res || !RESOURCES.includes(res)) throw new GameError('args', 'where to and what?');
    const receiver = await this.load(ctx, to);
    const transit = await one<{ n: number }>(ctx.tx, "SELECT COUNT(*) AS n FROM caravans WHERE from_id = ? AND status = 'travel'", [p.id]);
    const { caravan, points } = sendCaravan(p.island, { id: newId('c'), from: p.id, to: receiver.id, res, amount, requestId, inTransit: Number(transit?.n ?? 0) }, ctx.now);
    await this.addPoints(ctx, p.id, points);
    if (requestId) await run(ctx.tx, 'UPDATE requests SET promised = promised + ? WHERE id = ?', [caravan.amount, requestId]);
    await run(ctx.tx, "INSERT INTO caravans (id, from_id, to_id, res, amount, depart_at, arrive_at, request_id, status, epoch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'travel', ?)",
      [caravan.id, caravan.from, caravan.to, caravan.res, caravan.amount, caravan.departAt, caravan.arriveAt, requestId, ctx.epoch]);
    // The knight carries the cargo in its own account while the caravan is on the road.
    await this.transfer(ctx, { account: this.account(p.id), player: p }, { account: this.knightAccount(p.id) }, caravan.res, caravan.amount, `caravan ${caravan.id} departs`);
    return caravan;
  }

  private caravanRow(r: Record<string, unknown>): Caravan {
    return {
      id: r.id as string, from: r.from_id as string, to: r.to_id as string, res: r.res as Res, amount: Number(r.amount),
      departAt: Number(r.depart_at), arriveAt: Number(r.arrive_at), requestId: (r.request_id as string) ?? null,
      status: r.status as Caravan['status'], event: (r.event as Caravan['event']) ?? null, lost: Number(r.lost), delivered: Number(r.delivered),
    };
  }

  private async resolveCaravans(ctx: Ctx): Promise<void> {
    const due = await all(ctx.tx, "SELECT * FROM caravans WHERE status = 'travel' AND arrive_at <= ? ORDER BY arrive_at", [ctx.now]);
    for (const row of due) {
      const c = this.caravanRow(row);
      const sender = await this.load(ctx, c.from);
      const receiver = await this.load(ctx, c.to);
      const earlier = await one<{ n: number }>(ctx.tx, "SELECT COUNT(*) AS n FROM caravans WHERE from_id = ? AND to_id = ? AND epoch = ? AND status = 'done' AND rewarded = 1", [c.from, c.to, ctx.epoch]);
      const out = arrive(c, sender.island, receiver.island, Number(earlier?.n ?? 0));
      await run(ctx.tx, "UPDATE caravans SET status = 'done', event = ?, lost = ?, delivered = ?, rewarded = ?, epoch = ? WHERE id = ?",
        [out.event, out.lost, out.delivered, c.requestId ? 1 : 0, ctx.epoch, c.id]);
      const knight = { account: this.knightAccount(sender.id) };
      await this.transfer(ctx, knight, { account: this.account(receiver.id), player: receiver }, c.res, out.delivered, `caravan ${c.id} arrives`);
      if (out.lost > 0) {
        // What pirates and storms take ends up on the wandering trader's shelf.
        await this.transfer(ctx, knight, { account: this.traderAccount() }, c.res, out.lost, `caravan ${c.id}: ${out.event}`);
        if (isRare(c.res)) {
          const stock = await this.stock(ctx);
          stock[c.res] += out.lost;
          await setMeta(ctx.tx, 'trader', stock);
        }
      }
      if (c.requestId) {
        const rq = await one<{ amount: number; filled: number }>(ctx.tx, 'SELECT amount, filled FROM requests WHERE id = ?', [c.requestId]);
        const filled = Number(rq?.filled ?? 0) + out.delivered;
        await run(ctx.tx, 'UPDATE requests SET promised = MAX(0, promised - ?), filled = ?, status = CASE WHEN ? >= amount AND status = \'open\' THEN \'done\' ELSE status END WHERE id = ?',
          [c.amount, filled, filled, c.requestId]);
      }
      await this.addPoints(ctx, sender.id, out.points);
      const data = { id: c.id, res: c.res, delivered: out.delivered, lost: out.lost, event: out.event, credits: out.credits, to: receiver.name, from: sender.name, level: out.knightLevelUp };
      if (!sender.npc) await this.event(ctx, sender.id, 'caravan_back', data);
      if (!receiver.npc) await this.event(ctx, receiver.id, 'caravan_in', data);
    }
  }

  // ---------- wandering trader ----------
  async stock(ctx: Ctx): Promise<Stock> {
    let s = await getMeta<Stock>(ctx.tx, 'trader');
    if (!s) {
      s = Object.fromEntries(RARE.map((r) => [r, TRADER_TARGET_STOCK])) as Stock;
      await setMeta(ctx.tx, 'trader', s);
      await this.op(ctx, 'create_account', { account: this.traderAccount() });
      await this.op(ctx, 'mint', { account: this.traderAccount(), amounts: { ...s, credits: 1_000_000 } });
    }
    return s;
  }

  async trade(ctx: Ctx, p: Player, side: 'buy' | 'sell', res: Rare, amount: number): Promise<{ credits: number }> {
    if (!isRare(res)) throw new GameError('res', 'the trader deals only in rare resources');
    const stock = await this.stock(ctx);
    const n = Math.floor(amount);
    const out = side === 'buy' ? buy(p.island, stock, res, n) : sell(p.island, stock, res, n);
    await setMeta(ctx.tx, 'trader', stock);
    const me = { account: this.account(p.id), player: p };
    const trader = { account: this.traderAccount() };
    if (side === 'buy') {
      await this.transfer(ctx, me, trader, 'credits', out.credits, `buy ${n} ${res}`);
      await this.transfer(ctx, trader, me, res, n, `buy ${n} ${res}`);
    } else {
      await this.transfer(ctx, me, trader, res, n, `sell ${n} ${res}`);
      await this.transfer(ctx, trader, me, 'credits', out.credits, `sell ${n} ${res}`);
    }
    return out;
  }

  // ---------- guests ----------
  async visit(ctx: Ctx, p: Player, hostId: string) {
    if (hostId === p.id) throw new GameError('self', 'that is your own island');
    const host = await this.load(ctx, hostId);
    const day = dayOf(ctx.now);
    const seen = await one(ctx.tx, 'SELECT liked FROM visits WHERE from_id = ? AND to_id = ? AND day = ?', [p.id, hostId, day]);
    if (!seen) {
      await run(ctx.tx, 'INSERT INTO visits (from_id, to_id, day) VALUES (?, ?, ?)', [p.id, hostId, day]);
      await this.addPoints(ctx, p.id, questProgress(p.island, 'visit', ctx.now));
    }
    const likes = await one<{ likes: number }>(ctx.tx, 'SELECT likes FROM players WHERE id = ?', [hostId]);
    return {
      id: host.id, name: host.name, npc: host.npc, biome: host.island.biome, levels: host.island.levels, level: islandLevel(host.island),
      knightDeliveries: host.island.knight.deliveries, eggs: host.island.eggs.length, reputation: host.island.reputation,
      likes: Number(likes?.likes ?? 0), liked: Number((seen as { liked?: number } | null)?.liked ?? 0) === 1,
    };
  }

  /** One like per island per day. Likes are for fun and give no season points. */
  async like(ctx: Ctx, p: Player, hostId: string): Promise<boolean> {
    const day = dayOf(ctx.now);
    const row = await one<{ liked: number }>(ctx.tx, 'SELECT liked FROM visits WHERE from_id = ? AND to_id = ? AND day = ?', [p.id, hostId, day]);
    if (!row) throw new GameError('visit', 'visit the island first');
    if (Number(row.liked) === 1) return false;
    await run(ctx.tx, 'UPDATE visits SET liked = 1 WHERE from_id = ? AND to_id = ? AND day = ?', [p.id, hostId, day]);
    await run(ctx.tx, 'UPDATE players SET likes = likes + 1 WHERE id = ?', [hostId]);
    return true;
  }

  async islands(ctx: Ctx, p: Player) {
    const rows = await all(ctx.tx, 'SELECT id, name, npc, island, likes, archipelago_id FROM players WHERE id != ? ORDER BY npc ASC, likes DESC, created_at DESC LIMIT 40', [p.id]);
    return rows.map((r) => {
      const isl = JSON.parse(r.island as string) as Island;
      return { id: r.id, name: r.name, npc: Number(r.npc) === 1, biome: isl.biome, level: islandLevel(isl), likes: Number(r.likes), sameArchipelago: !!p.archipelagoId && r.archipelago_id === p.archipelagoId };
    });
  }

  // ---------- archipelagos ----------
  private async memberCount(ctx: Ctx, id: string): Promise<number> {
    const r = await one<{ n: number }>(ctx.tx, 'SELECT COUNT(*) AS n FROM players WHERE archipelago_id = ?', [id]);
    return Number(r?.n ?? 0);
  }

  async createArchipelago(ctx: Ctx, p: Player, rawName: string): Promise<string> {
    const name = rawName.trim().replace(/\s+/g, ' ').slice(0, 24);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (name.length < 3 || slug.length < 3) throw new GameError('name', 'the name needs at least 3 latin letters or digits');
    if (p.archipelagoId) throw new GameError('member', 'leave your archipelago first');
    if (await one(ctx.tx, 'SELECT id FROM archipelagos WHERE name = ? OR id = ?', [name, slug])) throw new GameError('taken', 'this name is taken');
    // The treasury (a Sputnik DAO) is created only when the archipelago first wins a weekly prize.
    await run(ctx.tx, 'INSERT INTO archipelagos (id, name, owner_id, dao, created_at) VALUES (?, ?, ?, NULL, ?)', [slug, name, p.id, ctx.now]);
    p.archipelagoId = slug;
    return slug;
  }

  async joinArchipelago(ctx: Ctx, p: Player, id: string): Promise<void> {
    if (p.archipelagoId) throw new GameError('member', 'leave your archipelago first');
    const a = await one<{ id: string }>(ctx.tx, 'SELECT id FROM archipelagos WHERE id = ?', [id]);
    if (!a) throw new GameError('archipelago', 'no such archipelago');
    if ((await this.memberCount(ctx, id)) >= ARCHIPELAGO_MAX) throw new GameError('full', 'this archipelago is full');
    p.archipelagoId = id;
  }

  async leaveArchipelago(ctx: Ctx, p: Player): Promise<void> {
    p.archipelagoId = null;
  }

  async archipelagos(ctx: Ctx, epoch = ctx.epoch) {
    const rows = await all(ctx.tx, `
      SELECT a.id, a.name, a.dao,
        (SELECT COUNT(*) FROM players p WHERE p.archipelago_id = a.id) AS members,
        (SELECT COALESCE(SUM(pt.amount), 0) FROM points pt JOIN players p ON p.id = pt.player_id WHERE p.archipelago_id = a.id AND pt.epoch = ?) AS points
      FROM archipelagos a ORDER BY points DESC, members DESC, a.created_at ASC LIMIT 50`, [epoch]);
    return rows.map((r) => ({ id: r.id as string, name: r.name as string, dao: (r.dao as string) ?? null, members: Number(r.members), points: Number(r.points) }));
  }

  async top(ctx: Ctx, epoch = ctx.epoch) {
    const rows = await all(ctx.tx, `
      SELECT p.id, p.name, p.island, SUM(pt.amount) AS points FROM points pt JOIN players p ON p.id = pt.player_id
      WHERE pt.epoch = ? AND p.npc = 0 GROUP BY p.id ORDER BY points DESC LIMIT 20`, [epoch]);
    return rows.map((r) => ({ id: r.id, name: r.name, biome: (JSON.parse(r.island as string) as Island).biome, points: Number(r.points) }));
  }

  // ---------- world tick ----------
  private async tick(ctx: Ctx): Promise<void> {
    await this.resolveCaravans(ctx);
    if (this.cfg.seedNeighbours) await this.neighbours(ctx);
    await this.closeEpochs(ctx);
  }

  /**
   * Residents: four scripted NPC islands, one per biome, each with its own account.
   * They keep one request on the board and answer players' requests for their own resource,
   * so a lone player (or a judge) always has neighbours to trade with.
   */
  private async neighbours(ctx: Ctx): Promise<void> {
    const last = (await getMeta<number>(ctx.tx, 'npc_at')) ?? 0;
    if (last && ctx.now - last < NPC_STEP) return;
    await setMeta(ctx.tx, 'npc_at', ctx.now);
    const step = Math.floor(ctx.now / NPC_STEP);
    for (const [i, def] of NPCS.entries()) {
      let npc: Player;
      if (await one(ctx.tx, 'SELECT id FROM players WHERE id = ?', [def.id])) npc = await this.load(ctx, def.id);
      else {
        npc = await this.createPlayer(ctx, { tgId: null, name: def.name, lang: 'en', biome: def.biome, npc: true, id: def.id });
        for (const b of BUILDINGS) npc.island.levels[b] = 5;
      }
      const own = RARE_OF[def.biome];
      npc.island.res[own] = Math.max(npc.island.res[own], 300);
      // Keep one request of their own on the board.
      const open = await one(ctx.tx, "SELECT id FROM requests WHERE player_id = ? AND status = 'open'", [def.id]);
      if (!open) {
        const wants = RARE.filter((r) => r !== own)[(step + i) % 3];
        await run(ctx.tx, "INSERT INTO requests (id, player_id, res, amount, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)",
          [newId('r'), def.id, wants, 10 + ((step * 7 + i * 5) % 4) * 5, ctx.now]);
      }
      // Answer one waiting request for the resource this resident makes.
      const ask = await one<{ id: string; amount: number; filled: number; promised: number }>(ctx.tx, `
        SELECT r.id, r.amount, r.filled, r.promised FROM requests r JOIN players p ON p.id = r.player_id
        WHERE r.status = 'open' AND r.res = ? AND p.npc = 0 AND r.created_at <= ? AND r.amount - r.filled - r.promised > 0
        ORDER BY r.created_at LIMIT 1`, [own, ctx.now - NPC_STEP]);
      const busy = await one<{ n: number }>(ctx.tx, "SELECT COUNT(*) AS n FROM caravans WHERE from_id = ? AND status = 'travel'", [def.id]);
      if (ask && Number(busy?.n ?? 0) < 2) {
        const left = Number(ask.amount) - Number(ask.filled) - Number(ask.promised);
        await this.send(ctx, npc, { amount: Math.min(left, caravanCapacity(npc.island.levels.harbor)), requestId: ask.id });
      }
    }
  }

  private async poolPerEpoch(ctx: Ctx): Promise<bigint> {
    const v = await getMeta<string>(ctx.tx, 'pool_per_epoch');
    return v ? BigInt(v) : this.cfg.poolPerEpoch;
  }

  /** Closes every finished epoch that has points: computes payouts, builds the merkle tree, queues the root. */
  private async closeEpochs(ctx: Ctx): Promise<void> {
    const closed = (await getMeta<number>(ctx.tx, 'epoch_closed')) ?? 0;
    if (closed >= ctx.epoch - 1) return;
    const active = await all<{ epoch: number }>(ctx.tx, 'SELECT DISTINCT epoch FROM points WHERE epoch > ? AND epoch < ? ORDER BY epoch', [closed, ctx.epoch]);
    for (const { epoch } of active) await this.closeEpoch(ctx, Number(epoch));
    await setMeta(ctx.tx, 'epoch_closed', ctx.epoch - 1);
  }

  private async closeEpoch(ctx: Ctx, epoch: number): Promise<void> {
    const rows = await all(ctx.tx, `
      SELECT p.id, p.island, p.archipelago_id, SUM(pt.amount) AS points FROM points pt JOIN players p ON p.id = pt.player_id
      WHERE pt.epoch = ? AND p.npc = 0 GROUP BY p.id`, [epoch]);
    const scores = rows.map((r) => {
      const isl = JSON.parse(r.island as string) as Island;
      return { account: this.account(r.id as string), points: Number(r.points), activeDays: isl.activeDays, islandLevel: islandLevel(isl) };
    });
    const best = (await this.archipelagos(ctx, epoch)).find((a) => a.points > 0) ?? null;
    let treasury: string | null = null;
    if (best) {
      const row = await one<{ dao: string | null; dao_status: string | null }>(ctx.tx, 'SELECT dao, dao_status FROM archipelagos WHERE id = ?', [best.id]);
      const daos = await one<{ n: number }>(ctx.tx, "SELECT COUNT(*) AS n FROM archipelagos WHERE dao_status IN ('pending', 'live')");
      // A treasury whose DAO could not be paid for does not exist: its prize would be stuck in the pool.
      treasury = row?.dao && row.dao_status !== 'unfunded' ? row.dao : null;
      if (!treasury && !row?.dao && Number(daos?.n ?? 0) < this.cfg.maxDaos) {
        // First win: the archipelago gets its treasury. The name is generated: player text never goes on chain.
        const name = `kisle-${randomBytes(3).toString('hex')}`;
        treasury = `${name}.${this.cfg.daoFactory}`;
        const council = (await all<{ id: string }>(ctx.tx, 'SELECT id FROM players WHERE archipelago_id = ? AND npc = 0 ORDER BY created_at LIMIT 7', [best.id])).map((m) => this.account(m.id));
        await run(ctx.tx, "UPDATE archipelagos SET dao = ?, dao_status = 'pending' WHERE id = ?", [treasury, best.id]);
        await this.op(ctx, 'create_dao', { name, council, purpose: "Knight's Isle archipelago treasury", archipelago: best.id });
      }
    }
    const pool = await this.poolPerEpoch(ctx);
    const base = (await getMeta<number>(ctx.tx, 'epoch_base')) ?? 0;
    const chainEpoch = base * 1000 + epoch;
    const { payouts, distributed } = splitPool(pool, scores, treasury);
    const tree = payouts.length ? buildTree(chainEpoch, payouts) : null;
    const stored = payouts.map((p) => ({ account: p.account, amount: p.amount.toString(), proof: tree!.proofs[p.account] }));
    await run(ctx.tx, 'INSERT OR REPLACE INTO epochs (epoch, chain_epoch, root, pool, distributed, payouts, best_archipelago, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [epoch, chainEpoch, tree?.root ?? null, pool.toString(), distributed.toString(), JSON.stringify(stored), best?.id ?? null, ctx.now]);
    if (tree) await this.op(ctx, 'set_epoch_root', { epoch, chainEpoch, root: tree.root, total: distributed.toString() });
    for (const r of rows) await this.event(ctx, r.id as string, 'epoch_closed', { epoch, eligible: eligible(scores.find((s) => s.account === this.account(r.id as string))!) });
  }

  // ---------- views ----------
  async state(ctx: Ctx, p: Player) {
    const caravans = (await all(ctx.tx, `
      SELECT * FROM (SELECT * FROM caravans WHERE (from_id = ? OR to_id = ?) AND status = 'travel')
      UNION ALL SELECT * FROM (SELECT * FROM caravans WHERE (from_id = ? OR to_id = ?) AND status = 'done' ORDER BY arrive_at DESC LIMIT 6)`,
      [p.id, p.id, p.id, p.id])).map((r) => this.caravanRow(r));
    const reqRows = await all(ctx.tx, `
      SELECT r.id, r.player_id, r.res, r.amount, r.filled, r.promised, r.created_at, p.name, p.npc, p.archipelago_id FROM requests r
      JOIN players p ON p.id = r.player_id WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 60`);
    const requests = reqRows.map((r) => ({
      id: r.id as string, playerId: r.player_id as string, name: r.name as string, npc: Number(r.npc) === 1, res: r.res as Rare,
      amount: Number(r.amount), filled: Number(r.filled), promised: Number(r.promised), mine: r.player_id === p.id,
      sameArchipelago: !!p.archipelagoId && r.archipelago_id === p.archipelagoId,
    }));
    const events = await all(ctx.tx, 'SELECT id, kind, data, at FROM events WHERE player_id = ? AND seen = 0 ORDER BY id LIMIT 20', [p.id]);
    if (events.length) await run(ctx.tx, 'UPDATE events SET seen = 1 WHERE player_id = ? AND id <= ?', [p.id, Number(events[events.length - 1].id)]);
    const pts = await one<{ epoch: number; total: number }>(ctx.tx, 'SELECT COALESCE(SUM(CASE WHEN epoch = ? THEN amount END), 0) AS epoch, COALESCE(SUM(amount), 0) AS total FROM points WHERE player_id = ?', [ctx.epoch, p.id]);
    const me = await one<{ ref_xp: number; likes: number }>(ctx.tx, 'SELECT ref_xp, likes FROM players WHERE id = ?', [p.id]);
    const arch = p.archipelagoId ? await one<{ id: string; name: string }>(ctx.tx, 'SELECT id, name FROM archipelagos WHERE id = ?', [p.archipelagoId]) : null;
    const stock = await this.stock(ctx);
    const names: Record<string, string> = {};
    for (const c of caravans) for (const id of [c.from, c.to]) {
      if (!names[id]) names[id] = id === p.id ? p.name : ((await one<{ name: string }>(ctx.tx, 'SELECT name FROM players WHERE id = ?', [id]))?.name ?? '?');
    }
    const map = huntMap(p.id, p.island, ctx.now);
    return {
      now: ctx.now,
      speed: ctx.speed,
      epoch: {
        index: ctx.epoch, endsAt: ctx.genesis + ctx.epoch * EPOCH,
        season: Math.floor((ctx.epoch - 1) / EPOCHS_PER_SEASON) + 1, week: ((ctx.epoch - 1) % EPOCHS_PER_SEASON) + 1,
      },
      me: {
        id: p.id, name: p.name, lang: p.lang, refXp: Number(me?.ref_xp ?? 0), likes: Number(me?.likes ?? 0),
        points: Number(pts?.epoch ?? 0), pointsTotal: Number(pts?.total ?? 0), archipelago: arch,
        eligible: eligible({ activeDays: p.island.activeDays, islandLevel: islandLevel(p.island) }),
      },
      island: p.island,
      hunt: { left: digsLeft(p.island, ctx.now), hits: map.filter((t) => p.island.hunt.opened.includes(t.tile)).map((t) => ({ tile: t.tile, res: t.res, amount: t.amount, egg: t.egg })) },
      caravans,
      names,
      requests,
      trader: Object.fromEntries(RARE.map((r) => [r, quote(stock[r])])),
      events: events.map((e) => ({ id: Number(e.id), kind: e.kind as string, data: JSON.parse(e.data as string), at: Number(e.at) })),
    };
  }

  /** Players whose storage has just filled up and who were not told yet (for the bot). */
  async storageAlerts(ctx: Ctx): Promise<{ tgId: string; lang: string }[]> {
    const rows = await all(ctx.tx, 'SELECT id, tg_id, lang, island, notified FROM players WHERE npc = 0 AND tg_id IS NOT NULL');
    const out: { tgId: string; lang: string }[] = [];
    for (const r of rows) {
      const isl = JSON.parse(r.island as string) as Island;
      const notified = JSON.parse(r.notified as string) as { full?: number };
      const mark = Math.min(isl.collectedAt.solar, isl.collectedAt.factory, isl.collectedAt.datacenter);
      const hours = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14][Math.max(1, isl.levels.storage) - 1];
      if (ctx.now - mark < hours * HOUR || notified.full === mark) continue;
      out.push({ tgId: r.tg_id as string, lang: r.lang as string });
      await run(ctx.tx, 'UPDATE players SET notified = ? WHERE id = ?', [JSON.stringify({ ...notified, full: mark }), r.id as string]);
    }
    return out;
  }
}
