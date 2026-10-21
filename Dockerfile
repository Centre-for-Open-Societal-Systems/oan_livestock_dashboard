# Registry dashboard: Next.js standalone server (UI + its own /api).
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Map boundaries are read from disk at runtime (app/api/maps, server/boundaries.ts).
COPY --from=build --chown=node:node /app/public ./public
# Location catalog behind the filters (server/geo-catalog.ts).
COPY --from=build --chown=node:node /app/data ./data
# IAM self-registration (tile + role catalog), run as a one-shot job:
#   node iam/register.mjs
COPY --from=build --chown=node:node /app/iam ./iam
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
