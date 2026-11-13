/**
 * The Telegram bot: /start with a button that opens the Mini App, and short notifications.
 * Telegram's rule for Mini Apps and their bots: no word about the chain, no link to the rewards site.
 */
import { createHash } from 'node:crypto';
import { Bot, GrammyError, InlineKeyboard } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Config } from './config.ts';
import type { Notice, World } from './world.ts';

type Lang = 'en' | 'ru';

const RES: Record<string, [string, string]> = {
  energy: ['energy', 'энергии'], materials: ['materials', 'материалов'], credits: ['credits', 'кредитов'],
  ice: ['ice', 'льда'], fruit: ['fruit', 'фруктов'], glass: ['glass', 'стекла'], wood: ['timber', 'древесины'],
};
const res = (lang: Lang, r: string) => (RES[r] ?? [r, r])[lang === 'ru' ? 1 : 0];

const TEXT = {
  play: ['🏝 Open my island', '🏝 Открыть остров'],
  menu: ['Play', 'Играть'],
  hello: [
    "Hi, {name}! A small flying island is waiting for you, and a little knight comes with it.\n\nBuild, gather, send caravans to your neighbours and band together into archipelagos. Your island keeps working while you are away.",
    'Привет, {name}! Тебя ждёт маленький летающий остров, а с ним маленький рыцарь.\n\nСтрой, собирай, отправляй караваны соседям и объединяйтесь в архипелаги. Остров работает, даже когда тебя нет.',
  ],
  back: ['Welcome back, {name}! Your knight has been guarding the island.', 'С возвращением, {name}! Рыцарь всё это время охранял остров.'],
  invited: ['A friend invited you: you will land in their archipelago.', 'Тебя позвал друг: ты попадёшь в его архипелаг.'],
  noApp: ['The island opens from the button below once the game is online.', 'Остров откроется кнопкой ниже, когда игра будет в сети.'],
  help: [
    'Tap the button to open your island.\n\n/start — the island button\n/help — this message',
    'Нажми кнопку, чтобы открыть остров.\n\n/start — кнопка острова\n/help — это сообщение',
  ],
  caravan_in: ['🎈 A caravan from {from} brought you {n} {res}.', '🎈 Караван от {from} привёз тебе {n} {res}.'],
  caravan_back: ['🛡 Your knight is back: {to} got {n} {res}. Your reward: {credits} credits.', '🛡 Рыцарь вернулся: {to} получил {n} {res}. Твоя награда: {credits} кредитов.'],
  caravan_gift: ['🛡 Your knight is back: {to} got {n} {res}.', '🛡 Рыцарь вернулся: {to} получил {n} {res}.'],
  pirates: ['🏴‍☠️ Pirates grabbed {lost} on the way.', '🏴‍☠️ По пути пираты отняли {lost}.'],
  storm: ['⛈ A storm took {lost} overboard.', '⛈ Шторм унёс за борт {lost}.'],
  level: ['⭐ Knight level {level}!', '⭐ Уровень рыцаря {level}!'],
  epoch_closed: ['📜 The week is over and the points are counted. A new week has begun.', '📜 Неделя закончилась, очки подсчитаны. Началась новая неделя.'],
  storage_full: ['📦 Your storage is full and the buildings have stopped. Come and collect.', '📦 Склад полон, здания остановились. Загляни собрать.'],
  week_ending: ['⏳ The week ends soon. You have {points} points this week.', '⏳ Неделя скоро закончится. У тебя {points} очков за неделю.'],
} satisfies Record<string, [string, string]>;

