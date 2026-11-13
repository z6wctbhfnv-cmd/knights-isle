import { useState } from 'react';
import { BIOMES, RARE_OF, START_LEVELS, type Biome } from '@isle/core';
import { ResIcon } from '../art/Icons.tsx';
import { IslandArt } from '../art/Island.tsx';
import { Chan } from '../art/Knight.tsx';
import { biomeBonus, biomeName, makeT, resName } from '../i18n.ts';
import type { Game } from '../store.ts';

/** First screen: Chan greets the player and they pick a biome. */
export function Start({ game }: { game: Game }) {
  const t = makeT(game.lang);
  const [biome, setBiome] = useState<Biome>('forest');
  const [busy, setBusy] = useState(false);
  return (
    <div className={`app start biome-${biome}`}>
      <h1 className="start-title">{t('start.title')}</h1>
      <div className="narrator">
        <Chan />
        <p>{t('start.hello')}</p>
      </div>
      <div className="stage small">
        <IslandArt biome={biome} levels={START_LEVELS} />
      </div>
      <div className="biomes">
        {BIOMES.map((b) => (
          <button key={b} className={`biome-card ${b === biome ? 'on' : ''}`} onClick={() => setBiome(b)}>
            <b>{biomeName(game.lang, b)}</b>
            <span>{biomeBonus(game.lang, b)}</span>
            <span className="biome-rare"><ResIcon res={RARE_OF[b]} size={16} /> {t('start.rare')}: {resName(game.lang, RARE_OF[b]).toLowerCase()}</span>
          </button>
        ))}
      </div>
      <button
        className="btn big"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await game.start(biome);
          setBusy(false);
        }}
      >
        {t('start.go')}
      </button>
      {game.toast && <div className="toast">{game.toast}</div>}
    </div>
  );
}
