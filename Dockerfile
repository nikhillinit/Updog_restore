# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app

# Security: run as non-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy dependency files
COPY package*.json ./

# Install only production dependencies initially
RUN npm ci --omit=dev && npm cache clean --force

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Install dev dependencies for build
RUN npm ci

# Copy source code
COPY . .

# Build with error checking and optimization
RUN npm run build && \
    npm run check && \
    npm prune --omit=dev

# ---- runtime ----
FROM node:20-alpine AS prod
WORKDIR /app

# Security hardening
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    apk add --no-cache dumb-init

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy built application
COPY --from=build --chown=nextjs:nodejs /app/dist ./dist
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/package*.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Security: switch to non-root user
USER nextjs

EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]