# app/Dockerfile

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm

# Install dependencies — copy root lockfile + app package.json
COPY pnpm-lock.yaml ./
COPY app/package.json ./
RUN pnpm install --no-frozen-lockfile

# Copy app source and build
COPY app/ .

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
COPY app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
