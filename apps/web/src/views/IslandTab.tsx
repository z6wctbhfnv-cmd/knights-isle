import { useState } from 'react';
import {
  BUILDINGS, FUN_BONUS_PER_LEVEL, MAX_LEVEL, PRODUCERS, RESOURCES, STORAGE_HOURS, caravanCapacity, caravanSlots, isFull,
  islandLevel, knightLevel, missing, pending, productOf, ratePerHour, upgradeBlock, upgradeCost,
  type Building, type Cost, type Island, type Producer, type Res,
} from '@isle/core';
import { tg, type State } from '../api.ts';
import { ResIcon } from '../art/Icons.tsx';
import { IslandArt } from '../art/Island.tsx';
import { Chan, Knight } from '../art/Knight.tsx';
import { buildingAbout, buildingName, duration, knightLine, makeT, num, resName, type Lang, type T } from '../i18n.ts';
import { DailyModal, Floaters } from './Daily.tsx';
import { useTick, type Game } from '../store.ts';

const isProducer = (b: Building): b is Producer => (PRODUCERS as readonly string[]).includes(b);

export function CostRow({ cost, island, lang }: { cost: Cost; island: Island; lang: Lang }) {
  const lack = missing(island, cost);
  return (
    <div className="cost">
      {RESOURCES.filter((r) => cost[r]).map((r) => (
        <span key={r} className={`cost-item ${lack[r] ? 'lack' : ''}`} title={resName(lang, r)}>
          <ResIcon res={r} size={16} /> {num(cost[r]!)}
        </span>
      ))}
    </div>
  );
}

/** What the building does at a given level, in one line. */
function effect(t: T, lang: Lang, island: Island, b: Building, level: number): React.ReactNode {
  if (level <= 0) return '—';
  if (isProducer(b)) {
    const r = productOf(island, b);
    return <><ResIcon res={r} size={15} /> {num(ratePerHour(island, b, level))}{t('perHour')}</>;
  }
  if (b === 'storage') return t('storageHolds', { h: STORAGE_HOURS[level - 1] });
  if (b === 'lab') return t('fx.lab', { n: Math.min(MAX_LEVEL, level + 1) });
  if (b === 'fun') return t('fx.fun', { n: Math.round(level * FUN_BONUS_PER_LEVEL * 100) });
  return t('fx.harbor', { n: caravanCapacity(level), s: caravanSlots(level) });
}

