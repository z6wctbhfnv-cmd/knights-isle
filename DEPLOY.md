# Running Knight's Isle on a server

One container holds everything: the game server, the bot, the NEAR testnet operation queue, the Mini App (`/`) and the rewards site (`/rewards`). Caddy next to it gets the HTTPS certificate by itself.

## What you need

- A Linux server with Docker (1 GB of memory is enough) and ports 80 and 443 open.
- A domain or subdomain whose A record points to the server IP, for example `isle.example.com`.
- A Telegram bot.

## 1. Bot

In [@BotFather](https://t.me/BotFather):

1. `/newbot` — get the token and the bot name.
2. `/setdomain` — choose the bot and enter the domain. Without this, Telegram login on the rewards site will not work.

The "Play" menu button and the commands are set by the bot itself on start.

## 2. Secrets and the game world

On the Mac, fill in the empty lines in `~/knights-isle/.env` (the rest is already there):

```
BOT_TOKEN=token from BotFather
BOT_USERNAME=bot_name_without_at_sign
DOMAIN=isle.example.com
WEBAPP_URL=https://isle.example.com/
```

Then stop the local game server and pack the world:

```bash
bash ~/knights-isle/scripts/pack-world.sh
```

This gives `~/knights-isle-world.tgz`. It contains the `.env` with the keys and the database `apps/server/data/testnet.db`. Do not send it to anyone.

**One world, one server.** The server refuses to work with testnet on any database except the one marked as the world `knights-isle.testnet`. The accounts of players, knights, the trader and the residents are already created in testnet, their keys are derived from the secret in `.env`, and the balances in the database match the balances on the network. If you run two servers with the same `.env`, or a new server with an empty database, the game and the network will diverge, and the operation queue will stop.

## 3. On the server

```bash
git clone https://github.com/z6wctbhfnv-cmd/knights-isle.git
cd knights-isle
git checkout game        # or main, after the merge
```

From the Mac, copy the archive and unpack it into the repository root:

```bash
scp ~/knights-isle-world.tgz user@server:knights-isle/
```

```bash
cd knights-isle && tar xzf knights-isle-world.tgz && rm knights-isle-world.tgz
cd deploy && docker compose up -d --build
```

## 4. Check

- `https://DOMAIN/api/health` answers `{"ok":true}`.
- In the logs (`docker compose logs -f isle`) there are lines `bot @KnightsIsleBot (webhook)` and `chain: N operations sent`.
- In Telegram send the bot `/start`: the "🏝 Open my island" button arrives, the game opens.
- `https://DOMAIN/rewards`: the pool and weeks are visible, Telegram login works.

## Without Docker

Node.js 22, then in the repository root:

```bash
npm ci
npm start
```

The server listens on port 4310. HTTPS in front of it — any reverse proxy (Caddy, nginx). `.env` and `apps/server/data/testnet.db` must lie in the same places as on the Mac.

## Useful

- **Time machine.** `DEMO_CONTROLS=1` shows it to all players in the "Quests" tab. Judges need this: it shows how a week passes. In "a week in a minute" mode a week closes every minute and 0.01 test NEAR leaves the pool. The pool holds about 0.26 NEAR, which is enough for about 25 minutes of acceleration. To top up the pool: `deposit()` on `pool.knights-isle.testnet`.
- **Game money.** Gas is paid by `knights-isle.testnet`. If it has less than 0.5 NEAR, the queue pauses and the game keeps working. To top up: `npx tsx --env-file=.env scripts/faucet-topup.ts` (the faucet gives 10 test NEAR).
- **Check game against network:** `DATABASE_URL=file:apps/server/data/testnet.db npx tsx --env-file=.env scripts/check-chain.ts`.
