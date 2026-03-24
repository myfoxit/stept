<div align="center">

# stept

### Record. Guide. Automate.

**The open-source digital adoption platform.** Record workflows once — get interactive guides, onboarding checklists, and browser automation from the same recording.

The open-source alternative to **WalkMe**, **Whatfix**, **Pendo**, **Appcues**, and **Userflow**.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-compose-blue.svg)](docker-compose.yml)
[![pip](https://img.shields.io/badge/pip%20install-stept-orange.svg)](packages/stept-engine/)

[Website](https://stept.dev) · [Docs](https://docs.stept.dev) · [Discord](https://discord.gg/stept) · [Demo →](#demo)

</div>

---

## What is stept?

stept is a **digital adoption platform** that helps your team create and deliver interactive process guides. Record a workflow by doing it — stept turns it into:

- 🎯 **Interactive walkthroughs** — Step-by-step guides that highlight UI elements and guide users through processes
- 📋 **Documentation** — Auto-generated step-by-step guides with screenshots
- 🤖 **Browser automation** — The same recording replays itself (coming soon)
- 🧪 **Interactive sandbox** — Users practice on a replica of the real app
- 🔍 **AI-powered search** — Find the right guide instantly with semantic search

**One recording. Five outputs.** No code required.

## Why stept?

| | WalkMe | Whatfix | Pendo | stept |
|---|---|---|---|---|
| **Open source** | ❌ | ❌ | ❌ | ✅ |
| **Self-hosted** | ❌ | ❌ | ❌ | ✅ |
| **Record workflows** | ✅ | ✅ | ❌ | ✅ |
| **Interactive guides** | ✅ | ✅ | ✅ | ✅ |
| **Self-healing selectors** | ✅ | ✅ | ❌ | ✅ |
| **Interactive sandbox** | ❌ | ❌ | ❌ | ✅ |
| **Video-to-guide** | ❌ | ❌ | ❌ | ✅ |
| **AI chat with docs** | ❌ | ❌ | ❌ | ✅ |
| **MCP server** | ❌ | ❌ | ❌ | ✅ |
| **JS embed** | ✅ | ✅ | ✅ | ✅ |
| **Analytics** | ✅ | ✅ | ✅ | ✅ |
| **Checklists** | ✅ | ✅ | ✅ | ✅ |
| **Tooltips & beacons** | ✅ | ✅ | ✅ | ✅ |
| **Browser automation** | ✅ | ❌ | ❌ | ✅ |
| **Price** | $200K+/yr | $100K+/yr | $50K+/yr | **Free** |

## Features

### 🎬 Record Workflows
Record any process with the Chrome extension or desktop app. Click through your workflow — stept captures every step with screenshots, element selectors, and DOM snapshots.

### 🎯 Interactive Guides
Deploy step-by-step walkthroughs on any website. The guide highlights the target element, shows instructions, and advances when the user completes each step.

**Multi-selector reliability:** Each element is recorded with 6-9 CSS selectors using different strategies. If one breaks after an app update, the others still work.

### 📦 Embed Anywhere
Add stept to any web app with one script tag:
```html
<script src="https://your-stept.com/widget/stept-widget.js" 
        data-project="proj_xxx" data-api-key="pk_xxx" async></script>
```

### 🧪 Interactive Sandbox
Users practice on a replica of the real app built from DOM snapshots. Click the right elements to advance — wrong clicks show hints. No risk to production data.

### 🤖 AI-Powered
- **Auto-annotation:** AI generates step titles, descriptions, and tags
- **Semantic search:** Find guides with natural language
- **AI chat:** Ask questions about your processes
- **Self-healing:** When selectors break, AI finds the element automatically
- **MCP server:** AI agents query your process knowledge

### 📊 Analytics
Track guide engagement: views, completion rates, step drop-offs, time-per-step. Know which guides work and where users get stuck.

### 📋 Onboarding Checklists
Create task lists that guide new users through setup. Each task links to a guide. Progress persists across sessions.

### 🔔 Tooltips & Beacons
Add contextual help to any element. Pulsating beacons draw attention to new features. Tooltips show help text on hover.

## Quick Start

### Self-Hosted (Docker)

```bash
git clone https://github.com/stept-dev/stept.git
cd stept
cp .env.example .env
docker compose up -d
```

Visit `http://localhost:3000` to start.

### Chrome Extension

Install from the Chrome Web Store (coming soon) or load the `extension/dist` folder as an unpacked extension.

### Python SDK (automation)

```bash
pip install stept
```

```python
from stept import Agent

agent = Agent(
    task="Create a new contact in Salesforce",
    url="https://your-org.salesforce.com",
)
result = await agent.run()
# First run: AI figures it out (like browser-use)
# Second run: instant replay from recording — 100x faster, $0 cost
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    stept Platform                        │
│                                                         │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐ │
│  │ Recorder │  │  Editor  │  │ Guides  │  │Analytics │ │
│  │ (Chrome) │  │ (TipTap) │  │ (embed) │  │Dashboard │ │
│  └────┬─────┘  └────┬─────┘  └────┬────┘  └────┬─────┘ │
│       │              │             │             │       │
│  ┌────┴──────────────┴─────────────┴─────────────┴────┐ │
│  │              FastAPI Backend                        │ │
│  │  PostgreSQL + pgvector │ Redis │ Celery             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  MCP Server  │  │ Python SDK   │  │ JS Widget     │  │
│  │  (AI agents) │  │ (automation) │  │ (embed)       │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Integrations

- **Slack** — Search and surface guides from Slack
- **Microsoft Teams** — Surface guides in Teams channels
- **Intercom** — Push guides to Fin AI + AI Copilot
- **MCP** — Expose guides to Claude, Cursor, Copilot
- **Git Sync** — Export guides as Markdown to GitHub/GitLab

## Tech Stack

| Component | Technology |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy, Celery |
| Frontend | React, TypeScript, Vite, TipTap, Tailwind |
| Extension | Chrome Manifest V3, TypeScript, Vite |
| Desktop | Electron, React |
| Database | PostgreSQL 16 + pgvector |
| Search | Hybrid: full-text + semantic (RRF fusion) |
| AI | OpenAI, Anthropic, Ollama (configurable) |
| Infra | Docker Compose, Caddy, Redis |

## Roadmap

- [x] Chrome extension recorder
- [x] Desktop app recorder (macOS + Windows)
- [x] Interactive guide runtime
- [x] Interactive sandbox (Try-it mode)
- [x] Document editor (TipTap)
- [x] AI auto-annotation
- [x] Semantic search
- [x] MCP server
- [x] Video-to-guide
- [x] Multi-selector element capture
- [x] JS embed widget
- [x] Slack + Teams + Intercom integrations
- [x] Python automation SDK
- [ ] Self-healing with LLM fallback
- [ ] Analytics dashboard UI
- [ ] User segmentation & targeting
- [ ] Playwright test export
- [ ] Community workflow library

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT — use it for anything.

## Star History

If you find stept useful, please ⭐ this repo — it helps others discover it.

---

<div align="center">

**[Get Started →](https://docs.stept.dev/quickstart)** · **[Join Discord →](https://discord.gg/stept)** · **[Follow on X →](https://x.com/steptdev)**

Built with ❤️ for teams tired of paying $200K/year for WalkMe.

</div>
