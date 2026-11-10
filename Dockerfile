FROM node:22-bookworm-slim

WORKDIR /app

# Install native build dependencies for better-sqlite3 if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests and tsconfig first for optimal Docker layer caching
COPY package*.json tsconfig.json ./

# Install all dependencies (including build toolchain)
RUN npm install

# Copy application source across shared, server, client, and public
COPY shared ./shared
COPY server ./server
COPY client ./client
COPY public ./public
COPY PRD.md ./PRD.md

# Build TypeScript server and bundle 3D client
RUN npm run build

# Ensure persistent SQLite WAL data directory exists
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server/index.js"]
