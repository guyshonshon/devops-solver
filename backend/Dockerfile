FROM python:3.11-slim

WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git \
    # Playwright Chromium runtime dependencies
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
    libasound2 libx11-6 libxcomposite1 libxdamage1 libxrandr2 libxfixes3 \
    libpangocairo-1.0-0 libcairo2 libcups2 libdbus-1-3 libxss1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x /app/start-backend.sh

EXPOSE 8000

CMD ["/app/start-backend.sh"]
