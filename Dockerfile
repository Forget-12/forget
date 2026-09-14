FROM node:20-bullseye

# Install ALL dependencies untuk OpenCV + Chrome
RUN apt update && apt install -y \
    wget gnupg ca-certificates xvfb xauth \
    fonts-liberation fonts-noto-color-emoji \
    libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libxss1 libnss3 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libx11-xcb1 libxcursor1 libxi6 libxtst6 libdrm2 \
    python3 make g++ pkg-config cmake \
    libcairo2-dev libjpeg-dev libpng-dev libgif-dev librsvg2-dev \
    libopencv-dev \
    && wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
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
