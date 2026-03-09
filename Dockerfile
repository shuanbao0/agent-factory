# ---- Stage 1: Install dependencies ----
FROM node:22-slim AS deps

WORKDIR /app

# Root dependencies
COPY package.json package-lock.json* ./
RUN npm install

# UI dependencies
COPY ui/package.json ui/package-lock.json* ./ui/
RUN cd ui && npm ci

# ---- Stage 2: Build Next.js ----
FROM node:22-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/ui/node_modules ./ui/node_modules
COPY . .

ENV NODE_ENV=production
RUN cd ui && npm run build

# ---- Stage 3: Production runner ----
FROM node:22-slim AS runner

WORKDIR /app

# iproute2 provides `ss` command used by start.mjs killPort() on Linux
RUN apt-get update && apt-get install -y --no-install-recommends iproute2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV AGENT_FACTORY_DIR=/app

# Root dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# UI build output + dependencies
COPY --from=builder /app/ui/.next ./ui/.next
COPY --from=deps /app/ui/node_modules ./ui/node_modules
COPY ui/package.json ./ui/
COPY ui/next.config.js ./ui/

# Application files
COPY bin/ ./bin/
COPY scripts/ ./scripts/
COPY skills/ ./skills/
COPY templates/builtin/ ./templates/builtin/

# Config defaults (entrypoint will initialize volume from these)
COPY config/ ./config-defaults/

# Ensure directories exist for volume mounts
RUN mkdir -p config agents workspaces projects templates/custom .openclaw-state

# Entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3100 19100

ENTRYPOINT ["./docker-entrypoint.sh"]
