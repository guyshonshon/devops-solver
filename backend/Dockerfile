FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git \
    # Playwright Chromium runtime dependencies
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
    libasound2 libx11-6 libxcomposite1 libxdamage1 libxrandr2 libxfixes3 \
    libpangocairo-1.0-0 libcairo2 libcups2 libdbus-1-3 libxss1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium only.
# System deps are already installed above; `--with-deps` tries Ubuntu packages
# that are unavailable on Debian trixie/arm64.
RUN playwright install chromium

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
