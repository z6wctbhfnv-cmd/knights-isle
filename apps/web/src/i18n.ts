import type { Biome, Building, Egg, Quest, Res } from '@isle/core';

export type Lang = 'en' | 'ru';
type Pair = [en: string, ru: string];

const D = {
  // tabs
  'tab.island': ['Island', 'Остров'],
  'tab.board': ['Caravans', 'Караваны'],
  'tab.hunt': ['Treasure', 'Клад'],
  'tab.world': ['World', 'Мир'],
  'tab.quests': ['Quests', 'Задания'],
  // start
  'start.title': ["Knight's Isle", "Knight's Isle"],
  'start.hello': ['Hi! I am Chan. A flying island is waiting for you, and a little knight comes with it. Pick where it floats.', 'Привет! Я Чан. Тебя ждёт летающий остров, а с ним маленький рыцарь. Выбери, где он парит.'],
  'start.go': ['Take this island', 'Беру этот остров'],
  'start.rare': ['Only here', 'Только здесь'],
  // common
  'lv': ['Lv', 'Ур'],
  'perHour': ['/h', '/ч'],
  'collect': ['Collect', 'Собрать'],
  'collectAll': ['Collect all', 'Собрать всё'],
  'build': ['Build', 'Построить'],
  'upgrade': ['Upgrade', 'Улучшить'],
  'close': ['Close', 'Закрыть'],
  'max': ['Top level', 'Максимум'],
  'needLab': ['Raise the Research Lab first', 'Сначала улучши Лабораторию'],
  'missing': ['Not enough', 'Не хватает'],
  'now': ['Now', 'Сейчас'],
  'next': ['Next', 'Дальше'],
  'full': ['Storage is full', 'Склад полон'],
  'storageHolds': ['Holds {h} h of output', 'Вмещает {h} ч выработки'],
  'send': ['Send', 'Отправить'],
  'cancel': ['Cancel', 'Отменить'],
  'you': ['you', 'ты'],
  'resident': ['resident', 'житель'],
  'ok': ['OK', 'Ок'],
  // building effects
  'fx.lab': ['Other buildings can grow up to level {n}', 'Остальные здания растут до уровня {n}'],
  'fx.fun': ['+{n}% to quest and treasure rewards', '+{n}% к наградам заданий и кладов'],
  'fx.harbor': ['{n} cargo per caravan, {s} at once', '{n} груза в караване, одновременно {s}'],
  'fx.harbor0': ['Lets your knight lead caravans', 'Рыцарь сможет водить караваны'],
  // board
  'board.mine': ['Your caravans', 'Твои караваны'],
  'board.none': ['No caravans on the road', 'Караванов в пути нет'],
  'board.requests': ['Neighbours ask for help', 'Соседи просят помочь'],
  'board.noRequests': ['Nobody needs anything right now', 'Сейчас никому ничего не нужно'],
  'board.needs': ['needs', 'нужно'],
  'board.ask': ['Ask neighbours', 'Попросить у соседей'],
  'board.askHint': ['Post what you lack. Anyone can send a caravan and earn reputation.', 'Напиши, чего не хватает. Любой может прислать караван и получить репутацию.'],
  'board.post': ['Post request', 'Выставить просьбу'],
  'board.noHarbor': ['Build a Harbor to send caravans', 'Построй Порт, чтобы отправлять караваны'],
  'board.noCargo': ['You do not have this resource', 'У тебя нет этого ресурса'],
  'board.busy': ['All caravans are on the road', 'Все караваны в пути'],
  'board.onWay': ['on the way', 'в пути'],
  'board.arrives': ['arrives in', 'прибудет через'],
  'board.toYou': ['to you', 'к тебе'],
  'board.delivered': ['delivered', 'доставлено'],
  'board.lost': ['lost', 'потеряно'],
  'board.reward': ['20 credits and 1 reputation per unit', '20 кредитов и 1 репутация за единицу'],
  'trader.title': ['Wandering trader', 'Залётный торговец'],
  'trader.hint': ['His prices follow his shelves: what is scarce costs more.', 'Цены зависят от его полок: чего мало, то дороже.'],
  'trader.buy': ['Buy 10', 'Купить 10'],
  'trader.sell': ['Sell 10', 'Продать 10'],
  'trader.scarce': ['almost gone', 'почти нет'],
  'trader.normal': ['in stock', 'есть'],
  'trader.plenty': ['plenty', 'много'],
  // hunt
  'hunt.title': ['Treasure hunt', 'Охота за кладом'],
  'hunt.left': ['Digs left today: {n}', 'Осталось копнуть сегодня: {n}'],
  'hunt.hint': ['Nearest treasure: {n} steps away', 'До ближайшего клада: {n} шаг.'],
  'hunt.none': ['All of today’s treasures are found', 'Все клады на сегодня найдены'],
  'hunt.empty': ['Nothing here', 'Здесь пусто'],
  'hunt.shelf': ['Curiosities', 'Диковинки'],
  // world
  'world.islands': ['Islands', 'Острова'],
  'world.visit': ['Visit', 'В гости'],
  'world.like': ['Like', 'Нравится'],
  'world.liked': ['Liked', 'Понравилось'],
  'world.top': ['Top of the week', 'Лучшие за неделю'],
  'world.noTop': ['No points yet this week', 'На этой неделе очков ещё нет'],
  'world.arch': ['Archipelago', 'Архипелаг'],
  'world.archHint': ['Islands band together. The best archipelago of the week gets a prize into its shared treasury.', 'Острова объединяются. Лучший архипелаг недели получает приз в общую казну.'],
  'world.archName': ['Name (latin letters)', 'Название (латиницей)'],
  'world.create': ['Found', 'Основать'],
  'world.join': ['Join', 'Вступить'],
  'world.leave': ['Leave', 'Выйти'],
  'world.members': ['islands', 'островов'],
  'world.invite': ['Invite a friend', 'Позвать друга'],
  'world.inviteHint': ['A friend lands in your archipelago. You get XP as they grow.', 'Друг попадёт в твой архипелаг. Ты получаешь XP за его успехи.'],
  'world.copied': ['Link copied', 'Ссылка скопирована'],
  'world.refXp': ['Friend XP', 'XP за друзей'],
  'world.knight': ['Knight level', 'Уровень рыцаря'],
  'world.rep': ['Reputation', 'Репутация'],
  // quests
  'quests.today': ['Today', 'Сегодня'],
  'daily.title': ['Daily reward', 'Награда дня'],
  'daily.day': ['Day {n}', 'День {n}'],
  'daily.chest': ['Chest', 'Сундук'],
  'daily.claim': ['Claim', 'Забрать'],
  'daily.got': ['Got it!', 'Получено!'],
  'daily.tomorrow': ['Come back tomorrow for day {n}', 'Завтра ждёт награда дня {n}'],
  'daily.rule': ['Come every day: the rewards grow, and day 7 is a chest. Miss a day and the calendar starts over.', 'Заходи каждый день: награды растут, на 7-й день сундук. Пропустишь день — календарь начнётся заново.'],
  'daily.later': ['Later', 'Позже'],
  'today.title': ['Today', 'Сегодня'],
  'today.gift': ['Gift', 'Подарок'],
  'today.giftReady': ['Ready!', 'Ждёт!'],
  'today.giftDone': ['Tomorrow', 'Завтра'],
  'today.quests': ['Quests', 'Задания'],
  'today.caravan': ['Caravan', 'Караван'],
  'today.caravanIdle': ['Send one', 'Отправь'],
  'today.harbor': ['Build a harbor', 'Нужен порт'],
  'me.points': ['{n} pts', '{n} очк.'],
  'me.island': ['Island level {n}', 'Остров, ур. {n}'],
  'quests.streak': ['Streak: {n} days', 'Серия: {n} дн.'],
  'quests.week': ['Week {w} of 4 · Season {s}', 'Неделя {w} из 4 · Сезон {s}'],
  'quests.points': ['Points this week', 'Очки за неделю'],
  'quests.ends': ['Week ends in', 'Неделя закончится через'],
  'quests.eligibleYes': ['You take part in the weekly rewards', 'Ты участвуешь в недельных наградах'],
  'quests.eligibleNo': ['Rewards open after 3 active days and island level 3', 'Награды откроются после 3 активных дней и 3-го уровня острова'],
  'quests.islandLevel': ['Island level', 'Уровень острова'],
  'quests.days': ['Active days', 'Активных дней'],
  'demo.title': ['Time machine (demo)', 'Машина времени (демо)'],
  'demo.hint': ['Speeds the whole world up so you can watch a week pass.', 'Ускоряет весь мир, чтобы увидеть, как проходит неделя.'],
  'demo.x1': ['Real time', 'Обычное время'],
  'demo.x60': ['Hour per minute', 'Час за минуту'],
  'demo.week': ['Week per minute', 'Неделя за минуту'],
  // errors
  'err.resources': ['Not enough resources', 'Не хватает ресурсов'],
  'err.slots': ['All caravans are on the road', 'Все караваны в пути'],
  'err.capacity': ['Too much for one caravan', 'Слишком много для одного каравана'],
  'err.request': ['This request is already covered', 'Эту просьбу уже закрывают'],
  'err.limit': ['You already have two open requests', 'У тебя уже две открытые просьбы'],
  'err.stock': ['The trader does not have that much', 'У торговца столько нет'],
  'err.taken': ['This name is taken', 'Это название занято'],
  'err.name': ['At least 3 latin letters or digits', 'Минимум 3 латинские буквы или цифры'],
  'err.full': ['This archipelago is full', 'В этом архипелаге нет мест'],
  'err.digs': ['No digs left today', 'На сегодня попытки кончились'],
  'err.auth': ['Open the game from Telegram', 'Открой игру из Telegram'],
  'err.any': ['Something went wrong', 'Что-то пошло не так'],
} satisfies Record<string, Pair>;

