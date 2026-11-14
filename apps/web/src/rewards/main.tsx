import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Knight } from '../art/Knight.tsx';
import './rewards.css';

interface Epoch {
  epoch: number; chainEpoch: number; root: string | null; rootTx: string | null; funded: boolean | null;
  pool: string; distributed: string; players: number;
  archipelago: { name: string; dao: string | null; daoStatus: string | null } | null;
  treasury: { account: string; amount: string; claimed: boolean | null } | null;
}
interface Overview {
  chain: string; gameAccount: string; resources: string; pool: string; explorer: string; botUsername: string | null; devLogin: boolean;
  poolBalance: { balance: string; reserved: string; available: string } | null; epochs: Epoch[];
}
interface Me {
  name: string; account: string; islandLevel: number; activeDays: number; eligible: boolean; canClaim: boolean;
  payouts: { epoch: number; amount: string; funded: boolean | null; claimed: boolean; recipient: string | null; tx: string | null }[];
}
interface Op { id: number; kind: string; payload: any; status: string; tx: string | null }

const near = (yocto: string | null | undefined) => {
  if (!yocto) return '0';
  const n = Number(BigInt(yocto) / 10n ** 18n) / 1e6;
  return n >= 1 ? n.toFixed(3) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
};
const short = (s: string, n = 10) => (s.length > n + 3 ? `${s.slice(0, n)}…` : s);

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ message: 'bad response' }));
  if (!res.ok) throw new Error(json.message ?? 'error');
  return json as T;
}

declare global {
  interface Window { onTelegramAuth?: (user: Record<string, unknown>) => void }
}

function TelegramLogin({ bot, onAuth }: { bot: string; onAuth: (a: Record<string, unknown>) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.onTelegramAuth = onAuth;
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', bot);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-radius', '12');
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    s.setAttribute('data-request-access', 'write');
    box.current?.replaceChildren(s);
  }, [bot, onAuth]);
  return <div ref={box} className="tg-login" />;
}