function t(lang: Lang, key: keyof typeof TEXT, vars: Record<string, string | number> = {}): string {
  let s: string = TEXT[key][lang === 'ru' ? 1 : 0];
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

const langOf = (code?: string): Lang => (code === 'ru' ? 'ru' : 'en');
const REF = /^ref_i[0-9a-f]{10}$/;

/** Turns one player's notices into one message. */
export function noticeText(n: Notice): string {
  const lines: string[] = [];
  for (const { kind, data } of n.items.slice(0, 6)) {
    if (kind === 'caravan_in') lines.push(t(n.lang, 'caravan_in', { from: data.from, n: data.delivered, res: res(n.lang, data.res) }));
    if (kind === 'caravan_back') {
      const vars = { to: data.to, n: data.delivered, res: res(n.lang, data.res), credits: data.credits };
      let line = t(n.lang, data.credits > 0 ? 'caravan_back' : 'caravan_gift', vars);
      if (data.lost > 0) line += ' ' + t(n.lang, data.event === 'storm' ? 'storm' : 'pirates', { lost: `${data.lost} ${res(n.lang, data.res)}` });
      if (data.level) line += ' ' + t(n.lang, 'level', { level: data.level });
      lines.push(line);
    }
    if (kind === 'epoch_closed') lines.push(t(n.lang, 'epoch_closed'));
    if (kind === 'storage_full') lines.push(t(n.lang, 'storage_full'));
    if (kind === 'week_ending') lines.push(t(n.lang, 'week_ending', { points: data.points }));
  }
  return lines.join('\n');
}

export function botSecret(token: string): string {
  return createHash('sha256').update(`knights-isle:${token}`).digest('hex').slice(0, 48);
}

export function createBot(world: World, cfg: Config, opts: { botInfo?: UserFromGetMe } = {}) {
  const bot = new Bot(cfg.botToken, opts.botInfo ? { botInfo: opts.botInfo } : undefined);
  const https = cfg.webAppUrl.startsWith('https://');

  const playButton = (lang: Lang, ref?: string) => {
    if (!https) return undefined;
    const url = new URL(cfg.webAppUrl);
    if (ref) url.searchParams.set('ref', ref);
    return new InlineKeyboard().webApp(t(lang, 'play'), url.toString());
  };

  bot.command('start', async (ctx) => {
    const lang = langOf(ctx.from?.language_code);
    const name = ctx.from?.first_name ?? '';
    const payload = ctx.match.trim();
    const ref = REF.test(payload) ? payload : undefined;
    const known = ctx.from ? await world.act(async (w) => !!(await world.byTg(w, String(ctx.from!.id)))) : false;
    let text = t(lang, known ? 'back' : 'hello', { name });
    if (ref && !known) text += `\n\n${t(lang, 'invited')}`;
    if (!https) text += `\n\n${t(lang, 'noApp')}`;
    await ctx.reply(text, { reply_markup: playButton(lang, known ? undefined : ref) });
  });

  bot.command('help', async (ctx) => {
    const lang = langOf(ctx.from?.language_code);
    await ctx.reply(t(lang, 'help'), { reply_markup: playButton(lang) });
  });

  // Anything else: just offer the island.
  bot.on('message', async (ctx) => {
    const lang = langOf(ctx.from?.language_code);
    await ctx.reply(t(lang, 'help'), { reply_markup: playButton(lang) });
  });

  bot.catch((err) => console.warn('bot:', err.message));

  /** Sends what world.notices() collected. Returns how many messages went out. */
  const notify = async (): Promise<number> => {
    const notices = await world.act((w) => world.notices(w));
    let sent = 0;
    for (const n of notices) {
      const text = noticeText(n);
      if (!text) continue;
      try {
        await bot.api.sendMessage(n.tgId, text, { reply_markup: playButton(n.lang) });
        sent++;
      } catch (e) {
        if (e instanceof GrammyError && e.error_code === 403) await world.markBlocked(n.tgId);
        else console.warn('bot: notify failed:', (e as Error).message);
      }
    }
    return sent;
  };

  /** Puts the island in the chat's menu button. */
  const setup = async () => {
    if (!https) return;
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: t('en', 'menu'), web_app: { url: cfg.webAppUrl } } });
    await bot.api.setMyCommands([{ command: 'start', description: 'Open your island' }, { command: 'help', description: 'How to play' }]);
    await bot.api.setMyCommands([{ command: 'start', description: 'Открыть остров' }, { command: 'help', description: 'Как играть' }], { language_code: 'ru' });
  };

  return { bot, notify, setup };
}
