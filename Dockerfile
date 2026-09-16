FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=2567
EXPOSE 2567

CMD ["node", "src/server/main.ts"]