export function IslandTab({ game, state, speech, speak, goBoard, goQuests }: { game: Game; state: State; speech: string | null; speak: (s: string) => void; goBoard: () => void; goQuests: () => void }) {
  useTick(state.speed > 1 ? 400 : 1000);
  const { lang } = game;
  const t = makeT(lang);
  const { island } = state;
  const now = game.now();
  const [open, setOpen] = useState<Building | null>(null);
  const [floaters, setFloaters] = useState<{ id: number; reward: Partial<Record<Res, number>> }[]>([]);
  // The gift pops up by itself once per day and session.
  const [giftOpen, setGiftOpen] = useState(() => {
    if (!state.daily.available) return false;
    const key = `isle-gift-${state.me.id}-${Math.floor(state.now / 86_400_000)}`;
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, '1');
    } catch { /* private mode */ }
    return true;
  });
  const float = (reward: Partial<Record<Res, number>>) => {
    const id = Date.now() + Math.random();
    setFloaters((f) => [...f, { id, reward }]);
    window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1600);
  };

  const ready: Partial<Record<Producer, 'some' | 'full'>> = {};
  let anyReady = false;
  let anyFull = false;
  for (const b of PRODUCERS) {
    if (island.levels[b] <= 0) continue;
    const full = isFull(island, b, now);
    if (pending(island, b, now) >= 1) {
      ready[b] = full ? 'full' : 'some';
      anyReady = true;
    }
    anyFull ||= full;
  }
  const canUp: Partial<Record<Building, boolean>> = {};
  for (const b of BUILDINGS) canUp[b] = upgradeBlock(island, b) === null;
  const away = state.caravans.filter((c) => c.status === 'travel' && c.from === state.me.id).length;
  const balloon = away < caravanSlots(island.levels.harbor);
  const sumLevels = BUILDINGS.reduce((sum, b) => sum + island.levels[b], 0);
  const mineTravelling = state.caravans.filter((c) => c.status === 'travel' && (c.from === state.me.id || c.to === state.me.id));
  const nextArrival = mineTravelling.length ? Math.max(0, Math.min(...mineTravelling.map((c) => c.arriveAt)) - now) : null;

  const collect = async (b?: Producer) => {
    const got = await game.act<Partial<Record<Res, number>>>('/collect', b ? { building: b } : {});
    if (got && Object.keys(got).length) {
      tg()?.HapticFeedback?.impactOccurred?.('light');
      float(got);
      if (Math.random() < 0.4) speak(knightLine(lang, 'collect'));
    }
  };

  const upgrade = async (b: Building) => {
    const was = island.levels[b];
    const out = await game.act('/upgrade', { building: b });
    if (out) {
      tg()?.HapticFeedback?.notificationOccurred?.('success');
      speak(knightLine(lang, was === 0 ? 'build' : 'upgrade'));
      setOpen(null);
    }
  };

  // Chan's hint: the next sensible step for a new island.
  const hint =
    island.levels.lab === 0 ? ['Build the Research Lab: it lets every other building grow.', 'Построй Лабораторию: она открывает уровни всем зданиям.']
    : island.levels.house === 0 ? ['Build a House. Your islanders will gather a rare resource only this island has.', 'Построй Дом. Жители начнут добывать редкий ресурс, который есть только на твоём острове.']
    : island.levels.harbor === 0 ? ['Build the Sky Harbor, and your knight will lead caravans to the neighbours.', 'Построй Небесный порт, и рыцарь поведёт караваны к соседям.']
    : island.knight.deliveries === 0 && away === 0 ? ['Neighbours are asking for help. Open Caravans and send your first one.', 'Соседи просят о помощи. Открой «Караваны» и отправь первый.']
    : null;

  return (
    <div className="island-tab">
      <div className="player-card">
        <div className="avatar"><Knight size={34} /></div>
        <div className="player-main">
          <b>{state.me.name}</b>
          <div className="lvl-bar"><i style={{ width: `${(sumLevels % 8) / 8 * 100}%` }} /></div>
          <small>{t('me.island', { n: islandLevel(island) })} · {sumLevels % 8}/8 → {islandLevel(island) + 1}</small>
        </div>
        <div className="player-chips">
          <span className="chip-mini">🛡 {knightLevel(island.knight.deliveries)}</span>
          <span className="chip-mini">⭐ {state.me.points}</span>
          {state.speed > 1 && <span className="speed-badge">×{state.speed}</span>}
        </div>
      </div>

      <div className="stage">
        <IslandArt biome={island.biome} levels={island.levels} ready={ready} canUp={canUp} balloon={balloon} onTap={setOpen} onCollect={(b) => void collect(b)} />
        <button
          className="knight-spot"
          onClick={() => {
            speak(knightLine(lang, anyFull ? 'full' : 'idle'));
            void game.act('/knight/talk');
          }}
          aria-label="knight"
        >
          <Knight size={46} />
        </button>
        {speech && <div className="speech">{speech}</div>}
        <Floaters items={floaters} />
      </div>

      {anyReady && (
        <button className={`btn collect-all ${anyFull ? 'pulse' : ''}`} onClick={() => void collect()}>
          {anyFull ? t('full') + ' · ' : ''}{t('collectAll')}
        </button>
      )}

      <div className="today">
        <button className={`today-tile ${state.daily.available ? 'hot' : ''}`} onClick={() => setGiftOpen(true)}>
          <span className="today-icon">🎁</span>
          <b>{t('today.gift')}</b>
          <small>{state.daily.available ? t('today.giftReady') : t('today.giftDone')}</small>
        </button>
        <button className="today-tile" onClick={goQuests}>
          <span className="today-icon">📜</span>
          <b>{t('today.quests')}</b>
          <small>{island.quests.done.length}/6</small>
        </button>
        <button className="today-tile" onClick={goBoard}>
          <span className="today-icon">🎈</span>
          <b>{t('today.caravan')}</b>
          <small>{island.levels.harbor === 0 ? t('today.harbor') : nextArrival !== null ? duration(lang, nextArrival / state.speed) : t('today.caravanIdle')}</small>
        </button>
      </div>

      {hint && (
        <button className="narrator hint" onClick={island.levels.harbor > 0 ? goBoard : undefined}>
          <Chan size={40} />
          <p>{hint[lang === 'ru' ? 1 : 0]}</p>
        </button>
      )}

      {giftOpen && <DailyModal game={game} state={state} speak={speak} onClose={() => setGiftOpen(false)} />}

      {open && (
        <div className="sheet-wrap" onClick={() => setOpen(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <BuildingSheet b={open} island={island} now={now} lang={lang} t={t} onCollect={() => void collect(open as Producer)} onUpgrade={() => void upgrade(open)} />
          </div>
        </div>
      )}
    </div>
  );
}

function BuildingSheet({ b, island, now, lang, t, onCollect, onUpgrade }: { b: Building; island: Island; now: number; lang: Lang; t: T; onCollect: () => void; onUpgrade: () => void }) {
  const level = island.levels[b];
  const block = upgradeBlock(island, b);
  const cost = level < MAX_LEVEL ? upgradeCost(island.biome, b, level + 1) : null;
  const have = isProducer(b) && level > 0 ? Math.floor(pending(island, b, now)) : 0;
  return (
    <>
      <div className="sheet-title">
        <h2>{buildingName(lang, b)}</h2>
        {level > 0 && <span className="pill">{t('lv')} {level}</span>}
      </div>
      <p className="muted">{buildingAbout(lang, b)}</p>

      <div className="fx">
        <div><small>{t('now')}</small><div>{level > 0 ? effect(t, lang, island, b, level) : b === 'harbor' ? t('fx.harbor0') : '—'}</div></div>
        {level < MAX_LEVEL && <div><small>{t('next')}</small><div className="good">{effect(t, lang, island, b, level + 1)}</div></div>}
      </div>

      {isProducer(b) && level > 0 && (
        <div className="row">
          <span className="muted"><ResIcon res={productOf(island, b)} size={16} /> {num(have)} {isFull(island, b, now) ? `· ${t('full').toLowerCase()}` : ''}</span>
          <button className="btn small ghost" disabled={have < 1} onClick={onCollect}>{t('collect')}</button>
        </div>
      )}

      {cost ? (
        <>
          <CostRow cost={cost} island={island} lang={lang} />
          <button className="btn big" disabled={block !== null} onClick={onUpgrade}>
            {level === 0 ? t('build') : t('upgrade')}
          </button>
          {block === 'lab' && <p className="warn">{t('needLab')}</p>}
          {block === 'resources' && <p className="warn">{t('missing')}: {Object.entries(missing(island, cost)).map(([r, n]) => `${num(n!)} ${resName(lang, r as Res).toLowerCase()}`).join(', ')}</p>}
        </>
      ) : (
        <p className="pill wide">{t('max')}</p>
      )}
    </>
  );
}