export type Key = keyof typeof D;

export function makeT(lang: Lang) {
  return (key: Key, vars?: Record<string, string | number>): string => {
    let s: string = D[key][lang === 'ru' ? 1 : 0];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}
export type T = ReturnType<typeof makeT>;

const pick = (lang: Lang, p: Pair) => p[lang === 'ru' ? 1 : 0];

const RES: Record<Res, Pair> = {
  energy: ['Energy', 'Энергия'], materials: ['Materials', 'Материалы'], credits: ['Credits', 'Кредиты'],
  ice: ['Ice', 'Лёд'], fruit: ['Fruit', 'Фрукты'], glass: ['Glass', 'Стекло'], wood: ['Timber', 'Древесина'],
};
export const resName = (lang: Lang, r: Res) => pick(lang, RES[r]);

const BUILDING: Record<Building, { name: Pair; about: Pair }> = {
  solar: { name: ['Solar Farm', 'Солнечная ферма'], about: ['Makes energy while you are away.', 'Даёт энергию, пока тебя нет.'] },
  factory: { name: ['Factory', 'Фабрика'], about: ['Makes building materials.', 'Делает стройматериалы.'] },
  datacenter: { name: ['Data Center', 'Дата-центр'], about: ['Earns credits.', 'Зарабатывает кредиты.'] },
  house: { name: ['House', 'Дом'], about: ['Islanders gather the rare resource of your biome.', 'Жители добывают редкий ресурс твоего биома.'] },
  storage: { name: ['Storage', 'Склад'], about: ['Buildings stop when it is full.', 'Когда он полон, здания встают.'] },
  lab: { name: ['Research Lab', 'Лаборатория'], about: ['Opens higher levels for every building.', 'Открывает новые уровни всем зданиям.'] },
  fun: { name: ['Fun Center', 'Центр развлечений'], about: ['Bigger rewards and more digs in the treasure hunt.', 'Больше наград и попыток в охоте за кладом.'] },
  harbor: { name: ['Sky Harbor', 'Небесный порт'], about: ['Caravans to neighbours leave from here.', 'Отсюда уходят караваны к соседям.'] },
};
export const buildingName = (lang: Lang, b: Building) => pick(lang, BUILDING[b].name);
export const buildingAbout = (lang: Lang, b: Building) => pick(lang, BUILDING[b].about);

const BIOME: Record<Biome, { name: Pair; bonus: Pair }> = {
  snow: { name: ['Snow Isle', 'Снежный остров'], bonus: ['+10% credits from Data Centers', '+10% кредитов от дата-центров'] },
  tropical: { name: ['Tropic Isle', 'Тропический остров'], bonus: ['+10% to quest and treasure rewards', '+10% к наградам заданий и кладов'] },
  desert: { name: ['Desert Isle', 'Пустынный остров'], bonus: ['+10% energy from Solar Farms', '+10% энергии от солнечных ферм'] },
  forest: { name: ['Forest Isle', 'Лесной остров'], bonus: ['+10% materials from Factories', '+10% материалов от фабрик'] },
};
export const biomeName = (lang: Lang, b: Biome) => pick(lang, BIOME[b].name);
export const biomeBonus = (lang: Lang, b: Biome) => pick(lang, BIOME[b].bonus);

const QUEST: Record<Quest, Pair> = {
  collect: ['Collect what your buildings made', 'Собери то, что накопили здания'],
  upgrade: ['Build or upgrade something', 'Построй или улучши здание'],
  caravan: ['Send a caravan', 'Отправь караван'],
  visit: ['Visit three islands', 'Побывай на трёх островах'],
  hunt: ['Dig for treasure', 'Поищи клад'],
  knight: ['Talk to your knight', 'Поговори с рыцарем'],
};
export const questName = (lang: Lang, q: Quest) => pick(lang, QUEST[q]);

// Collectibles are in-jokes for those who know. The texts never name any network or token.
const EGG: Record<Egg, { name: Pair; text: Pair }> = {
  yocto: { name: ['Yocto coin', 'Йокто-монетка'], text: ['The smallest coin in the world: one septillionth of a whole one. Do not sneeze.', 'Самая маленькая монета в мире: одна септиллионная от целой. Не чихай рядом.'] },
  nightshade: { name: ['Nightshade flower', 'Цветок паслёна'], text: ['It splits into shards, and every shard keeps growing on its own.', 'Раскалывается на осколки, и каждый осколок растёт сам по себе.'] },
  doomslug: { name: ['Doomslug', 'Слизень Судьбы'], text: ['Slow, but once it says "done", it is final.', 'Медленный, но если сказал «готово», значит, окончательно.'] },
  stakehouse: { name: ['House of Stake', 'Домик на колышках'], text: ['A tiny house standing on stakes. Everyone inside gets a vote.', 'Крошечный дом на колышках. У каждого внутри есть голос.'] },
  attention: { name: ['Old scroll', 'Старый свиток'], text: ['Eight signatures and one line: "Attention is all you need".', 'Восемь подписей и одна строка: «Attention is all you need».'] },
};
export const eggName = (lang: Lang, e: Egg) => pick(lang, EGG[e].name);
export const eggText = (lang: Lang, e: Egg) => pick(lang, EGG[e].text);

// The knight runs on scripts: a few lines per situation, picked at random.
const KNIGHT: Record<string, Pair[]> = {
  idle: [
    ['Quiet skies today. I checked.', 'Небо сегодня тихое. Я проверил.'],
    ['I polished my helmet. Twice.', 'Я начистил шлем. Дважды.'],
    ['Clouds counted: forty-one. Report complete.', 'Облаков насчитал сорок одно. Доклад окончен.'],
    ['If pirates come, I am ready. If they do not, also ready.', 'Придут пираты, я готов. Не придут, тоже готов.'],
    ['The neighbours wave from their islands. I wave back.', 'Соседи машут со своих островов. Я машу в ответ.'],
  ],
  welcome: [['Knight reporting for duty! This island is under my watch now.', 'Рыцарь на службу прибыл! Теперь остров под моей охраной.']],
  collect: [
    ['All counted and stored!', 'Всё сосчитано и уложено!'],
    ['Good haul. The island thanks you.', 'Хороший улов. Остров благодарит.'],
    ['Carried every crate myself. Almost.', 'Все ящики донёс сам. Почти.'],
  ],
  upgrade: [
    ['Look at that! It grew.', 'Гляди-ка, выросло!'],
    ['Our island looks more serious already.', 'Наш остров уже выглядит солиднее.'],
    ['Solid work. I approve as head of security.', 'Отличная работа. Одобряю как начальник охраны.'],
  ],
  build: [['A new building! I will guard it too.', 'Новое здание! Его я тоже буду охранять.']],
  full: [
    ['The storage is full. The buildings are waiting for you.', 'Склад полон. Здания стоят и ждут тебя.'],
    ['Nothing fits any more! Collect it, please.', 'Больше ничего не влезает! Собери, пожалуйста.'],
  ],
  poor: [
    ['Not enough yet. We wait, we save.', 'Пока не хватает. Ждём и копим.'],
    ['Our pockets are light. Patience.', 'В карманах негусто. Терпение.'],
  ],
  caravan_sent: [
    ['Cargo secured. I will bring it there safely!', 'Груз закреплён. Довезу в целости!'],
    ['Off we go. Keep the island warm for me.', 'Выступаем. Присмотри за островом.'],
  ],
  caravan_back: [
    ['Delivered! They were glad to see us.', 'Доставлено! Нам там были рады.'],
    ['Back home. Not a crate missing.', 'Я дома. Ни одного ящика не потерял.'],
  ],
  pirates: [
    ['Pirates! I fought them off, but they grabbed a few crates.', 'Пираты! Я отбился, но пару ящиков они утащили.'],
  ],
  storm: [
    ['A storm caught us. Some cargo went overboard.', 'Нас накрыл шторм. Часть груза унесло.'],
  ],
  caravan_in: [
    ['A caravan from {from}! They brought us {n}.', 'Караван от {from}! Привезли нам {n}.'],
  ],
  level: [['I feel stronger. Knight level {n}!', 'Чувствую себя сильнее. Уровень рыцаря {n}!']],
  quest: [['Task done. I wrote it in the log.', 'Задание выполнено. Записал в журнал.']],
  daily: [
    ['A gift for showing up! I knew you would.', 'Подарок за то, что пришёл! Я знал, что придёшь.'],
    ['Another day, another gift. I like this tradition.', 'Новый день, новый подарок. Мне нравится эта традиция.'],
  ],
  chest: [['The chest! Look how heavy it is.', 'Сундук! Смотри, какой тяжёлый.']],
  treasure: [['Treasure! I knew this island hides things.', 'Клад! Я знал, что остров что-то прячет.']],
  egg: [['What a strange thing. Let us keep it.', 'Какая странная штука. Давай оставим.']],
  epoch: [['A week has passed. The points are counted.', 'Неделя прошла. Очки подсчитаны.']],
  trade: [['A fair deal. I watched his hands.', 'Честная сделка. Я следил за его руками.']],
};

export function knightLine(lang: Lang, kind: string, vars?: Record<string, string | number>): string {
  const lines = KNIGHT[kind] ?? KNIGHT.idle;
  let s = pick(lang, lines[Math.floor(Math.random() * lines.length)]);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function duration(lang: Lang, ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const [D_, H, M, S] = lang === 'ru' ? ['д', 'ч', 'мин', 'с'] : ['d', 'h', 'min', 's'];
  if (d) return `${d} ${D_} ${h} ${H}`;
  if (h) return `${h} ${H} ${m} ${M}`;
  if (m) return `${m} ${M}`;
  return `${s % 60} ${S}`;
}

export function num(n: number): string {
  const v = Math.floor(n);
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(v);
}
