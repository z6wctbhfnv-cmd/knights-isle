import { useState } from 'react';
import { DAILY_DAYS, RESOURCES, dailyReward, type Res } from '@isle/core';
import { tg, type State } from '../api.ts';
import { ResIcon } from '../art/Icons.tsx';
import { knightLine, makeT, num } from '../i18n.ts';
import type { Game } from '../store.ts';

function Chest({ open }: { open: boolean }) {
  return (
    <svg width="46" height="40" viewBox="0 0 46 40" aria-hidden="true">
      <ellipse cx="23" cy="37" rx="18" ry="3" fill="#000" opacity="0.15" />
      <rect x="5" y="17" width="36" height="19" rx="3" fill="#b8743a" stroke="#7c4a22" strokeWidth="1.4" />
      <rect x="5" y="22" width="36" height="3.5" fill="#ffcd3c" stroke="#b98a12" strokeWidth="0.8" />
      {open ? (
        <>
          <path d="M5 17 9 4h28l4 13z" fill="#d18a4b" stroke="#7c4a22" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="16" cy="15" r="3.5" fill="#ffd84a" /><circle cx="23" cy="13" r="4" fill="#ffe27a" /><circle cx="30" cy="15" r="3.5" fill="#ffd84a" />
        </>
      ) : (
        <path d="M5 17c0-8 6-12 18-12s18 4 18 12z" fill="#d18a4b" stroke="#7c4a22" strokeWidth="1.4" />
      )}
      <rect x="20" y="20" width="6" height="8" rx="1.5" fill="#ffcd3c" stroke="#b98a12" strokeWidth="0.8" />
    </svg>
  );
}

function RewardIcons({ reward, size = 16 }: { reward: Partial<Record<Res, number>>; size?: number }) {
  return (
    <span className="reward-icons">
      {RESOURCES.filter((r) => reward[r]).map((r) => (
        <span key={r}><ResIcon res={r} size={size} />{num(reward[r]!)}</span>
      ))}
    </span>
  );
}

/** The 7-day calendar with the claim button. */
export function DailyCalendar({ game, state, onClaimed }: { game: Game; state: State; onClaimed?: (reward: Partial<Record<Res, number>>, step: number) => void }) {
  const t = makeT(game.lang);
  const { daily, island } = state;
  const [busy, setBusy] = useState(false);
  const claimedUpTo = daily.claimedToday ? daily.step : daily.step - 1;
  const claim = async () => {
    setBusy(true);
    const out = await game.act<{ step: number; reward: Partial<Record<Res, number>> }>('/daily');
    setBusy(false);
    if (out) {
      tg()?.HapticFeedback?.notificationOccurred?.('success');
      onClaimed?.(out.reward, out.step);
    }
  };
  return (
    <div className="daily">
      <div className="daily-grid">
        {Array.from({ length: DAILY_DAYS }, (_, i) => i + 1).map((step) => {
          const done = step <= claimedUpTo;
          const today = daily.available && step === daily.step;
          return (
            <div key={step} className={`daily-day ${step === DAILY_DAYS ? 'chest' : ''} ${done ? 'done' : ''} ${today ? 'is-today' : ''}`}>
              <small>{step === DAILY_DAYS ? t('daily.chest') : t('daily.day', { n: step })}</small>
              {step === DAILY_DAYS && <Chest open={done} />}
              <RewardIcons reward={dailyReward(island, step)} size={step === DAILY_DAYS ? 15 : 14} />
              {done && <i className="daily-check">✓</i>}
            </div>
          );
        })}
      </div>
      {daily.available ? (
        <button className="btn big gift-btn" disabled={busy} onClick={() => void claim()}>{t('daily.claim')} · {t('daily.day', { n: daily.step })}</button>
      ) : (
        <p className="muted center">{t('daily.tomorrow', { n: daily.step >= DAILY_DAYS ? 1 : daily.step + 1 })}</p>
      )}
      <p className="muted small-note">{t('daily.rule')}</p>
    </div>
  );
}

/** Pops up once a day when the gift is waiting. */
export function DailyModal({ game, state, onClose, speak }: { game: Game; state: State; onClose: () => void; speak: (s: string) => void }) {
  const t = makeT(game.lang);
  const [got, setGot] = useState<{ reward: Partial<Record<Res, number>>; step: number } | null>(null);
  return (
    <div className="sheet-wrap center-wrap" onClick={onClose}>
      <div className="sheet modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-gift"><Chest open={!!got} /></div>
        <h2 className="center">{got ? t('daily.got') : t('daily.title')}</h2>
        {got ? (
          <>
            <div className="got"><RewardIcons reward={got.reward} size={26} /></div>
            <button className="btn big" onClick={onClose}>{t('ok')}</button>
          </>
        ) : (
          <>
            <DailyCalendar
              game={game}
              state={state}
              onClaimed={(reward, step) => {
                setGot({ reward, step });
                speak(knightLine(game.lang, step === 7 ? 'chest' : 'daily'));
              }}
            />
            <button className="btn ghost" onClick={onClose}>{t('daily.later')}</button>
          </>
        )}
      </div>
    </div>
  );
}

/** "+60 ⚡" chips that float up from the island after a collection. */
export function Floaters({ items }: { items: { id: number; reward: Partial<Record<Res, number>> }[] }) {
  return (
    <div className="floaters" aria-hidden="true">
      {items.map((f) => (
        <div key={f.id} className="floater">
          {RESOURCES.filter((r) => f.reward[r]).map((r) => (
            <span key={r}>+{num(f.reward[r]!)} <ResIcon res={r} size={18} /></span>
          ))}
        </div>
      ))}
    </div>
  );
}
