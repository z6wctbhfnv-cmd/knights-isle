#!/bin/sh
# Packs the live game world for the hosting server: .env (secrets!) and the game database.
# The result goes to your home folder, outside the repo, readable only by you.
# Stop the local server first: one world must never run on two servers at once.
set -e
cd "$(dirname "$0")/.."
if lsof -ti tcp:4310 >/dev/null 2>&1; then echo "A server is still running on port 4310. Stop it first."; exit 1; fi
test -f .env || { echo "no .env"; exit 1; }
test -f apps/server/data/testnet.db || { echo "no apps/server/data/testnet.db"; exit 1; }
sqlite3 apps/server/data/testnet.db "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true
OUT="$HOME/knights-isle-world.tgz"
umask 077
tar czf "$OUT" .env apps/server/data/testnet.db
echo "packed: $OUT (contains secrets, do not share it)"
