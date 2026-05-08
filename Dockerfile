# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

# Install tini for proper signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Copy backend dependencies
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copy source code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Data directory for the SQLite database (mount a volume here)
RUN mkdir -p /data

# Non-root user for security
RUN addgroup -S minesweeper && adduser -S minesweeper -G minesweeper \
    && chown -R minesweeper:minesweeper /app /data

USER minesweeper

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/server.js"]
