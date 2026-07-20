FROM node:22-slim

# Baileys is protocol-level (no browser), so none of the old Chromium/Chrome
# system libraries are needed — the image is much smaller and lighter.
WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY . .

CMD ["node", "bot.js"]
