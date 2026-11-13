# TRONostr: always-on watcher + JSON API + dashboard.
# node:sqlite needs Node >= 22.13; the node:22 image tracks the latest 22.x.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    TRONOSTR_API_HOST=0.0.0.0 \
    TRONOSTR_API_PORT=8788 \
    TRONOSTR_DB_PATH=/data/tronostr.db \
    TRONOSTR_CHECKPOINT_PATH=/data/checkpoints.json \
    TRONOSTR_CONFIG=/app/config.yaml
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY config.yaml ./config.yaml
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.TRONOSTR_API_PORT||8788)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Secrets (TRON_PRO_API_KEY, TRONOSTR_PUBLISHER_KEY) are passed at runtime, never baked in.
CMD ["node", "dist/index.js"]
