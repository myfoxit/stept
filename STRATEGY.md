# Ondoki — Product Strategy & Launch Plan

> Last updated: 2026-03-01

---

## What Ondoki Is

**Ondoki is an open-source platform for capturing, editing, and sharing process documentation.**

Think **Scribe/Tango meets Notion meets internal knowledge base** — self-hostable, AI-powered, and free.

- Chrome extension + desktop app record clicks, keystrokes, and screenshots
- AI auto-annotates each step into a polished guide
- Rich editor for refining, collaborating, and publishing
- Hybrid search (full-text + semantic vectors) across everything
- MCP server lets AI assistants (Claude, Cursor, Copilot) query your docs

---

## Feature Audit

### 🟢 Core — Ship and Promote

| Feature | Why It Matters |
|---------|----------------|
| **Workflow Recording** (Chrome + Desktop) | This IS the product. Click-by-click capture with screenshots is the hook |
| **Rich Editor** | Necessary for editing captured guides. Well built (TipTap, slash commands, drag-and-drop) |
| **AI Annotation** | Auto-describing steps is the magic. Turns 10 min of writing into 30 seconds |
| **Video Import → Guide** | Killer feature. Upload a Loom/screen recording → get a step-by-step guide |
| **Hybrid Search** | Full-text + vector + trigram fuzzy. Real differentiator vs. Google Docs/Confluence |
| **Team/Projects/RBAC** | Table stakes for teams. Already solid (Owner → Admin → Editor → Member → Viewer) |
| **Public Sharing** | Essential for external-facing documentation. Share tokens, no login required |
| **Export** (MD/HTML/PDF/DOCX) | Must-have for enterprises. Confluence export is a nice touch |

### 🟡 Keep but Simplify

| Feature | Action |
|---------|--------|
| **MCP Server** | Keep and promote heavily. AI agents reading your docs = incredibly sticky. This is your integration/API story |
| **Git Sync** | Keep as-is. Dev teams love docs-as-code. One-way export to GitHub/GitLab/Bitbucket |
| **Context Links** | Simplify the UX. The backend (URL pattern → show relevant doc) is great, but regex/compound rules are too complex. Reframe as: "When someone opens Salesforce, show them 'How to update a deal'" — one click setup, auto-suggest from recorded workflows |
| **Knowledge Base** (file upload) | Don't lead with it. It's "oh, and you can also upload PDFs." Commodity feature |

### 🔴 Cut or Hide for v1

| Feature | Why |
|---------|-----|
| **Knowledge Graph** (links/graph viz) | Cool tech, zero market pull. Nobody asks for "show me the relationship graph of my docs." Revisit at 100+ customers |
| **Analytics Dashboard** | Useful data (top accessed, stale content, knowledge gaps) but unmarketable. Include silently behind admin settings. Don't promote |
| **Audit Log** | Table stakes for enterprise procurement checklists, not a selling point. Keep, don't market |
| **Privacy/SendCloak/Presidio** | Adds 2 extra containers + massive complexity. Nobody in initial market (SMB/startups) cares. Enterprise will — bring it back when you have enterprise deals. Keep the code, disable by default |

---

## Monetization

### Self-Hosted: Free, Forever, Unlimited

Non-negotiable for building trust. Self-hosted = free is how PostHog, Plausible, Gitea, and every successful OSS tool works. This is your distribution engine.

### Cloud (app.ondoki.com): Freemium

| Tier | Price | Includes |
|------|-------|----------|
| **Free** | $0 | 1 project, 3 users, 25 workflows, 500 MB storage, community support |
| **Team** | $12/user/mo | Unlimited projects & workflows, 10 GB storage, AI features (annotation, chat, video import), Git sync, MCP |
| **Business** | $25/user/mo | SSO (when built), audit log, priority support, 50 GB, custom domain |
| **Enterprise** | Contact sales | Self-hosted support contract, SLA, privacy controls (SendCloak/Presidio), on-prem AI, unlimited storage |

**The monetization lever is AI.** Self-hosted users bring their own API keys. Cloud users get AI included in Team+. That's your margin.

**Do NOT fork into separate OSS/enterprise repos.** One codebase, enterprise features behind config flags.

---

## Infrastructure

### Start: Hetzner (100%)

| Why Hetzner | Why NOT the others |
|-------------|-------------------|
| CPX31 (4 vCPU, 8 GB) = €11/mo | **GCP/AWS**: Same setup costs 5-10× more |
| Full Docker Compose support | **Heroku**: No Compose, Postgres add-on pricing is awful, you need Redis + pgvector + Gotenberg → $100+/mo |
| European data residency (GDPR) | **Serverless/Cloud Functions**: Stack is stateful (Postgres, Redis, file uploads). Doesn't fit |

