# Build context MUST be the repo root so that services/shared is available.
# docker-compose wires this via:  build: { context: .., dockerfile: services/profile/Dockerfile }

FROM node:20-alpine AS builder
WORKDIR /app
COPY services/profile/package.json services/profile/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY services/profile/package.json ./
COPY services/profile/src ./src
COPY services/shared ../shared

# /shared/cache.js imports `ioredis`. Because /shared sits outside /app,
# Node's ESM walk-up resolution never reaches /app/node_modules. Symlinking
# node_modules into /shared makes the walk-up find every dep the service
# already installed, without duplicating packages or touching import paths.
RUN ln -s /app/node_modules /shared/node_modules

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app /shared
USER app

EXPOSE 8001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8001/health | grep -q '"status":"ok"' || exit 1

CMD ["node", "src/server.js"]
