---
name: docker-patterns
description: Docker best practices for Node.js TypeScript applications. Use when writing or modifying Dockerfiles, optimizing image size, or troubleshooting container issues.
license: MIT
metadata:
  author: smart-logistics
  version: "1.0.0"
---

# Docker Patterns

Best practices for containerizing this Node.js TypeScript application.

## Current Dockerfile Analysis

The project has a Dockerfile (Node 20 Alpine). Here are improvements and rules to follow.

## Dockerfile Rules

### 1. Use Specific Node Version

```dockerfile
# Good: specific version
FROM node:20-alpine

# Avoid: latest tag
FROM node:latest
```

### 2. Multi-Stage Builds (Recommended)

Separate build and runtime to reduce image size:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production=false
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/data ./data

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["npm", "run", "start"]
```

### 3. Security Hardening

```dockerfile
# Run as non-root user
USER nodejs

# Don't run as root
# Avoid: USER root

# Use distroless for extreme minimalism (advanced)
# FROM gcr.io/distroless/nodejs20-debian11
```

### 4. Layer Caching

Order Dockerfile commands by change frequency (least changing first):

```dockerfile
# 1. Base image (rarely changes)
FROM node:20-alpine

# 2. System dependencies (rarely changes)
RUN apk add --no-cache dumb-init

# 3. Package files (change when dependencies update)
COPY package*.json ./
RUN npm ci

# 4. Source code (changes frequently)
COPY . .
RUN npm run build
```

### 5. .dockerignore

Create a `.dockerignore` to reduce build context size:

```
node_modules
npm-debug.log
Dockerfile
.dockerignore
.git
.gitignore
README.md
.env
.env.local
dist
data
*.db
*.db-wal
*.db-shm
.vscode
.idea
```

### 6. Healthcheck Best Practices

```dockerfile
# Use wget (available in alpine) or curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/api/health || exit 1
```

**Parameters explained:**
- `interval=30s` — Check every 30 seconds
- `timeout=10s` — Wait up to 10 seconds for response
- `start-period=10s` — Grace period for app startup
- `retries=3` — Mark unhealthy after 3 failures

### 7. Signal Handling

Node doesn't handle SIGTERM correctly by default. Use `dumb-init` or `--init`:

```dockerfile
# Option 1: dumb-init in Dockerfile
RUN apk add --no-cache dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/index.js"]

# Option 2: docker run --init (in docker-compose or Coolify)
# init: true
```

### 8. Environment Variables

```dockerfile
# Set defaults, allow override at runtime
ENV PORT=3001
ENV NODE_ENV=production

# Don't hardcode secrets
# AVOID: ENV GEMINI_API_KEY=sk-...
```

### 9. Database Volume

For SQLite/libSQL, the data directory must be a volume:

```dockerfile
# Create and expose data directory
RUN mkdir -p /app/data
VOLUME ["/app/data"]
```

In docker-compose:
```yaml
volumes:
  - invoice-data:/app/data

volumes:
  invoice-data:
```

### 10. Image Size Optimization

```dockerfile
# Remove unnecessary files
RUN npm prune --production && \
    npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/*

# Use alpine variants (already doing this)
FROM node:20-alpine
```

## Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - PORT=3001
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Common Docker Issues

### Issue: Container exits immediately
**Cause:** Process crashed or port binding failed.
**Fix:** Check logs with `docker logs <container>`. Verify `PORT` env var.

### Issue: Changes not reflected
**Cause:** Using cached image layers.
**Fix:** Run `docker build --no-cache` or update a file earlier in Dockerfile.

### Issue: Permission denied on /app/data
**Cause:** Running as non-root but directory owned by root.
**Fix:** Ensure `mkdir -p /app/data` runs before `USER` directive, or chown the directory.

### Issue: Image too large
**Cause:** Including devDependencies, source maps, or build cache.
**Fix:** Use multi-stage build, `npm prune --production`, `npm cache clean --force`.

### Issue: Healthcheck fails
**Cause:** wget not installed or wrong URL.
**Fix:** Install wget in alpine: `apk add --no-cache wget`. Verify healthcheck URL.
