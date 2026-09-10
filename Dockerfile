FROM node:20-slim

# Install dependensi sistem untuk Chromium (Playwright)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json dulu biar caching npm lebih cepat
COPY package*.json ./
RUN npm install

# Install Chromium via Playwright (otomatis handle semua dependensi)
RUN npx playwright install chromium

# Copy sisa kode
COPY . .

# Set CHROME_PATH ke Chromium bawaan Playwright
ENV CHROME_PATH=/root/.cache/ms-playwright/chromium-*/chrome-linux/chrome

EXPOSE 7860

CMD ["node", "index.js"]
