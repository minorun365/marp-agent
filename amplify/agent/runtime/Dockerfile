# ECR Public Galleryを使用（Docker Hubのレート制限を回避）
FROM --platform=linux/arm64 public.ecr.aws/docker/library/python:3.13-slim-bookworm

WORKDIR /app

# Node.js、Chromium、日本語フォントをインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    chromium \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

# Marp CLI をインストール
RUN npm install -g @marp-team/marp-cli

# Puppeteer の Chromium パス設定
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Python 依存関係をインストール
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# エージェントコードとテーマをコピー
COPY agent.py ./
COPY border.css ./

EXPOSE 8080

CMD ["python", "agent.py"]
