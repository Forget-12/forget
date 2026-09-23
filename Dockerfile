# =========================================================
# STAGE 1: BUILDER — compile canvas & native modules
# =========================================================
FROM --platform=linux/arm64 node:20-bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Build deps untuk canvas: python, compiler, dan dev headers
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force \
 && rm -rf /root/.npm /tmp/*


# =========================================================
# STAGE 2: RUNTIME — hanya binary + deps runtime
# =========================================================
FROM --platform=linux/arm64 node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Chromium + Xvfb + library RUNTIME yang dibutuhkan canvas (bukan -dev)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    ca-certificates \
    fonts-liberation \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# Copy node_modules dari builder (sudah termasuk canvas.node hasil compile)
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY . .

RUN mkdir -p /app/cache

EXPOSE 7860

CMD ["xvfb-run", "-a", "--server-args=-screen 0 1024x768x24", "npm", "start"]
