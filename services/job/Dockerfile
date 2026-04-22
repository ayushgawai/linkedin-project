FROM node:20-alpine
WORKDIR /workspace
COPY services/shared/package.json ./services/shared/package.json
RUN cd services/shared && npm install --omit=dev
COPY services/job/package.json ./services/job/package.json
RUN cd services/job && npm install --omit=dev
COPY services/shared/src ./services/shared/src
COPY services/job/src ./services/job/src
WORKDIR /workspace/services/job
EXPOSE 8002
CMD ["npm", "start"]
