import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, startParam, tg, type State } from './api.ts';
import { makeT, type Key, type Lang } from './i18n.ts';

export interface Game {
  state: State | null;
  /** Set when the player has no island yet. */
  need: { name: string; lang: Lang } | null;
  demo: boolean;
  lang: Lang;
  toast: string | null;
  loading: boolean;
  /** Game time right now, extrapolated from the last server answer. */
  now: () => number;
  refresh: () => Promise<void>;
  /** Runs a game action. Returns its result, or null when the server refused (a toast explains why). */
  act: <R = any>(path: string, body?: unknown) => Promise<R | null>;
  start: (biome: string) => Promise<void>;
  say: (text: string) => void;
}

export function useGame(): Game {
  const [state, setState] = useState<State | null>(null);
  const [need, setNeed] = useState<Game['need']>(null);
  const [demo, setDemo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedAt = useRef(Date.now());
  const stateRef = useRef<State | null>(null);
  const toastTimer = useRef<number>(0);

  const lang: Lang = state?.me.lang ?? need?.lang ?? (navigator.language.startsWith('ru') ? 'ru' : 'en');

  const say = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const apply = useCallback((s: State) => {
    fetchedAt.current = Date.now();
    stateRef.current = s;
    setState(s);
    setNeed(null);
  }, []);

  const fail = useCallback((e: unknown) => {
    const t = makeT(stateRef.current?.me.lang ?? 'en');
    const code = e instanceof ApiError ? e.code : 'any';
    const key = `err.${code}` as Key;
    say(t((['err.resources', 'err.slots', 'err.capacity', 'err.request', 'err.limit', 'err.stock', 'err.taken', 'err.name', 'err.full', 'err.digs', 'err.auth'] as Key[]).includes(key) ? key : 'err.any'));
    tg()?.HapticFeedback?.notificationOccurred?.('error');
  }, [say]);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ state?: State; needStart?: boolean; name?: string; lang?: Lang; demo: boolean }>('/state');
      setDemo(!!r.demo);
      if (r.state) apply(r.state);
      else setNeed({ name: r.name ?? '', lang: r.lang ?? 'en' });
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [apply, fail]);

  const act = useCallback(async (path: string, body: unknown = {}) => {
    try {
      const r = await api(path, body);
      apply(r.state);
      return r.result ?? true;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [apply, fail]);

  const start = useCallback(async (biome: string) => {
    try {
      const r = await api<{ state: State }>('/start', { biome, ref: startParam() });
      apply(r.state);
    } catch (e) {
      fail(e);
    }
  }, [apply, fail]);

  const now = useCallback(() => {
    const s = stateRef.current;
    return s ? s.now + (Date.now() - fetchedAt.current) * s.speed : Date.now();
  }, []);

  useEffect(() => {
    tg()?.ready?.();
    tg()?.expand?.();
    void refresh();
  }, [refresh]);

  // Keep in step with the server: often while time is sped up or a caravan is about to arrive.
  useEffect(() => {
    if (!state) return;
    const soon = state.caravans.some((c) => c.status === 'travel');
    const every = state.speed > 1 ? 2500 : soon ? 10000 : 30000;
    const id = window.setInterval(() => { if (!document.hidden) void refresh(); }, every);
    return () => window.clearInterval(id);
  }, [state?.speed, state?.caravans, refresh, state]);

  return { state, need, demo, lang, toast, loading, now, refresh, act, start, say };
}

/** Re-renders the component on a timer, so counters and progress bars move. */
export function useTick(ms: number): void {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}
