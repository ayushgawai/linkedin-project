FROM node:20-alpine
WORKDIR /workspace
COPY services/profile/package.json ./services/profile/package.json
RUN cd services/profile && npm install --omit=dev
COPY services/profile/src ./services/profile/src
COPY services/shared/src ./services/shared/src
WORKDIR /workspace/services/profile
EXPOSE 8001
CMD ["npm", "start"]
