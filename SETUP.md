# Ondoki Production Setup

Complete guide to deploying Ondoki on a Hetzner server behind Cloudflare.

## Server Requirements

- Any Linux VPS (tested on Rocky Linux / Hetzner Cloud ARM)
- 2+ GB RAM, 2+ vCPU recommended
- Docker + Docker Compose plugin
- Ports 80 and 443 open

## 1. Server Preparation

### Install Docker (Rocky Linux / RHEL)

```bash
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

### Install Docker (Ubuntu/Debian)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### Create deploy directory

```bash
sudo mkdir -p /opt/ondoki/certs
sudo chown $USER:$USER /opt/ondoki
```

## 2. Cloudflare Setup

### DNS

- Add an A record: `app.ondoki.io` → your server IP
- Proxy status: **Proxied** (orange cloud on)

### Origin Certificate (for end-to-end TLS)

1. Go to **SSL/TLS → Origin Server → Create Certificate**
2. Settings: RSA, 15 years, hostnames: `*.ondoki.io, ondoki.io`
3. Copy the **certificate** and **private key**
4. On the server:

```bash
nano /opt/ondoki/certs/origin.pem        # paste the certificate
nano /opt/ondoki/certs/origin-key.pem    # paste the private key
chmod 600 /opt/ondoki/certs/origin-key.pem
```

### SSL Mode

- **SSL/TLS → Overview → Full (strict)**

This means: visitors → HTTPS → Cloudflare → HTTPS → your server (verified origin cert). End-to-end encrypted.

### Recommended Cloudflare settings

- SSL/TLS → Edge Certificates → Always Use HTTPS: **On**
- SSL/TLS → Edge Certificates → Minimum TLS Version: **1.2**
- Speed → Optimization → Auto Minify: off (Caddy handles this)

## 3. GitHub Secrets

Go to **repo → Settings → Secrets and variables → Actions** and create:

### Server / SSH

| Secret | Example | Description |
|--------|---------|-------------|
| `DEPLOY_HOST` | `89.167.102.235` | Server IP address |
| `DEPLOY_USER` | `hoehne` | SSH username |
| `DEPLOY_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY...` | Full private key for SSH |
| `DEPLOY_PATH` | `/opt/ondoki` | Deploy directory on server |

### Container Registry (for server to pull private images)

| Secret | Example | Description |
|--------|---------|-------------|
| `GHCR_USER` | `myfoxit` | GitHub username or org |
| `GHCR_TOKEN` | `ghp_...` | PAT with `read:packages` + `write:packages` |

### Application

| Secret | How to generate | Description |
|--------|----------------|-------------|
| `DOMAIN` | `app.ondoki.io` | Your domain (used by Caddy) |
| `POSTGRES_USER` | `ondoki` | Database username |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` | Database password |
| `REDIS_PASSWORD` | `openssl rand -hex 16` | Redis password |
| `JWT_SECRET` | `openssl rand -hex 32` | JWT signing key |
| `ONDOKI_ENCRYPTION_KEY` | `openssl rand -hex 32` | Data encryption key |
| `FRONTEND_URL` | `https://app.ondoki.io` | Public URL |
| `CORS_ORIGINS` | `https://app.ondoki.io` | Allowed CORS origins |

### Optional — Media Worker

| Secret | Description |
|--------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for Whisper transcription (video → guide) |

### Optional — Email (SMTP)

| Secret | Example | Description |
|--------|---------|-------------|
| `SR_SMTP_HOST` | `smtp.mailgun.org` | SMTP server |
| `SR_SMTP_PORT` | `587` | SMTP port |
| `SR_SMTP_USER` | `postmaster@mg.ondoki.com` | SMTP username |
| `SR_SMTP_PASS` | (password) | SMTP password |
| `SR_FROM_EMAIL` | `noreply@ondoki.com` | Sender address |

## 4. First Deploy

### Option A: GitHub Actions (recommended)

