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

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app ../shared
USER app

EXPOSE 8006
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8006/health | grep -q '"status":"ok"' || exit 1

CMD ["node", "src/server.js"]
