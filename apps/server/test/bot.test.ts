import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GrammyError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { DAY, EPOCH, HOUR, claimDaily } from '@isle/core';
import { createBot } from '../src/bot.ts';
import { config as base } from '../src/config.ts';
import { Db, getMeta, setMeta } from '../src/db.ts';
import { World } from '../src/world.ts';

const CHAIN_WORDS = /near|testnet|wallet|crypto|token|blockchain|блокчейн|кошел|крипт/i;
const botInfo = {
  id: 1, is_bot: true, first_name: 'Isle', username: 'isle_bot', can_join_groups: false, can_read_all_group_messages: false,
  supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false,
} as any;

async function setup(over: Partial<typeof base> = {}) {
  const cfg = { ...base, botToken: '1:TEST', webAppUrl: 'https://isle.example/', seedNeighbours: false, ...over };
  const db = await Db.open(`file:${mkdtempSync(join(tmpdir(), 'isle-bot-'))}/t.db`);
  const world = new World(db, cfg);
  const { bot, notify } = createBot(world, cfg, { botInfo });
  const calls: { method: string; payload: any }[] = [];
  let blocked = new Set<string>();
  bot.api.config.use(async (_prev, method, payload: any) => {
    if (method === 'sendMessage' && blocked.has(String(payload.chat_id))) {
      throw new GrammyError('blocked', { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }, method, payload);
    }
    calls.push({ method, payload });
    return { ok: true, result: { message_id: calls.length, date: 0, chat: { id: payload.chat_id, type: 'private' } } } as any;
  });
  let updateId = 0;
  const say = (from: number, text: string, lang = 'ru') => {
    const cmd = text.match(/^\/\w+/);
    return bot.handleUpdate({
      update_id: ++updateId,
      message: {
        message_id: updateId, date: 0, chat: { id: from, type: 'private', first_name: 'Ann' },
        from: { id: from, is_bot: false, first_name: 'Ann', language_code: lang }, text,
        entities: cmd ? [{ type: 'bot_command', offset: 0, length: cmd[0].length }] : undefined,
      },
    } as any);
  };
  const skip = (ms: number) => db.write(async (tx) => {
    const c = (await getMeta<any>(tx, 'clock'))!;
    await setMeta(tx, 'clock', { ...c, anchorGame: c.anchorGame + ms });
  });
  let read = 0;
  /** Messages sent since the last call. */
  const sent = () => {
    const out = calls.slice(read).filter((c) => c.method === 'sendMessage');
    read = calls.length;
    return out;
  };
  return { cfg, db, world, notify, calls, say, skip, sent, block: (id: string) => blocked.add(id), reset: () => { calls.length = 0; read = 0; blocked = new Set(); } };
}

