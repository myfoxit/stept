# app/Dockerfile

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .

# IMPORTANT: During build, we set the API URL to empty/relative
# because Nginx will handle the proxying at runtime.
ENV VITE_API_URL="" 
ENV VITE_API_BASE_URL="/api/v1"

RUN pnpm build

# --- Stage 2: Serve ---
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]