FROM node:20-alpine
WORKDIR /workspace
COPY services/shared/package.json ./services/shared/package.json
RUN cd services/shared && npm install --omit=dev
COPY services/application/package.json ./services/application/package.json
RUN cd services/application && npm install --omit=dev
COPY services/shared/src ./services/shared/src
COPY services/application/src ./services/application/src
WORKDIR /workspace/services/application
EXPOSE 8003
CMD ["npm", "start"]
