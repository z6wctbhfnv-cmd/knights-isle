import { CLAIM_MIN_DAYS, CLAIM_MIN_ISLAND_LEVEL, QUEST_GOAL, QUESTS, islandLevel, questReward } from '@isle/core';
import { api, type State } from '../api.ts';
import { ResIcon } from '../art/Icons.tsx';
import { duration, makeT, questName } from '../i18n.ts';
import { useTick, type Game } from '../store.ts';
import { DailyCalendar } from './Daily.tsx';

export function QuestsTab({ game, state }: { game: Game; state: State }) {
  useTick(state.speed > 1 ? 300 : 1000);
  const { lang } = game;
  const t = makeT(lang);
  const { island, me, epoch } = state;
  const now = game.now();
  const reward = questReward(island);

  const speed = async (n: number) => {
    try {
      await api('/demo/speed', { speed: n });
      await game.refresh();
    } catch {
      game.say(t('err.any'));
    }
  };

  return (
    <div className="page">
      <section className="card gift-card">
        <h3><i className="h-ico">🎁</i>{t('daily.title')}</h3>
        <DailyCalendar game={game} state={state} />
      </section>

      <section className="card">
        <div className="row">
          <h3><i className="h-ico">✅</i>{t('quests.today')}</h3>
          <span className="pill">🔥 {t('quests.streak', { n: island.streak.days })}</span>
        </div>
        {QUESTS.map((q) => {
          const done = island.quests.done.includes(q);
          const have = Math.min(island.quests.progress[q] ?? 0, QUEST_GOAL[q]);
          return (
            <div key={q} className={`row quest ${done ? 'done' : ''}`}>
              <span><i className="check">{done ? '✓' : ''}</i> {questName(lang, q)}{QUEST_GOAL[q] > 1 ? ` (${have}/${QUEST_GOAL[q]})` : ''}</span>
              <small><ResIcon res="credits" size={13} /> {reward} · +5</small>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h3><i className="h-ico">📅</i>{t('quests.week', { w: epoch.week, s: epoch.season })}</h3>
        <div className="stats">
          <div><b>{me.points}</b><small>{t('quests.points')}</small></div>
          <div><b>{duration(lang, (epoch.endsAt - now) / state.speed)}</b><small>{t('quests.ends')}</small></div>
        </div>
        <p className={me.eligible ? 'good' : 'muted'}>{me.eligible ? t('quests.eligibleYes') : t('quests.eligibleNo')}</p>
        <div className="row"><span>{t('quests.days')}</span><b>{Math.min(island.activeDays, CLAIM_MIN_DAYS)}/{CLAIM_MIN_DAYS}</b></div>
        <div className="row"><span>{t('quests.islandLevel')}</span><b>{Math.min(islandLevel(island), CLAIM_MIN_ISLAND_LEVEL)}/{CLAIM_MIN_ISLAND_LEVEL}</b></div>
      </section>

      {game.demo && (
        <section className="card demo">
          <h3><i className="h-ico">⏳</i>{t('demo.title')}</h3>
          <p className="muted">{t('demo.hint')}</p>
          <div className="seg">
            {([[1, 'demo.x1'], [60, 'demo.x60'], [10080, 'demo.week']] as const).map(([n, key]) => (
              <button key={n} className={state.speed === n ? 'on' : ''} onClick={() => void speed(n)}>{t(key)}</button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="seg">
          {(['en', 'ru'] as const).map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => void game.act('/lang', { lang: l })}>{l === 'en' ? 'English' : 'Русский'}</button>
          ))}
        </div>
      </section>
    </div>
  );
}