function App() {
  const [o, setO] = useState<Overview | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [queue, setQueue] = useState<Record<string, number>>({});
  const [auth, setAuth] = useState<Record<string, unknown> | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('isle-auth') ?? 'null'); } catch { return null; }
  });
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [devId, setDevId] = useState('');

  const load = async () => {
    const [a, b] = await Promise.all([fetch('/api/rewards/overview').then((r) => r.json()), fetch('/api/proof').then((r) => r.json())]);
    setO(a);
    setOps(b.ops ?? []);
    setQueue(b.queue ?? {});
  };
  useEffect(() => { void load(); }, []);

  const signIn = (a: Record<string, unknown>) => {
    setAuth(a);
    try { sessionStorage.setItem('isle-auth', JSON.stringify(a)); } catch { /* private mode */ }
  };
  useEffect(() => {
    if (!auth) return;
    post<Me>('/api/rewards/me', { auth }).then(setMe).catch((e) => { setErr(e.message); setMe(null); });
  }, [auth]);

  const claim = async (epoch: number) => {
    setErr(null);
    setBusy(epoch);
    try {
      await post('/api/rewards/claim', { auth, epoch, wallet });
      setMe(await post<Me>('/api/rewards/me', { auth }));
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const payTreasury = async (epoch: number) => {
    setErr(null);
    setBusy(-epoch);
    try {
      await post('/api/rewards/treasury', { epoch });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const ex = o?.explorer ?? 'https://testnet.nearblocks.io';
  const tx = (h: string | null) => (h ? <a href={`${ex}/txns/${h}`} target="_blank" rel="noreferrer">{short(h, 8)}</a> : '—');
  const acc = (a: string) => <a href={`${ex}/address/${a}`} target="_blank" rel="noreferrer">{a}</a>;

  return (
    <main>
      <header className="hero">
        <Knight size={64} />
        <div>
          <h1>Knight's Isle rewards</h1>
          <p>Every week a pool of NEAR is shared by points. Here you claim your share to your own wallet and check every step on chain. <b>NEAR testnet.</b></p>
        </div>
      </header>

      <section className="card">
        <h2>Your rewards</h2>
        {!auth && (
          <>
            <p className="muted">Sign in with the same Telegram account you play with.</p>
            {o?.botUsername ? <TelegramLogin bot={o.botUsername} onAuth={signIn} /> : <p className="muted">Telegram sign-in appears once the bot is set up.</p>}
            {o?.devLogin && (
              <div className="row">
                <input placeholder="dev: Telegram id" value={devId} onChange={(e) => setDevId(e.target.value)} />
                <button onClick={() => signIn({ dev: devId })} disabled={!/^\d+$/.test(devId)}>Dev sign-in</button>
              </div>
            )}
          </>
        )}
        {auth && !me && !err && <p className="muted">Loading…</p>}
        {me && (
          <>
            <div className="stats">
              <div><small>Player</small><b>{me.name}</b></div>
              <div><small>Game account</small><b className="mono">{short(me.account, 18)}</b></div>
              <div><small>Island level</small><b>{me.islandLevel}</b></div>
              <div><small>Active days</small><b>{me.activeDays}</b></div>
            </div>
            <p className={me.eligible ? 'good' : 'muted'}>{me.eligible ? 'You take part in the weekly rewards.' : 'Rewards open after 3 active days and island level 3.'}</p>
            <label className="wallet">
              <span>Your testnet wallet</span>
              <input placeholder="name.testnet" value={wallet} onChange={(e) => setWallet(e.target.value.trim())} />
            </label>
            {me.payouts.length === 0 && <p className="muted">No payouts yet. They appear when a week closes.</p>}
            {me.payouts.map((p) => (
              <div key={p.epoch} className="row payout">
                <span>Week {p.epoch}: <b>{near(p.amount)} NEAR</b></span>
                {p.claimed ? (
                  <span className="good">claimed{p.recipient ? ` to ${p.recipient}` : ''} {tx(p.tx)}</span>
                ) : p.funded === false ? (
                  <span className="muted">the pool could not cover this week</span>
                ) : p.funded === null ? (
                  <span className="muted">going on chain…</span>
                ) : (
                  <button disabled={!me.canClaim || !wallet || busy !== null} onClick={() => void claim(p.epoch)}>{busy === p.epoch ? 'Claiming…' : 'Claim'}</button>
                )}
              </div>
            ))}
            <button className="link" onClick={() => { setAuth(null); setMe(null); sessionStorage.removeItem('isle-auth'); }}>Sign out</button>
          </>
        )}
        {err && <p className="warn">{err}</p>}
      </section>

      <section className="card">
        <h2>Weekly pool</h2>
        {o?.poolBalance && (
          <div className="stats">
            <div><small>In the pool</small><b>{near(o.poolBalance.balance)} NEAR</b></div>
            <div><small>Promised to weeks</small><b>{near(o.poolBalance.reserved)} NEAR</b></div>
            <div><small>Free</small><b>{near(o.poolBalance.available)} NEAR</b></div>
          </div>
        )}
        <p className="muted">Anyone can top up the pool by calling <code>deposit()</code> on {o && acc(o.pool)}. 80% of a week goes to players by points (at most 5% each), 20% to the best archipelago's treasury, a Sputnik DAO.</p>
        <table>
          <thead><tr><th>Week</th><th>Players</th><th>Shared</th><th>Merkle root</th><th>Best archipelago</th></tr></thead>
          <tbody>
            {(o?.epochs ?? []).map((e) => (
              <tr key={e.epoch}>
                <td>{e.epoch}</td>
                <td>{e.players}</td>
                <td>{near(e.distributed)} NEAR</td>
                <td className="mono">{e.root ? short(e.root, 10) : '—'} {e.funded === false ? <em>(not funded)</em> : tx(e.rootTx)}</td>
                <td>
                  {e.archipelago ? e.archipelago.name : '—'}
                  {e.treasury && (
                    <div className="small">
                      {near(e.treasury.amount)} NEAR → {acc(e.treasury.account)}{' '}
                      {e.treasury.claimed ? <span className="good">paid</span> : e.funded && e.archipelago?.daoStatus === 'live' ? (
                        <button className="small-btn" disabled={busy !== null} onClick={() => void payTreasury(e.epoch)}>Pay the treasury</button>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>What the game does on chain</h2>
        <p className="muted">
          Game account {o && acc(o.gameAccount)} · resources (NEP-245) {o && acc(o.resources)} · pool {o && acc(o.pool)}.
          {' '}Sent: {queue.done ?? 0}, waiting: {queue.pending ?? 0}.
        </p>
        <table>
          <thead><tr><th>#</th><th>Operation</th><th>Transaction</th></tr></thead>
          <tbody>
            {ops.slice(0, 30).map((op) => (
              <tr key={op.id}>
                <td>{op.id}</td>
                <td>{describe(op)}</td>
                <td>{op.status === 'done' ? tx(op.tx) : <em>{op.status}</em>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer>Knight's Isle · NEAR Hackathon 2026 · open the game in Telegram{o?.botUsername ? <>: <a href={`https://t.me/${o.botUsername}`}>@{o.botUsername}</a></> : ''}</footer>
    </main>
  );
}

function describe(op: Op): string {
  const p = op.payload;
  const name = (a: string) => a.split('.')[0];
  switch (op.kind) {
    case 'create_account': return `new account ${name(p.account)}`;
    case 'mint': return `produced for ${name(p.account)}: ${Object.entries(p.amounts).map(([k, v]) => `${v} ${k}`).join(', ')}`;
    case 'burn': return `spent by ${name(p.account)}: ${Object.entries(p.amounts).map(([k, v]) => `${v} ${k}`).join(', ')}`;
    case 'transfer': return `${name(p.from)} → ${name(p.to)}: ${p.amount} ${p.res}${p.memo ? ` (${p.memo})` : ''}`;
    case 'set_epoch_root': return `week ${p.epoch} closed, root ${String(p.root).slice(0, 8)}…`;
    case 'create_dao': return `treasury DAO ${p.name}`;
    default: return op.kind;
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
