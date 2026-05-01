FROM node:20-alpine
WORKDIR /app
COPY services/api-gateway/package.json services/api-gateway/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY services/api-gateway/src ./src
EXPOSE 8000
CMD ["node", "src/server.js"]

