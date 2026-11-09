# ── 1. Build: front (Vite) + server (TypeScript) ─────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Dependências primeiro (cache: só reinstala quando os package*.json mudam)
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --include=dev && npm ci --include=dev --prefix server

COPY . .
RUN npm run build:all

# ── 2. Produção: só o necessário para rodar ──────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3333

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server && npm cache clean --force

# server/dist → código do server · server/drizzle → migrations · dist → front
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "server/dist/index.js"]
