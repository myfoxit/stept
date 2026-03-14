# Stept

**Open-source process documentation platform.** Capture, document, and share step-by-step guides — self-hosted or cloud.

> Think Scribe/Tango, but open-source and self-hosted.

🌐 [stept.ai](https://stept.ai) · 📖 [Docs](https://docs.stept.ai) · 🐛 [Issues](https://github.com/myfoxit/stept/issues)

---

## What's in the box

| Package | Description | Stack |
|---------|-------------|-------|
| [`api/`](./api) | Backend API | Python · FastAPI · PostgreSQL · SQLAlchemy |
| [`app/`](./app) | Web frontend | React · TypeScript · Vite · TanStack Query · shadcn/ui |
| [`desktop/`](./desktop) | Desktop app | Electron · React · TypeScript |
| [`extension/`](./extension) | Chrome extension | Chrome Manifest V3 |
| [`packages/shared/`](./packages/shared) | Shared types & constants | TypeScript |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Node.js](https://nodejs.org/) ≥ 20
- [pnpm](https://pnpm.io/) ≥ 10

### Run the full stack

```bash
git clone https://github.com/myfoxit/stept.git
cd stept
docker compose up -d
pnpm install
cd app && pnpm dev
```

The web app will be available at `http://localhost:5173` and the API at `http://localhost:8000`.

### Desktop app

```bash
cd desktop
npm install
npm run dev:electron
```

### Chrome extension

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension/` directory

## Architecture

```
Browser Extension ──captures──→ API ←──serves──→ Web App
Desktop App ────records────────↗
```

## Self-Hosting

```bash
cp .env.example .env
# Edit .env with your settings
docker compose -f docker-compose.prod.yml up -d
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
