import { useEffect, useState } from 'react';
import { knightLevel } from '@isle/core';
import { api, tg, type IslandCard, type State, type Top, type Visit } from '../api.ts';
import { IslandArt } from '../art/Island.tsx';
import { Knight } from '../art/Knight.tsx';
import { biomeName, makeT } from '../i18n.ts';
import type { Game } from '../store.ts';

const BOT = import.meta.env.VITE_BOT_USERNAME as string | undefined;

export function WorldTab({ game, state }: { game: Game; state: State }) {
  const { lang } = game;
  const t = makeT(lang);
  const [islands, setIslands] = useState<IslandCard[] | null>(null);
  const [top, setTop] = useState<Top | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [name, setName] = useState('');

  const load = async () => {
    try {
      const [a, b] = await Promise.all([api<{ result: IslandCard[] }>('/islands'), api<{ result: Top }>('/top')]);
      setIslands(a.result);
      setTop(b.result);
    } catch {
      /* the next visit to the tab retries */
    }
  };
  useEffect(() => {
    void load();
  }, [state.me.archipelago?.id]);

  const open = async (id: string) => {
    const v = await game.act<Visit>('/visit', { id });
    if (v) setVisit(v);
  };
  const like = async () => {
    if (!visit) return;
    const r = await game.act<{ liked: boolean }>('/like', { id: visit.id });
    if (r) {
      setVisit({ ...visit, liked: true, likes: visit.likes + (r.liked ? 1 : 0) });
      tg()?.HapticFeedback?.impactOccurred?.('medium');
    }
  };
  const arch = async (path: string, body: unknown) => {
    if (await game.act(path, body)) void load();
  };
  const invite = () => {
    // ?start= opens the bot, whose button carries the invite into the Mini App.
    const link = BOT ? `https://t.me/${BOT}?start=ref_${state.me.id}` : `${location.origin}/?ref=ref_${state.me.id}`;
    if (BOT && tg()?.openTelegramLink) tg().openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}`);
    else void navigator.clipboard?.writeText(link).then(() => game.say(t('world.copied')));
  };

  const mine = state.me.archipelago;

  return (
    <div className="page">
      <section className="card">
        <h3>{t('world.islands')}</h3>
        <div className="islands">
          {(islands ?? []).map((i) => (
            <button key={i.id} className={`island-card biome-${i.biome}`} onClick={() => void open(i.id)}>
              <b>{i.name}</b>
              <small>{biomeName(lang, i.biome)} · {t('lv')} {i.level}</small>
              <small>♥ {i.likes}{i.npc ? ` · ${t('resident')}` : ''}{i.sameArchipelago ? ' · ★' : ''}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>{t('world.arch')}{mine ? `: ${mine.name}` : ''}</h3>
        <p className="muted">{t('world.archHint')}</p>
        {(top?.archipelagos ?? []).map((a, i) => (
          <div key={a.id} className="row">
            <span>{i + 1}. <b>{a.name}</b> <small>· {a.members} {t('world.members')} · {a.points}</small></span>
            {mine?.id === a.id ? (
              <button className="btn small ghost" onClick={() => void arch('/archipelago/leave', {})}>{t('world.leave')}</button>
            ) : !mine ? (
              <button className="btn small" onClick={() => void arch('/archipelago/join', { id: a.id })}>{t('world.join')}</button>
            ) : null}
          </div>
        ))}
        {!mine && (
          <div className="row">
            <input className="input" value={name} maxLength={24} placeholder={t('world.archName')} onChange={(e) => setName(e.target.value)} />
            <button className="btn small" disabled={name.trim().length < 3} onClick={() => void arch('/archipelago/create', { name }).then(() => setName(''))}>{t('world.create')}</button>
          </div>
        )}
      </section>

      <section className="card">
        <h3>{t('world.top')}</h3>
        {top && top.players.length === 0 && <p className="muted">{t('world.noTop')}</p>}
        {(top?.players ?? []).map((p, i) => (
          <div key={p.id} className={`row ${p.id === state.me.id ? 'me' : ''}`}>
            <span>{i + 1}. <b>{p.name}</b>{p.id === state.me.id ? ` (${t('you')})` : ''}</span>
            <b>{p.points}</b>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>{t('world.invite')}</h3>
        <p className="muted">{t('world.inviteHint')}</p>
        <div className="row">
          <span>{t('world.refXp')}: <b>{state.me.refXp}</b></span>
          <button className="btn small" onClick={invite}>{t('world.invite')}</button>
        </div>
      </section>

      {visit && (
        <div className="sheet-wrap" onClick={() => setVisit(null)}>
          <div className={`sheet visit biome-${visit.biome}`} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">
              <h2>{visit.name}</h2>
              <span className="pill">{t('lv')} {visit.level}</span>
            </div>
            <p className="muted">{biomeName(lang, visit.biome)}{visit.npc ? ` · ${t('resident')}` : ''} · {t('world.knight')} {knightLevel(visit.knightDeliveries)} · {t('world.rep')} {visit.reputation}</p>
            <div className="stage small">
              <IslandArt biome={visit.biome} levels={visit.levels} />
              <div className="knight-spot"><Knight size={38} /></div>
            </div>
            <div className="row">
              <span>♥ {visit.likes}</span>
              <button className="btn" disabled={visit.liked} onClick={() => void like()}>{visit.liked ? t('world.liked') : t('world.like')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
