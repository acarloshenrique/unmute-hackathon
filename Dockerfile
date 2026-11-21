FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV CARECIRCLE_DB_PATH=/data/carecircle.sqlite
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
# Publique a porta somente em 127.0.0.1 para a demonstração.
CMD ["node","node_modules/next/dist/bin/next","start","--hostname","0.0.0.0"]
