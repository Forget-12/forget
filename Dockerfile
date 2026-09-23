# syntax=docker/dockerfile:1.6

FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Chromium otomatis menarik semua runtime deps-nya.
# Hanya 5 paket — sisanya transitif dari apt.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    xauth \
    ca-certificates \
    fonts-liberation \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /root/.cache

WORKDIR /app

RUN mkdir -p /app/cache

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force \
 && rm -rf /root/.npm /tmp/*

COPY . .

CMD ["xvfb-run", "-a", "--server-args=-screen 0 1024x768x24", "node", "index.js"]
