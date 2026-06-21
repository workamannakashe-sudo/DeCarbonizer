# ──────────────────────────────────────────────────────────────────
# Stage 1: dependency installation (cached layer)
# ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

# Copy only the manifest first so Docker can cache the npm install
# layer independently of application source changes.
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

# ──────────────────────────────────────────────────────────────────
# Stage 2: production image
# ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Create a non-root user for least-privilege execution
RUN groupadd --system appgroup && \
    useradd  --system --gid appgroup --no-create-home appuser

WORKDIR /app

# Copy only what is needed from the deps stage (no dev tools)
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (respects .dockerignore)
COPY --chown=appuser:appgroup . .

# Switch to non-root user before starting the process
USER appuser

# Expose the port declared in the application
EXPOSE 8080

# Healthcheck: ensure the server is responding within 30 s
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "server.js"]
