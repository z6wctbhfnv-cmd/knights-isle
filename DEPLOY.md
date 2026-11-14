# Запуск Knight's Isle на сервере

Один контейнер держит всё: сервер игры, бота, очередь операций в NEAR testnet, Mini App (`/`) и сайт наград (`/rewards`). Caddy рядом сам получает HTTPS-сертификат.

## Что нужно

- Сервер на Linux с Docker (1 ГБ памяти хватит) и открытыми портами 80 и 443.
- Домен или поддомен, у которого A-запись указывает на IP сервера, например `isle.example.com`.
- Бот в Telegram.

## 1. Бот

В [@BotFather](https://t.me/BotFather):

1. `/newbot` — получить токен и имя бота.
2. `/setdomain` — выбрать бота и вписать домен. Без этого не заработает вход через Telegram на сайте наград.

Кнопку меню «Играть» и команды бот настраивает сам при запуске.

## 2. Секреты и мир игры

На Mac в `~/knights-isle/.env` заполнить пустые строки (остальное уже на месте):

```
BOT_TOKEN=токен из BotFather
BOT_USERNAME=имя_бота_без_собаки
DOMAIN=isle.example.com
WEBAPP_URL=https://isle.example.com/
```

Потом остановить локальный сервер игры и упаковать мир:

```bash
bash ~/knights-isle/scripts/pack-world.sh
```

Получится `~/knights-isle-world.tgz`. В нём `.env` с ключами и база `apps/server/data/testnet.db`. Никому его не отправлять.

**Один мир — один сервер.** Сервер сам откажется работать с testnet на любой базе, кроме помеченной как мир `knights-isle.testnet`. Аккаунты игроков, рыцарей, торговца и жителей уже созданы в testnet, их ключи выводятся из секрета в `.env`, а балансы в базе совпадают с балансами в сети. Если запустить два сервера с одним `.env`, или новый сервер с пустой базой, игра и сеть разойдутся, и очередь операций остановится.

## 3. На сервере

```bash
git clone https://github.com/z6wctbhfnv-cmd/knights-isle.git
cd knights-isle
git checkout game        # или main, после слияния
```

С Mac скопировать архив и распаковать его в корень репозитория:

```bash
scp ~/knights-isle-world.tgz user@server:knights-isle/
```

```bash
cd knights-isle && tar xzf knights-isle-world.tgz && rm knights-isle-world.tgz
cd deploy && docker compose up -d --build
```

## 4. Проверка

- `https://DOMAIN/api/health` отвечает `{"ok":true}`.
- В логах (`docker compose logs -f isle`) есть строки `bot @имя (webhook)` и `chain: N operations sent`.
- В Telegram боту `/start`: приходит кнопка «Открыть остров», игра открывается.
- `https://DOMAIN/rewards`: видны пул и недели, работает вход через Telegram.

## Без Docker

Node.js 22, затем в корне репозитория:

```bash
npm ci
npm start
```

Сервер слушает порт 4310. HTTPS перед ним — любой обратный прокси (Caddy, nginx). `.env` и `apps/server/data/testnet.db` должны лежать на тех же местах, что и на Mac.

## Полезное

- **Машина времени.** `DEMO_CONTROLS=1` показывает её всем игрокам во вкладке «Задания». Для судей это нужно: так видно, как проходит неделя. На «неделе за минуту» каждую минуту закрывается неделя и из пула уходит 0,01 тестового NEAR. В пуле около 0,26 NEAR, этого хватит примерно на 25 минут ускорения. Пополнить пул: `deposit()` на `pool.knights-isle.testnet`.
- **Деньги игры.** Газ платит `knights-isle.testnet`. Если на нём меньше 0,5 NEAR, очередь встаёт на паузу, а игра продолжает работать. Пополнить: `npx tsx --env-file=.env scripts/faucet-topup.ts` (кран даёт 10 тестовых NEAR).
- **Сверка игры и сети:** `DATABASE_URL=file:apps/server/data/testnet.db npx tsx --env-file=.env scripts/check-chain.ts`.
