# NAVI API — use when CapRover “Repository path” / deploy root is Navi-backend only.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# CapRover’s nginx proxies to container:80 by default — match that to avoid 502.
EXPOSE 80
ENV PORT=80
CMD ["node", "dist/main.js"]
