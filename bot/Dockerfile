FROM node:22-slim

# Baileys is protocol-level (no browser), so none of the old Chromium/Chrome
# system libraries are needed. It does pull one dependency (libsignal) from a
# git URL, so `git` (+ ca-certificates for HTTPS) must be present at install.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY . .

CMD ["node", "bot.js"]
