import type { Biome, Building, Caravan, Egg, Island, Quote, Rare, Res } from '@isle/core';

export interface GameEvent { id: number; kind: string; data: Record<string, any>; at: number }
export interface BoardRequest { id: string; playerId: string; name: string; npc: boolean; res: Rare; amount: number; filled: number; promised: number; mine: boolean; sameArchipelago: boolean }

export interface State {
  now: number;
  speed: number;
  epoch: { index: number; endsAt: number; season: number; week: number };
  me: { id: string; name: string; lang: 'en' | 'ru'; refXp: number; likes: number; points: number; pointsTotal: number; archipelago: { id: string; name: string } | null; eligible: boolean };
  island: Island;
  daily: { available: boolean; step: number; claimedToday: boolean };
  hunt: { left: number; hits: { tile: number; res: Res; amount: number; egg: Egg | null }[] };
  caravans: Caravan[];
  names: Record<string, string>;
  requests: BoardRequest[];
  trader: Record<Rare, Quote>;
  events: GameEvent[];
}

export interface IslandCard { id: string; name: string; npc: boolean; biome: Biome; levels: Record<Building, number>; level: number; likes: number; sameArchipelago: boolean }
export interface Visit { id: string; name: string; npc: boolean; biome: Biome; levels: Record<Building, number>; level: number; knightDeliveries: number; eggs: number; reputation: number; likes: number; liked: boolean }
export interface Top { players: { id: string; name: string; biome: Biome; points: number }[]; archipelagos: { id: string; name: string; members: number; points: number }[] }

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

declare global {
  interface Window { Telegram?: { WebApp?: any } }
}

export const tg = () => window.Telegram?.WebApp;

function devUser(): string | null {
  const q = new URLSearchParams(location.search).get('dev');
  if (q) sessionStorage.setItem('dev', q);
  return q ?? sessionStorage.getItem('dev');
}

export async function api<T = { result: any; state: State }>(path: string, body?: unknown, method?: 'GET' | 'POST'): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const init = tg()?.initData;
  if (init) headers['x-init-data'] = init;
  const dev = devUser();
  if (dev) headers['x-dev-user'] = encodeURIComponent(dev);
  const res = await fetch(`/api${path}`, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({ error: 'server', message: 'bad response' }));
  if (!res.ok) throw new ApiError(json.error ?? 'server', json.message ?? 'error');
  return json as T;
}

export const startParam = (): string | null => tg()?.initDataUnsafe?.start_param ?? new URLSearchParams(location.search).get('ref');
