FROM --platform=linux/arm64 python:3.13-slim-bookworm

WORKDIR /app

# Node.js と Chromium をインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Marp CLI をインストール
RUN npm install -g @marp-team/marp-cli

# Puppeteer の Chromium パス設定
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Python 依存関係をインストール
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# エージェントコードをコピー
COPY agent.py ./

EXPOSE 8080

CMD ["python", "agent.py"]
