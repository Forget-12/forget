FROM node:20-bullseye

# Install ALL dependencies untuk OpenCV + Chrome
RUN rm -rf /var/lib/apt/lists/* && \
    apt clean && \
    apt update -o Acquire::Retries=5 -o Acquire::http::Pipeline-Depth=0 && \
    apt install -y --no-install-recommends \
        -o Acquire::Retries=10 \
        -o Acquire::http::Timeout=60 \
        wget gnupg ca-certificates xvfb \
        fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
        libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
        libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 \
        libxrandr2 libxshmfence1 && \
    apt clean && rm -rf /var/lib/apt/lists/*


WORKDIR /app

RUN mkdir -p /app/endpoints && \
    mkdir -p /app/cache

COPY package*.json ./

# Install OpenCV dengan build from source
RUN npm install

COPY . .

EXPOSE 7860

CMD rm -f /tmp/.X99-lock && \
    Xvfb :99 -screen 0 1024x768x24 & \
    export DISPLAY=:99 && \
    npm start
