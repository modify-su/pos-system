# Multi-stage Dockerfile for POS & Warehouse System
# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Server
FROM node:20-alpine
WORKDIR /app

# Install production dependencies for backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend assets to backend public directory or serve via static Express
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Volumes for persistent database and file uploads
VOLUME ["/app/backend/data", "/app/uploads"]

EXPOSE 3001

CMD ["node", "backend/src/index.js"]
