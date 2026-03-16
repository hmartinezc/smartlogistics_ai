FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config.ts ./config.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/services ./services
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/types.ts ./types.ts
RUN mkdir -p /app/data
EXPOSE 3001
CMD ["npm", "run", "start"]
