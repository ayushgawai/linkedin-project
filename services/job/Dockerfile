FROM node:20-alpine
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY services/job/package.json ./services/job/package.json
RUN npm install --omit=dev --workspace services/job
COPY services/job/src ./services/job/src
COPY services/shared/src ./services/shared/src
WORKDIR /workspace/services/job
EXPOSE 8002
CMD ["npm", "start"]
