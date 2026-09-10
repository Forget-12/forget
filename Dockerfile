FROM node:20-bullseye

RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libatspi2.0-0 \
    libxfixes3 libdrm2 libxcb1 \
    && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt install -y ./google-chrome-stable_current_amd64.deb \
    && rm google-chrome-stable_current_amd64.deb \
    && apt clean

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
