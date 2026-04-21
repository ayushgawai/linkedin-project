FROM node:20-alpine
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY services/profile/package.json ./services/profile/package.json
RUN npm install --omit=dev --workspace services/profile
COPY services/profile/src ./services/profile/src
COPY services/shared/src ./services/shared/src
WORKDIR /workspace/services/profile
EXPOSE 8001
CMD ["npm", "start"]
