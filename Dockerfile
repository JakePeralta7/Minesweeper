# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /build
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter backend

COPY backend/ ./backend/
RUN pnpm --dir backend exec tsc -p tsconfig.json

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

# Install tini for proper signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Copy source code
COPY frontend/ ./frontend/

# Copy compiled backend output
COPY --from=deps /build/backend/dist ./backend/dist

# Copy pnpm virtual store used by backend/node_modules symlinks
COPY --from=deps /build/node_modules ./node_modules

# Copy backend dependencies
COPY --from=deps /build/backend/node_modules ./backend/node_modules

# Data directory for the SQLite database (mount a volume here)
RUN mkdir -p /data

ENV DB_PATH=/data/minesweeper.db

# Non-root user for security
RUN addgroup -S minesweeper && adduser -S minesweeper -G minesweeper \
    && chown -R minesweeper:minesweeper /app /data

USER minesweeper

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/dist/server.js"]