### Recommended Setup

| Server | Spec | Cost/mo | Purpose |
|--------|------|---------|---------|
| App server | CPX31 (4 vCPU, 8 GB) | €11 | API + Frontend + Redis + Gotenberg |
| DB server | CPX21 (3 vCPU, 4 GB) | €7 | PostgreSQL + pgvector |
| Storage | Storage Box 1 TB | €4 | Uploaded files, screenshots |
| **Total** | | **~€22/mo** | |

Use Caddy (already in stack) for automatic HTTPS.

### Scale Triggers

- **~50 paying teams** → Move DB to managed Postgres (Hetzner Cloud DB or Neon)
- **~200 paying teams** → Consider k8s or multi-server setup
- Add Hetzner Load Balancer (€6/mo) when needed

---

## Release Plan

### Phase 1 — "Record Mode" Launch (Week 1–2)

**Ship:** Chrome extension + web app. NOT the desktop app yet.

**Why Chrome first:**
- Zero install friction (Chrome Web Store)
- Desktop Electron adds complexity (signing, notarization, cross-platform bugs)
- Chrome covers 80% of use cases (most workflows are browser-based)
- Desktop comes later as a second launch moment ("now capture ANY app")

**Where to post (in order):**

1. **Product Hunt** — Your #1 launch. Position: "Open-source Scribe alternative" or "Turn any workflow into a step-by-step guide — open source." Time for a Tuesday. Prep a 60-second demo video
2. **Hacker News** (Show HN) — Same day or day after PH. Lead with open source + self-hosted. HN loves this
3. **r/selfhosted** — Bread and butter community. They'll adopt you if Docker setup is clean (it is)
4. **r/SideProject, r/startups** — Secondary reach
5. **Dev.to / Hashnode** — Write "How I built an open-source Scribe alternative" post

### Phase 2 — Desktop + Video Import (Week 4–6)

**Ship:** Electron desktop app + video-to-guide pipeline

**Where to post:**
- **Twitter/X** — Demo video: drop a Loom recording → get a guide back. Viral potential in ops/training circles
- **LinkedIn** — Target ops managers, training leads: "Turn any screen recording into documentation automatically"
- **Chrome Web Store** update announcement

### Phase 3 — MCP + AI Integration (Week 8–10)

**Ship:** MCP server as the headline. "Your AI coding assistant can now read your internal docs"

**Where to post:**
- **r/cursor, r/ClaudeAI** — "I made my internal docs available to Claude/Cursor via MCP"
- **awesome-mcp-servers** GitHub list — Get listed
- **Discord servers** (Cursor, Claude, AI coding communities)

### Phase 4 — Team Features + Cloud (Week 12+)

**Ship:** Cloud offering at app.ondoki.com, team invites, paid plans

**Where to post:**
- Direct outreach to early adopters from Phase 1–3
- Content marketing: "Why your team's process documentation is broken" type posts

---

## What to Publish (Open Source)

| Repo | When | Notes |
|------|------|-------|
| `ondoki-web` | Day 1 (Phase 1) | The full platform. MIT license. Trust builder |
| `ondoki-plugin-chrome` | Day 1 (Phase 1) | Ship alongside, link to web app |
| `ondoki-desktop-electron` | Phase 2 | Hold back. Second launch moment |

---

## Key Recommendations

1. **Kill the .NET desktop app.** You have Electron. Ship that. Cross-platform > Windows-only. Don't maintain two desktop apps

2. **Landing page > features.** Before any launch, you need a clean marketing site (not the GitHub README) with:
   - One-line pitch
   - 30-second demo GIF
   - Docker one-liner to self-host
   - "Try cloud free" button

3. **AI annotation is your wedge.** Every demo should show: record 5 clicks → AI writes the descriptions → guide in 30 seconds. That's the "holy shit" moment

4. **Don't say "knowledge base" in marketing.** Say "process documentation" or "step-by-step guides." Knowledge base = Confluence (boring). Guides/playbooks/SOPs = actionable

5. **MCP angle is underrated.** "Your AI assistant can search your company's how-to guides" is genuinely novel. Scribe and Tango don't have this

6. **Context Links needs UX work.** Reframe from "match URL patterns with regex" (developer-think) to "When someone opens Salesforce, show them the right guide" (user-think). Auto-suggest based on recorded workflows
