FROM node:24-slim AS builder
WORKDIR /app

# OpenSSL is required by Prisma's query engine at install / generate time.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests first for better layer caching
COPY package*.json ./
COPY tsconfig.base.json ./
COPY backend/package*.json backend/
COPY backend/tsconfig.json backend/

# Copy Prisma schema so `prisma generate` can run during install.
COPY backend/prisma backend/prisma

# Copy backend source
COPY backend/src backend/src

# Install deps (postinstall hooks include prisma generate via @prisma/client,
# but we run it explicitly afterward to guarantee the engine is produced
# against the slim image's OpenSSL).
RUN npm ci
# Generate the Prisma client into node_modules/.prisma so the runner stage
# can copy it without needing the prisma CLI itself.
RUN cd backend && npx prisma generate
RUN npm run build -w @shetrades/backend

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Prisma's query engine binary needs OpenSSL at runtime too.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install runtime deps for backend workspace only
COPY package*.json ./
COPY backend/package*.json backend/
# Bring the schema into the runner too so any `prisma generate` triggered by
# install hooks has the file it expects, and so $executeRawUnsafe migrations
# / runtime tooling that resolves relative paths still works.
COPY backend/prisma backend/prisma
RUN npm ci --omit=dev -w @shetrades/backend --include-workspace-root=false

# Carry the generated Prisma client + engines from the builder so the runner
# image does not need the prisma CLI (which is a devDependency).
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client node_modules/@prisma/client

# Copy compiled backend output
COPY --from=builder /app/backend/dist backend/dist

# Copy seed config files
COPY docs/config-seeds docs/config-seeds

EXPOSE 8080
CMD ["node", "backend/dist/index.js"]
