# Knight's Isle: one container runs the game server, the bot, the chain queue,
# and serves the Mini App (/) and the rewards page (/rewards).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY packages packages
COPY apps apps
# The bot username goes into the Mini App's invite links at build time.
ARG VITE_BOT_USERNAME=""
ENV VITE_BOT_USERNAME=$VITE_BOT_USERNAME
RUN npm run build:web
WORKDIR /app/apps/server
ENV PORT=4310 WEB_DIST=../web/dist DATABASE_URL=file:data/testnet.db
EXPOSE 4310
# data/ holds the game database: mount it as a volume so it survives restarts.
VOLUME ["/app/apps/server/data"]
CMD ["npx", "tsx", "src/index.ts"]