describe('bot', () => {
  it('greets with a button that opens the Mini App and carries a friend invite', async () => {
    const s = await setup();
    await s.say(555, '/start ref_i0123456789');
    const [m] = s.sent();
    expect(m.payload.chat_id).toBe(555);
    expect(m.payload.text).toMatch(/Привет, Ann/);
    expect(m.payload.text).toMatch(/позвал друг/);
    expect(m.payload.reply_markup.inline_keyboard[0][0].web_app.url).toBe('https://isle.example/?ref=ref_i0123456789');
    expect(m.payload.text).not.toMatch(CHAIN_WORDS);

    // A malformed or foreign payload is ignored.
    await s.say(556, '/start https://evil.example', 'en');
    const [m2] = s.sent();
    expect(m2.payload.text).toMatch(/^Hi, Ann/);
    expect(m2.payload.reply_markup.inline_keyboard[0][0].web_app.url).toBe('https://isle.example/');

    // A returning player is welcomed back and keeps no invite.
    await s.world.act((w) => s.world.createPlayer(w, { tgId: '557', name: 'Ann', lang: 'ru', biome: 'snow' }));
    await s.say(557, '/start ref_i0123456789');
    const [m3] = s.sent();
    expect(m3.payload.text).toMatch(/С возвращением/);
    expect(m3.payload.reply_markup.inline_keyboard[0][0].web_app.url).toBe('https://isle.example/');

    await s.say(557, 'hello?');
    expect(s.sent()[0].payload.text).toMatch(/\/start/);
  });

  it('sends no Mini App button while the game has no https address', async () => {
    const s = await setup({ webAppUrl: 'http://localhost:4311' });
    await s.say(1, '/start');
    const [m] = s.sent();
    expect(m.payload.reply_markup).toBeUndefined();
    expect(m.payload.text).toMatch(/когда игра будет в сети/);
  });

  it('tells players about caravans, a full storage and the end of the week, once each, never about the chain', async () => {
    const s = await setup();
    const { world } = s;
    const ids = await world.act(async (w) => {
      const a = await world.createPlayer(w, { tgId: '1', name: 'Ann', lang: 'ru', biome: 'snow' });
      const b = await world.createPlayer(w, { tgId: '2', name: 'Bob', lang: 'en', biome: 'forest' });
      for (const r of Object.keys(a.island.res) as (keyof typeof a.island.res)[]) a.island.res[r] += 100_000;
      await world.upgrade(w, a, 'harbor');
      const rq = await world.postRequest(w, b, 'ice', 10);
      await world.send(w, a, { amount: 10, requestId: rq });
      return { a: a.id, b: b.id };
    });
    expect(await s.notify()).toBe(0);

    await s.skip(31 * 60 * 1000);
    expect(await s.notify()).toBe(2);
    const msgs = Object.fromEntries(s.sent().map((m) => [m.payload.chat_id, m.payload.text]));
    expect(msgs['2']).toMatch(/^🎈 A caravan from Ann brought you \d+ ice\./);
    expect(msgs['1']).toMatch(/^🛡 Рыцарь вернулся: Bob получил \d+ льда\. Твоя награда: \d+ кредитов\./);
    expect(await s.notify()).toBe(0);

    await s.skip(5 * HOUR);
    expect(await s.notify()).toBe(2);
    expect(s.sent().every((m) => m.payload.text.startsWith('📦'))).toBe(true);
    expect(await s.notify()).toBe(0);

    // Something the player already saw in the app is not pushed again.
    await world.act(async (w) => {
      const a = await world.load(w, ids.a);
      const b = await world.load(w, ids.b);
      const rq = await world.postRequest(w, b, 'ice', 10);
      await world.send(w, a, { amount: 10, requestId: rq });
    });
    await s.skip(31 * 60 * 1000);
    await world.act(async (w) => world.state(w, await world.load(w, ids.b)));
    expect(await s.notify()).toBe(1);
    expect(s.sent()[0].payload.chat_id).toBe('1');

    // Twelve hours before the week ends: a reminder for players with points this week.
    const clock = await world.db.write((tx) => getMeta<any>(tx, 'clock'));
    const now = await world.act(async (w) => w.now);
    await s.skip(clock!.genesis + EPOCH - 6 * HOUR - now);
    expect(await s.notify()).toBeGreaterThan(0);
    const week = s.sent().filter((m) => /⏳/.test(m.payload.text));
    expect(week.map((m) => m.payload.chat_id)).toEqual(['1']);
    expect(week[0].payload.text).toMatch(/Неделя скоро закончится\. У тебя \d+ очков/);

    // The week closes: everyone with points hears about it.
    await s.skip(7 * HOUR);
    await s.notify();
    expect(s.sent().some((m) => m.payload.chat_id === '1' && /Неделя закончилась/.test(m.payload.text))).toBe(true);

    for (const c of s.calls) expect(String(c.payload.text ?? '')).not.toMatch(CHAIN_WORDS);
  });

  it('stops writing to a player who blocked the bot', async () => {
    const s = await setup();
    await s.world.act((w) => s.world.createPlayer(w, { tgId: '9', name: 'Zed', lang: 'en', biome: 'desert' }));
    await s.skip(5 * HOUR);
    s.block('9');
    expect(await s.notify()).toBe(0);
    await s.skip(5 * HOUR);
    await s.world.act(async (w) => {
      const p = (await s.world.byTg(w, '9'))!;
      await s.world.collect(w, p);
    });
    await s.skip(5 * HOUR);
    s.reset();
    expect(await s.notify()).toBe(0);
    expect(s.calls).toEqual([]);
  });

  it('reminds about the daily gift once a day, only to players who took one before', async () => {
    const s = await setup();
    await s.world.act((w) => s.world.createPlayer(w, { tgId: '5', name: 'Ann', lang: 'ru', biome: 'snow' }));
    await s.world.act((w) => s.world.createPlayer(w, { tgId: '6', name: 'Bob', lang: 'en', biome: 'snow' }));
    await s.world.act(async (w) => { const p = (await s.world.byTg(w, '5'))!; claimDaily(p.island, w.now); });
    const clock = await s.world.db.write((tx) => getMeta<any>(tx, 'clock'));
    const now = await s.world.act(async (w) => w.now);
    await s.skip(Math.ceil((now + 1) / DAY) * DAY - now + HOUR); // one hour into the next day
    await s.notify();
    const msgs = s.sent();
    const gift = msgs.filter((m) => /подарок дня|daily gift/.test(m.payload.text));
    expect(gift.map((m) => m.payload.chat_id)).toEqual(['5']);
    expect(gift[0].payload.text).toMatch(/день 2 из 7/);
    await s.skip(HOUR);
    await s.notify();
    expect(s.sent().filter((m) => /подарок дня/.test(m.payload.text))).toEqual([]);
    void clock;
  });

  it('keeps reminders quiet while the time machine runs fast', async () => {
    const s = await setup();
    await s.world.act((w) => s.world.createPlayer(w, { tgId: '7', name: 'Kai', lang: 'en', biome: 'snow' }));
    await s.world.setSpeed(10080);
    await s.skip(5 * HOUR);
    expect(await s.notify()).toBe(0);
  });
});
