# Build context MUST be the repo root so services/shared is available.
# docker-compose:  build: { context: .., dockerfile: services/analytics/Dockerfile }

FROM node:20-alpine AS builder
WORKDIR /app
COPY services/analytics/package.json services/analytics/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY services/analytics/package.json ./
COPY services/analytics/src ./src
COPY services/shared ../shared
COPY scripts/bench /scripts/bench

# Files under /shared and /scripts import bare modules (ioredis, mysql2,
# mongodb) that Node can only find in /app/node_modules. Because both live
# outside the /app tree, the ESM walk-up never reaches that dir. Symlinks
# into each path make the walk-up resolve without duplicating packages or
# editing import statements.
RUN ln -s /app/node_modules /shared/node_modules \
 && ln -s /app/node_modules /scripts/node_modules

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app /shared /scripts
USER app

EXPOSE 8006
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8006/health | grep -q '"status":"ok"' || exit 1

CMD ["node", "src/server.js"]
