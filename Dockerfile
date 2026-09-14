# Multi-stage Dockerfile for POS & Warehouse System

# Stage 1: Build Frontend SPA
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend & Compile Native Modules (sqlite3)
FROM node:20-slim AS backend-builder
WORKDIR /app/backend
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
 && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm install --omit=dev --build-from-source=sqlite3
COPY backend/ ./

# Stage 3: Clean Production Runtime
FROM node:20-slim
WORKDIR /app

# Copy compiled backend and modules from Stage 2
COPY --from=backend-builder /app/backend ./backend

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "backend/src/index.js"]
