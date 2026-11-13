import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface TgUser { id: string; name: string; lang: string; startParam: string | null }

const MAX_AGE_S = 24 * 60 * 60;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

const fresh = (authDate: number, nowS: number) => authDate > 0 && nowS - authDate <= MAX_AGE_S;

/**
 * Checks Telegram Mini App `initData` (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * secret = HMAC-SHA256("WebAppData", bot token); hash = HMAC-SHA256(secret, sorted "key=value" lines).
 */
export function verifyInitData(initData: string, botToken: string, nowS = Date.now() / 1000): TgUser | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expect = createHmac('sha256', secret).update(check).digest('hex');
  if (!safeEqual(expect, hash)) return null;
  if (!fresh(Number(params.get('auth_date')), nowS)) return null;
  try {
    const u = JSON.parse(params.get('user') ?? '');
    if (!u?.id) return null;
    return {
      id: String(u.id),
      name: [u.first_name, u.last_name].filter(Boolean).join(' ').slice(0, 40) || `Player ${u.id}`,
      lang: u.language_code === 'ru' ? 'ru' : 'en',
      startParam: params.get('start_param'),
    };
  } catch {
    return null;
  }
}

/**
 * Checks Telegram Login Widget data for the rewards site (core.telegram.org/widgets/login#checking-authorization):
 * secret = SHA256(bot token); hash = HMAC-SHA256(secret, sorted "key=value" lines).
 */
export function verifyLoginWidget(data: Record<string, string>, botToken: string, nowS = Date.now() / 1000): TgUser | null {
  const { hash, ...rest } = data;
  if (!hash || !botToken || !rest.id) return null;
  const check = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const expect = createHmac('sha256', secret).update(check).digest('hex');
  if (!safeEqual(expect, hash)) return null;
  if (!fresh(Number(rest.auth_date), nowS)) return null;
  const name = [rest.first_name, rest.last_name].filter(Boolean).join(' ').slice(0, 40) || `Player ${rest.id}`;
  return { id: String(rest.id), name, lang: 'en', startParam: null };
}

/** Builds signed Mini App initData, for tests and local tools. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** Builds signed Login Widget data, for tests and local tools. */
export function signLoginWidget(fields: Record<string, string>, botToken: string): Record<string, string> {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  return { ...fields, hash: createHmac('sha256', secret).update(check).digest('hex') };
}
