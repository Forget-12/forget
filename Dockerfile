# Paksa ARM64 native — jangan biarkan Docker tarik amd64 via QEMU
FROM --platform=linux/arm64 node:20-bullseye

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

# Dependensi sistem: OpenCV + Chromium (pengganti Chrome di ARM)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates xvfb procps \
    fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
    libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libxss1 libnss3 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libcups2 libdrm2 libxkbcommon0 libpangocairo-1.0-0 libpango-1.0-0 \
    libcairo2 libatspi2.0-0 libx11-xcb1 libxcb-dri3-0 libxshmfence1 \
    libglib2.0-0 libdbus-1-3 \
    python3 make g++ pkg-config cmake \
    libcairo2-dev libjpeg-dev libpng-dev libgif-dev librsvg2-dev \
    libopencv-dev \
    chromium \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p /app/endpoints /app/cache && chmod 777 /app/cache

COPY package*.json ./

# Build native modules (OpenCV, dll). Jangan pakai cache layer lama.
RUN npm install --omit=dev

COPY . .

# Chromium di Debian ARM64 ada di sini — bukan google-chrome
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

EXPOSE 7860

# xvfb-run otomatis: alloc display, jalankan cmd, cleanup saat keluar.
# Tidak ada Xvfb orphan, tidak perlu rm -f /tmp/.X99-lock manual.
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1024x768x24", "npm", "start"]
