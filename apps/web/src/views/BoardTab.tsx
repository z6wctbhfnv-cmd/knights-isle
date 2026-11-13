import { useState } from 'react';
import { RARE, RARE_OF, caravanCapacity, caravanSlots, risk, knightLevel, type Rare } from '@isle/core';
import { tg, type BoardRequest, type State } from '../api.ts';
import { ResIcon } from '../art/Icons.tsx';
import { duration, knightLine, makeT, num, resName } from '../i18n.ts';
import { useTick, type Game } from '../store.ts';

export function BoardTab({ game, state, speak }: { game: Game; state: State; speak: (s: string) => void }) {
  useTick(state.speed > 1 ? 300 : 1000);
  const { lang } = game;
  const t = makeT(lang);
  const { island, me } = state;
  const now = game.now();
  const own = RARE_OF[island.biome];
  const foreign = RARE.filter((r) => r !== own);
  const [askRes, setAskRes] = useState<Rare>(foreign[0]);
  const [askAmount, setAskAmount] = useState(20);

  const harbor = island.levels.harbor;
  const capacity = caravanCapacity(harbor);
  const out = state.caravans.filter((c) => c.status === 'travel' && c.from === me.id).length;
  const free = caravanSlots(harbor) - out;
  const { chance, loss } = risk(knightLevel(island.knight.deliveries));

  const send = async (rq: BoardRequest) => {
    const left = rq.amount - rq.filled - rq.promised;
    const amount = Math.min(left, capacity, Math.floor(island.res[rq.res]));
    const ok = await game.act('/caravan', { requestId: rq.id, amount });
    if (ok) {
      tg()?.HapticFeedback?.notificationOccurred?.('success');
      speak(knightLine(lang, 'caravan_sent'));
    }
  };

  const trade = async (side: 'buy' | 'sell', res: Rare) => {
    const ok = await game.act('/trader', { side, res, amount: 10 });
    if (ok && Math.random() < 0.5) speak(knightLine(lang, 'trade'));
  };

  const travelling = state.caravans.filter((c) => c.status === 'travel');
  const done = state.caravans.filter((c) => c.status === 'done').slice(0, 4);
  const mine = state.requests.filter((r) => r.mine);
  const board = state.requests.filter((r) => !r.mine).sort((a, b) => Number(b.sameArchipelago) - Number(a.sameArchipelago));

  return (
    <div className="page">
      <section className="card">
        <h3>{t('board.mine')}</h3>
        {harbor === 0 ? (
          <p className="muted">{t('board.noHarbor')}</p>
        ) : (
          <p className="muted">
            {t('fx.harbor', { n: capacity, s: caravanSlots(harbor) })}
            {' · '}
            {lang === 'ru' ? `риск в пути ${Math.round(chance * 100)}%, потеря ${Math.round(loss * 100)}% груза` : `road risk ${Math.round(chance * 100)}%, losing ${Math.round(loss * 100)}% of cargo`}
          </p>
        )}
        {travelling.length === 0 && done.length === 0 && harbor > 0 && <p className="muted">{t('board.none')}</p>}
        {travelling.map((c) => {
          const total = c.arriveAt - c.departAt;
          const p = Math.min(1, Math.max(0, (now - c.departAt) / total));
          const incoming = c.to === me.id;
          return (
            <div key={c.id} className="caravan">
              <div className="row">
                <span><ResIcon res={c.res} size={16} /> {c.amount} → {incoming ? t('board.toYou') : state.names[c.to]}{incoming ? ` (${state.names[c.from]})` : ''}</span>
                <small>{p >= 1 ? '…' : `${t('board.arrives')} ${duration(lang, (c.arriveAt - now) / state.speed)}`}</small>
              </div>
              <div className="track"><i style={{ width: `${p * 100}%` }} /><span className="track-balloon" style={{ left: `${p * 100}%` }}>🎈</span></div>
            </div>
          );
        })}
        {done.map((c) => (
          <div key={c.id} className="row done">
            <span><ResIcon res={c.res} size={16} /> {c.delivered} {t('board.delivered')} → {c.to === me.id ? t('board.toYou') : state.names[c.to]}</span>
            {c.lost > 0 && <small className="warn">{c.event === 'pirates' ? '🏴‍☠️' : '⛈'} −{c.lost}</small>}
          </div>
        ))}
      </section>

      <section className="card">
        <h3>{t('board.requests')}</h3>
        <p className="muted">{t('board.reward')}</p>
        {board.length === 0 && <p className="muted">{t('board.noRequests')}</p>}
        {board.map((rq) => {
          const left = rq.amount - rq.filled - rq.promised;
          const have = Math.floor(island.res[rq.res]);
          const why = harbor === 0 ? t('board.noHarbor') : free <= 0 ? t('board.busy') : have < 1 ? t('board.noCargo') : null;
          return (
            <div key={rq.id} className="row request">
              <span>
                <b>{rq.name}</b>{rq.npc && <em className="tag">{t('resident')}</em>}{rq.sameArchipelago && <em className="tag good">★</em>}
                <br />
                <small>{t('board.needs')} <ResIcon res={rq.res} size={15} /> {left > 0 ? left : 0} {resName(lang, rq.res).toLowerCase()}{rq.promised > 0 ? ` · ${rq.promised} ${t('board.onWay')}` : ''}</small>
              </span>
              <button className="btn small" disabled={!!why || left <= 0} title={why ?? ''} onClick={() => void send(rq)}>
                {t('send')}{!why && left > 0 ? ` ${Math.min(left, capacity, have)}` : ''}
              </button>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h3>{t('board.ask')}</h3>
        <p className="muted">{t('board.askHint')}</p>
        {mine.map((rq) => (
          <div key={rq.id} className="row request">
            <span><ResIcon res={rq.res} size={16} /> {rq.filled}/{rq.amount} {resName(lang, rq.res).toLowerCase()}{rq.promised > 0 ? ` · ${rq.promised} ${t('board.onWay')}` : ''}</span>
            <button className="btn small ghost" onClick={() => void game.act('/request/cancel', { id: rq.id })}>{t('cancel')}</button>
          </div>
        ))}
        {mine.length < 2 && (
          <div className="ask">
            <div className="seg">
              {foreign.map((r) => (
                <button key={r} className={askRes === r ? 'on' : ''} onClick={() => setAskRes(r)}><ResIcon res={r} size={18} /> {resName(lang, r)}</button>
              ))}
            </div>
            <div className="row">
              <div className="stepper">
                <button onClick={() => setAskAmount((n) => Math.max(5, n - 5))}>−</button>
                <b>{askAmount}</b>
                <button onClick={() => setAskAmount((n) => Math.min(200, n + 5))}>+</button>
              </div>
              <button className="btn small" onClick={() => void game.act('/request', { res: askRes, amount: askAmount })}>{t('board.post')}</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h3>{t('trader.title')}</h3>
        <p className="muted">{t('trader.hint')}</p>
        {RARE.map((r) => {
          const q = state.trader[r];
          return (
            <div key={r} className="row trader">
              <span>
                <ResIcon res={r} size={18} /> <b>{resName(lang, r)}</b>
                <br />
                <small className={q.mood === 'scarce' ? 'warn' : q.mood === 'plenty' ? 'good' : ''}>{t(`trader.${q.mood}`)} · {num(q.stock)}</small>
              </span>
              <span className="trader-btns">
                <button className="btn small" disabled={q.stock < 10 || island.res.credits < q.buy * 10} onClick={() => void trade('buy', r)}>
                  {t('trader.buy')}<small><ResIcon res="credits" size={12} /> ~{num(q.buy * 10)}</small>
                </button>
                <button className="btn small ghost" disabled={island.res[r] < 10} onClick={() => void trade('sell', r)}>
                  {t('trader.sell')}<small><ResIcon res="credits" size={12} /> ~{num(q.sell * 10)}</small>
                </button>
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
