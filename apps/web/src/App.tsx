import { useEffect, useRef, useState } from 'react';
import { BASIC, RARE, RARE_OF, type Res } from '@isle/core';
import { tg, type GameEvent } from './api.ts';
import { ResIcon, TabIcon } from './art/Icons.tsx';
import { knightLine, makeT, num, resName, type Lang } from './i18n.ts';
import { useGame } from './store.ts';
import { BoardTab } from './views/BoardTab.tsx';
import { HuntTab } from './views/HuntTab.tsx';
import { IslandTab } from './views/IslandTab.tsx';
import { QuestsTab } from './views/QuestsTab.tsx';
import { Start } from './views/Start.tsx';
import { WorldTab } from './views/WorldTab.tsx';

const TABS = ['island', 'board', 'hunt', 'world', 'quests'] as const;
type Tab = (typeof TABS)[number];

/** Turns server events into what the knight says about them. */
function lineFor(lang: Lang, e: GameEvent): string | null {
  const d = e.data;
  switch (e.kind) {
    case 'welcome': return knightLine(lang, 'welcome');
    case 'caravan_back':
      if (d.level) return knightLine(lang, 'level', { n: d.level });
      return knightLine(lang, d.event === 'pirates' ? 'pirates' : d.event === 'storm' ? 'storm' : 'caravan_back');
    case 'caravan_in': return knightLine(lang, 'caravan_in', { from: d.from, n: `${d.delivered} ${resName(lang, d.res).toLowerCase()}` });
    case 'epoch_closed': return knightLine(lang, 'epoch');
    default: return null;
  }
}

export function App() {
  const game = useGame();
  const { state, need, lang } = game;
  const t = makeT(lang);
  const [tab, setTab] = useState<Tab>('island');
  const [speech, setSpeech] = useState<string | null>(null);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  const seen = useRef(0);

  /** The knight says a line; lines wait their turn so none is lost. */
  const speak = (text: string) => {
    queue.current.push(text);
    if (busy.current) return;
    busy.current = true;
    const next = () => {
      const line = queue.current.shift();
      if (!line) {
        busy.current = false;
        setSpeech(null);
        return;
      }
      setSpeech(line);
      window.setTimeout(next, 3200);
    };
    next();
  };

  useEffect(() => {
    if (!state) return;
    for (const e of state.events) {
      if (e.id <= seen.current) continue;
      seen.current = e.id;
      const line = lineFor(lang, e);
      if (line) speak(line);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.events]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  if (game.loading) return <div className="splash"><div className="splash-title">Knight's Isle</div></div>;
  if (need) return <Start game={game} />;
  if (!state) return <div className="splash"><div className="splash-title">Knight's Isle</div><p>{game.toast ?? t('err.auth')}</p><button className="btn" onClick={() => void game.refresh()}>{t('ok')}</button></div>;

  const own = RARE_OF[state.island.biome];
  const rares = [own, ...RARE.filter((r) => r !== own)];
  const pick = (next: Tab) => {
    setTab(next);
    tg()?.HapticFeedback?.selectionChanged?.();
  };

  return (
    <div className={`app biome-${state.island.biome}`}>
      <header className="bar">
        <div className="bar-row">
          {BASIC.map((r) => <Chip key={r} res={r} n={state.island.res[r]} lang={lang} />)}
        </div>
        <div className="bar-row rare">
          {rares.map((r) => <Chip key={r} res={r} n={state.island.res[r]} lang={lang} own={r === own} />)}
        </div>
      </header>

      <main className="view">
        {tab === 'island' && <IslandTab game={game} state={state} speech={speech} speak={speak} goBoard={() => pick('board')} goQuests={() => pick('quests')} />}
        {tab === 'board' && <BoardTab game={game} state={state} speak={speak} />}
        {tab === 'hunt' && <HuntTab game={game} state={state} speak={speak} />}
        {tab === 'world' && <WorldTab game={game} state={state} />}
        {tab === 'quests' && <QuestsTab game={game} state={state} />}
      </main>

      <nav className="tabs">
        {TABS.map((id) => {
          const dot = (id === 'board' && state.caravans.some((c) => c.status === 'travel')) || (id === 'quests' && state.daily.available) || (id === 'hunt' && state.hunt.left > 0 && state.island.hunt.digs === 0);
          return (
            <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => pick(id)}>
              <TabIcon name={id} />
              <span>{t(`tab.${id}`)}</span>
              {dot && <i className="dot" />}
            </button>
          );
        })}
      </nav>

      {game.toast && <div className="toast">{game.toast}</div>}
    </div>
  );
}

function Chip({ res, n, lang, own }: { res: Res; n: number; lang: Lang; own?: boolean }) {
  return (
    <div className={`chip ${own ? 'own' : ''}`} title={resName(lang, res)}>
      <ResIcon res={res} size={18} />
      <b>{num(n)}</b>
    </div>
  );
}
