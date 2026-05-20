FROM node:24-slim AS builder
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package*.json ./
COPY tsconfig.base.json ./
COPY backend/package*.json backend/
COPY backend/tsconfig.json backend/

# Copy backend source
COPY backend/src backend/src

# Install deps and compile backend TypeScript
RUN npm ci
RUN npm run build -w @shetrades/backend

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Install runtime deps for backend workspace only
COPY package*.json ./
COPY backend/package*.json backend/
RUN npm ci --omit=dev -w @shetrades/backend --include-workspace-root=false

# Copy compiled backend output
COPY --from=builder /app/backend/dist backend/dist

# Copy seed config files
COPY docs/config-seeds docs/config-seeds

EXPOSE 8080
CMD ["node", "backend/dist/index.js"]
