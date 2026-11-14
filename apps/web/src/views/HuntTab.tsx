import { useState } from 'react';
import { EGGS, HUNT_GRID, HUNT_TILES, type Egg } from '@isle/core';
import { tg, type State } from '../api.ts';
import { EggIcon, ResIcon } from '../art/Icons.tsx';
import { eggName, eggText, knightLine, makeT, num } from '../i18n.ts';
import type { Game } from '../store.ts';

export function HuntTab({ game, state, speak }: { game: Game; state: State; speak: (s: string) => void }) {
  const { lang } = game;
  const t = makeT(lang);
  const { island, hunt } = state;
  const [hint, setHint] = useState<{ day: number; text: string } | null>(null);
  const [egg, setEgg] = useState<Egg | null>(null);
  const opened = new Set(island.hunt.opened);
  const hits = new Map(hunt.hits.map((h) => [h.tile, h]));

  const dig = async (tile: number) => {
    if (opened.has(tile) || hunt.left <= 0) return;
    const out = await game.act<{ found: { res: string; amount: number; egg: Egg | null } | null; hint: number | null; left: number }>('/hunt/dig', { tile });
    if (!out) return;
    if (out.found) {
      tg()?.HapticFeedback?.notificationOccurred?.('success');
      speak(knightLine(lang, out.found.egg ? 'egg' : 'treasure'));
      if (out.found.egg) setEgg(out.found.egg);
    } else tg()?.HapticFeedback?.impactOccurred?.('light');
    setHint({ day: island.hunt.day, text: out.hint === null ? t('hunt.none') : out.found ? t('hunt.hint', { n: out.hint }) : `${t('hunt.empty')}. ${t('hunt.hint', { n: out.hint })}` });
  };

  return (
    <div className="page">
      <section className="card">
        <h3><i className="h-ico">🗺️</i>{t('hunt.title')}</h3>
        <p className="muted">{t('hunt.left', { n: hunt.left })}</p>
        <div className={`hunt-grid biome-${island.biome}`} style={{ gridTemplateColumns: `repeat(${HUNT_GRID}, 1fr)` }}>
          {Array.from({ length: HUNT_TILES }, (_, tile) => {
            const hit = hits.get(tile);
            const isOpen = opened.has(tile);
            return (
              <button key={tile} className={`tile ${isOpen ? 'open' : ''} ${hit ? 'hit' : ''}`} disabled={isOpen || hunt.left <= 0} onClick={() => void dig(tile)}>
                {hit ? (hit.egg ? <EggIcon egg={hit.egg} found size={30} /> : <><ResIcon res={hit.res} size={20} /><small>+{num(hit.amount)}</small></>) : isOpen ? '·' : ''}
              </button>
            );
          })}
        </div>
        {hint && hint.day === island.hunt.day && <p className="hint-line">{hint.text}</p>}
      </section>

      <section className="card">
        <h3><i className="h-ico">🏺</i>{t('hunt.shelf')} · {island.eggs.length}/{EGGS.length}</h3>
        <div className="shelf">
          {EGGS.map((e) => {
            const found = island.eggs.includes(e);
            return (
              <button key={e} className="egg" disabled={!found} onClick={() => setEgg(e)}>
                <EggIcon egg={e} found={found} />
                <small>{found ? eggName(lang, e) : '???'}</small>
              </button>
            );
          })}
        </div>
      </section>

      {egg && (
        <div className="sheet-wrap" onClick={() => setEgg(null)}>
          <div className="sheet center" onClick={(e) => e.stopPropagation()}>
            <EggIcon egg={egg} found size={84} />
            <h2>{eggName(lang, egg)}</h2>
            <p className="muted">{eggText(lang, egg)}</p>
            <button className="btn big" onClick={() => setEgg(null)}>{t('ok')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
