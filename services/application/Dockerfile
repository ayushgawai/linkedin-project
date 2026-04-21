FROM node:20-alpine
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY services/application/package.json ./services/application/package.json
RUN npm install --omit=dev --workspace services/application
COPY services/application/src ./services/application/src
COPY services/shared/src ./services/shared/src
WORKDIR /workspace/services/application
EXPOSE 8003
CMD ["npm", "start"]
