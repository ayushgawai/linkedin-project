FROM node:20-alpine
WORKDIR /workspace
COPY services/application/package.json ./services/application/package.json
RUN cd services/application && npm install --omit=dev
COPY services/application/src ./services/application/src
COPY services/shared/src ./services/shared/src
WORKDIR /workspace/services/application
EXPOSE 8003
CMD ["npm", "start"]