1. Go to **Actions → Deploy to Production → Run workflow**
2. Select environment: `production`
3. Enable/disable media worker as needed
4. The workflow will:
   - Build multi-arch images (amd64 + arm64)
   - Push to GHCR
   - SCP docker-compose.prod.yml + Caddyfile to server
   - Pull images, start services, run migrations
   - Verify health

### Option B: Manual first deploy

If you want to deploy manually the first time:

```bash
cd /opt/ondoki

# Create .env
cat > .env << 'EOF'
DOMAIN=app.ondoki.io
POSTGRES_USER=ondoki
POSTGRES_PASSWORD=<generate with: openssl rand -hex 24>
POSTGRES_DB=ondoki
REDIS_PASSWORD=<generate with: openssl rand -hex 16>
JWT_SECRET=<generate with: openssl rand -hex 32>
ONDOKI_ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
FRONTEND_URL=https://app.ondoki.io
CORS_ORIGINS=https://app.ondoki.io
OPENAI_API_KEY=<optional, for video transcription>
WHISPER_MODEL=base
SR_SMTP_HOST=
SR_SMTP_PORT=587
SR_SMTP_USER=
SR_SMTP_PASS=
SR_FROM_EMAIL=noreply@ondoki.com
EOF

chmod 600 .env

# Login to GHCR (for private images)
echo "YOUR_PAT" | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# Pull and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Run migrations
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head

# Check status
docker compose -f docker-compose.prod.yml ps
```

## 5. Deploy Workflow Options

The GitHub Actions workflow (`deploy.yml`) supports:

- **Environment**: `production` or `staging`
- **Media worker toggle**: enable/disable the video-to-guide worker
- **Trigger**: manual dispatch or push a `v*` tag

### Without media worker

If you don't need video → guide conversion, deploy with media worker disabled. This saves ~500MB RAM.

### With media worker

Requires `OPENAI_API_KEY` for cloud transcription, or you can enable local Whisper in the video-worker Dockerfile (uncomment the whisper install line — adds ~1GB to the image).

## 6. Architecture

```
Internet → Cloudflare (TLS termination + CDN)
    → :443 → Caddy (TLS with origin cert)
        → /api/* → backend:8000 (FastAPI/Uvicorn)
        → /*     → frontend:80  (Nginx serving Vite build)
    
    backend → PostgreSQL (pgvector)
    backend → Redis (sessions, WebSocket pub/sub, Celery broker)
    backend → Gotenberg (PDF export)
    media-worker → Redis (Celery) → processes video/media jobs
```

## 7. Maintenance

### View logs

```bash
cd /opt/ondoki
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f media-worker
docker compose -f docker-compose.prod.yml logs --tail=100
```

### Database backup

```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U ondoki ondoki | gzip > backup-$(date +%Y%m%d).sql.gz
```

### Database restore

```bash
gunzip -c backup-20260301.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U ondoki ondoki
```

### Update .env on server

The .env is only written on first deploy. After that, edit it directly:

```bash
nano /opt/ondoki/.env
docker compose -f docker-compose.prod.yml up -d  # restart to pick up changes
```

### Restart a single service

```bash
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart caddy
```

### Full redeploy

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head
```

## 8. Firewall

Recommended firewall rules:

```bash
# Rocky Linux (firewalld)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh    # restrict to your IP if possible
sudo firewall-cmd --reload

# Or with ufw (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow ssh
sudo ufw enable
```

For SSH security: restrict to your IP or use Hetzner's cloud firewall to limit SSH access. The GitHub Actions deploy needs SSH access — either temporarily whitelist the runner IP via Hetzner API, or keep SSH open and use key-only auth (disable password auth).

## 9. Moving to a New Server

1. Backup the database (see above)
2. Copy `/opt/ondoki/.env` and `/opt/ondoki/certs/` to the new server
3. Install Docker on the new server
4. Update `DEPLOY_HOST` secret in GitHub to the new IP
5. Update Cloudflare DNS A record to the new IP
6. Run the deploy workflow
7. Restore the database backup
