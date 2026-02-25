# Deployment Guide

## Prerequisites

- **Docker** ≥ 24.0 and **Docker Compose** ≥ 2.20
- A domain name with DNS pointing to your server (A record)
- A server with at least 2 GB RAM (Hetzner CX21 or similar)

## Quick Deploy

```bash
# 1. Clone and configure
git clone https://github.com/myfoxit/ondoki-web.git /opt/ondoki
cd /opt/ondoki
cp .env.example .env

# 2. Generate secrets
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "ONDOKI_ENCRYPTION_KEY=$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" >> .env

# 3. Edit .env — set at minimum:
#    DOMAIN=app.yourdomain.com
#    POSTGRES_PASSWORD=<strong-password>
#    REDIS_PASSWORD=<strong-password>
#    FRONTEND_URL=https://app.yourdomain.com
#    CORS_ORIGINS=https://app.yourdomain.com
#    ALLOWED_ORIGINS=https://app.yourdomain.com
#    ENVIRONMENT=production

# 4. Start everything
docker compose -f docker-compose.prod.yml up -d

# 5. Run database migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

## HTTPS via Caddy

The production compose includes a **Caddy** reverse proxy that automatically provisions TLS certificates via Let's Encrypt.

### How the Caddyfile works

```
{$DOMAIN:localhost} {
    handle /api/* {
        reverse_proxy backend:8000 {
            flush_interval -1    # enables SSE streaming
        }
    }
    handle {
        reverse_proxy frontend:80
    }
}
```

- `{$DOMAIN}` is read from the `DOMAIN` environment variable in `.env`
- Caddy automatically obtains and renews HTTPS certificates when `DOMAIN` is a real domain
- All HTTP traffic is redirected to HTTPS
- API requests (`/api/*`) are proxied to the backend; everything else to the frontend
- `flush_interval -1` ensures Server-Sent Events (SSE) for AI chat streaming work correctly

### DNS Setup

Point your domain to your server:
```
A    app.yourdomain.com    → <server-ip>
```

Caddy will automatically obtain a certificate once DNS propagates (usually < 5 minutes).

## S3 / Object Storage

Ondoki supports local file storage or S3-compatible object storage.

### Local Storage (default)

Files are stored in Docker volumes (`file-storage`, `uploads`). This is fine for single-server deployments.

### S3-Compatible Storage (MinIO or AWS)

Set these in `.env`:

```bash
storage_type=s3
S3_BUCKET=ondoki-uploads
S3_REGION=eu-central-1
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
# For AWS:
S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
# For MinIO:
# S3_ENDPOINT=https://minio.yourdomain.com
```

#### Self-hosted MinIO

Add to your `docker-compose.prod.yml`:

```yaml
minio:
  image: minio/minio
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: ${S3_ACCESS_KEY}
    MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY}
  volumes:
    - minio-data:/data
  networks:
    - ondoki-network
```

Then set `S3_ENDPOINT=http://minio:9000` in your backend environment.

## Email (SMTP)

Email is used for account verification and password reset. Configure in `.env`:

```bash
SR_SMTP_HOST=smtp.mailgun.org    # or smtp.gmail.com, smtp.sendgrid.net, etc.
SR_SMTP_PORT=587
SR_SMTP_USER=your-smtp-user
SR_SMTP_PASS=your-smtp-password
SR_FROM_EMAIL=noreply@yourdomain.com
```

### Popular SMTP Providers

| Provider | Host | Port | Notes |
|----------|------|------|-------|
| Mailgun | smtp.mailgun.org | 587 | Free tier: 5k emails/month |
| SendGrid | smtp.sendgrid.net | 587 | Free tier: 100 emails/day |
| AWS SES | email-smtp.{region}.amazonaws.com | 587 | Cheap at scale |
| Gmail | smtp.gmail.com | 587 | Use App Password |

If SMTP is not configured, the app works normally — email verification and password reset will silently fail (users can still log in).

## SendCloak / PII Protection (Optional)

SendCloak obfuscates personally identifiable information (PII) before sending text to AI providers.

### Enable SendCloak

```bash
# In .env
SENDCLOAK_ENABLED=true

# Start with the privacy profile
docker compose -f docker-compose.prod.yml --profile privacy up -d
```

This starts:
- **Presidio** — Microsoft's PII detection engine
- **SendCloak** — Obfuscation proxy that wraps Presidio

If SendCloak is not running but `SENDCLOAK_ENABLED=true`, AI features gracefully fall back to sending text without obfuscation (logged as a warning).

### Language Support

Set `PRESIDIO_LANG_PACK` in `.env`:
- `en` — English only (smaller, faster)
- `eu` — English + German + French + Spanish + Italian

## Monitoring

### Health Checks

All services have Docker health checks. Verify with:

```bash
docker compose -f docker-compose.prod.yml ps
```

The backend exposes `GET /health` which checks database and Redis connectivity.

### Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend
```

## Backups

### Database

```bash
# Dump
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%Y%m%d).sql

# Restore
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U $POSTGRES_USER $POSTGRES_DB < backup.sql
```

### Volumes

```bash
# List volumes
docker volume ls | grep ondoki

# Back up a volume
docker run --rm -v ondoki-web_db-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/db-data.tar.gz -C /data .
```

## Updating

```bash
cd /opt/ondoki
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

Or use the GitHub Actions deploy workflow for automated deployments.
