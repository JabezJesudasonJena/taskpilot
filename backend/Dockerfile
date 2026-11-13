# Development target
FROM node:22-bookworm-slim AS dev

WORKDIR /app

RUN apt-get update && apt-get install -y openssl procps && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

RUN npx prisma generate

COPY . .

CMD ["npm", "run", "start:dev"]

# Build target for production
FROM dev AS build

RUN npm run build
RUN npm prune --omit=dev

# Production target
FROM node:22-bookworm-slim AS prod

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
