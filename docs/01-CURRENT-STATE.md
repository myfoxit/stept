# Ondoki v2 — Current Feature Inventory

> Last updated: 2026-02-11  
> Repos: `myfoxit/ondoki-web` (commit `68d0940`), `myfoxit/ondoki-desktop` (commit `8be2e9f`)  
> This document is formatted for LLM consumption — use it as context for development tasks.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Desktop App    │────▶│  FastAPI Backend  │◀────│  React Frontend │
│  C#/WPF/.NET 9  │     │  Python 3.11+    │     │  Vite/Tailwind  │
│  31 .cs files    │     │  56 .py files     │     │  363 .ts/.tsx   │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
               ┌────▼───┐  ┌────▼───┐  ┌────▼────┐
               │ Postgres│  │ Redis  │  │  LLM    │
               │+pgvector│  │        │  │ Gateway │
               └─────────┘  └────────┘  └─────────┘
```

- **Backend**: FastAPI, async SQLAlchemy 2.0, Alembic migrations, httpx for LLM calls
- **Frontend**: React 18, Vite, TailwindCSS, TipTap editor, shadcn/ui components
- **Desktop**: .NET 9, WPF, global input hooks, screenshot capture, cloud sync
- **Database**: PostgreSQL 16 + pgvector extension, 13 tables, 3 Alembic migrations
- **Infrastructure**: Docker Compose (5 services: db, redis, backend, celery-worker, frontend/nginx)

---

## 1. Backend (FastAPI)

### 1.1 Data Models (13 tables)

| Model | Purpose | Key Fields | Status |
|-------|---------|------------|--------|
| `User` | Auth & identity | email, hashed_password, is_verified | ✅ Working |
| `Project` | Multi-tenant workspace | name, owner_id | ✅ Working |
| `Folder` | Hierarchical organization | name, parent_id, materialized_path | ✅ Working |
| `Document` | Rich-text pages | name, folder_id, tiptap_content (JSON) | ✅ Working |
| `TextContainer` | Legacy text storage | content (text blob) | ✅ Working |
| `Session` | Auth sessions | user_id, token | ✅ Working |
| `ProcessRecordingSession` | Workflow container | name, generated_title, summary, tags, guide_markdown, is_processed | ✅ Working |
| `ProcessRecordingStep` | Individual step | step_number, description, window_title, generated_title, generated_description, ui_element, step_category, is_annotated, action_type | ✅ Working |
| `ProcessRecordingFile` | Screenshot storage | session_id, step_number, file_path | ✅ Working |
| `AuthCode` | Email verification | code, user_id, expires_at | ✅ Working |
| `RefreshToken` | JWT refresh | token, user_id | ✅ Working |
| `AppSettings` | Key-value config | key, value (JSON) | ✅ Working |
| `Embedding` | RAG vectors | content_type, content_id, embedding (vector), text_content | ✅ Working |

### 1.2 API Endpoints (~90 routes)

**Auth (8 routes)**: register, login, logout, token refresh, password reset (request + confirm), email verify, me  
**Users (2 routes)**: list, get by ID  
**Projects (8 routes)**: CRUD, members, roles, invite, join  
**Folders (8 routes)**: CRUD, tree, move, duplicate, expand  
**Documents (9 routes)**: CRUD, move, duplicate, filtered list, exports (markdown/html/pdf/docx)  
**Text Containers (4 routes)**: CRUD, list  
**Process Recordings (22 routes)**: session create, metadata upload, image upload, finalize, list, filtered list, update, move, delete, duplicate, step CRUD, step reorder, exports (4 formats), AI processing, guide generation (sync + streaming), AI summary, single step annotate, single step improve  
**Chat (8 routes)**: completions (SSE), inline AI (SSE), config get/put, models list, tools list  
**Copilot (3 routes)**: device flow start, poll, disconnect  
**Auth Providers (2 routes)**: authorize, status  
**Search (3 routes)**: full-text search, semantic search, reindex  

### 1.3 LLM Gateway (`services/llm.py`)

- **Provider-agnostic**: httpx-based, no SDK dependencies
- **Supported providers**: OpenAI, Anthropic, Ollama, GitHub Copilot, any OpenAI-compatible
- **Configuration priority**: DB (`app_settings.llm_config`) → env vars → defaults
- **Streaming**: Async iterator yielding SSE chunks
- **Copilot special handling**: Auto-refreshes session tokens (30min expiry, 60s buffer)
- **Functions**: `chat_completion()`, `chat_completion_stream()`, `get_available_models()`
- **Status**: ✅ Working — tested with OpenAI, Copilot

### 1.4 AI Chat Tool System (`services/ai_tools/`)

Plugin-based auto-discovery. Each tool is a Python module exporting `name`, `description`, `parameters` (OpenAI function schema), and `async execute(args, db, user)`.

| Tool | What It Does | Status |
|------|-------------|--------|
| `analyze_workflow` | Returns step count, estimated time, complexity, optimization tips | ✅ Working |
| `create_folder` | Creates folder by name, auto-creates parent if missing | ✅ Working |
| `create_page` | Creates document, places in folder by name or ID | ✅ Working |
| `list_workflows` | Lists/searches workflows with filter query | ✅ Working |
| `merge_steps` | Removes duplicate/redundant steps (auto-detect or specified) | ✅ Working |
| `read_workflow` | Returns all step details for inspection | ✅ Working |
| `rename_steps` | Renames individual step titles in bulk | ✅ Working |
| `rename_workflow` | Renames workflow by ID or partial name match | ✅ Working |
| `suggest_workflow` | Semantic + keyword search for "how do I X" queries | ✅ Working |

**System prompt** in `routers/chat.py` instructs the LLM to use tools automatically when relevant. Chat auto-injects `project_id` from frontend context.

### 1.5 RAG / Semantic Search (`services/embeddings.py`, 207 lines)

- **Model**: OpenAI `text-embedding-3-small` (1536-dim vectors)
- **Storage**: `Embedding` table with pgvector `vector(1536)` column
- **Fallback**: TF-IDF keyword search when embeddings unavailable
- **Auto-indexing**: Generates embeddings on workflow create/update
- **Search endpoint**: `/search/semantic` — cosine similarity, configurable threshold
- **Reindex**: `/search/reindex` — bulk re-generates all embeddings
- **Status**: ✅ Working (requires OpenAI API key for embeddings)

### 1.6 Smart Recording Pipeline (`services/auto_processor.py`, 477 lines)

- **Auto-annotate**: Sends step screenshots to LLM with structured prompt → gets `generated_title`, `generated_description`, `ui_element`, `step_category`
- **Vision support**: Auto-detects if model supports vision, falls back to text-only (description + window_title)
- **Guide generation**: Builds markdown guide from annotated steps, can stream via SSE
- **Batch processing**: `POST /workflow/{id}/process` — annotates all steps + generates guide
- **Status**: ✅ Working

### 1.7 DataVeil Integration (`services/dataveil.py`, 84 lines)

- **Purpose**: Privacy proxy — obfuscates PII before sending to LLM, restores in responses
- **Implementation**: HTTP proxy to DataVeil Go service
- **Status**: ⚠️ Partial — integration code exists, DataVeil is a separate project, not bundled

### 1.8 TipTap Inline AI (`routers/inline_ai.py`)

- **Endpoint**: `POST /chat/inline` (SSE streaming)
- **Commands**: write, summarize, improve, expand, simplify, translate, explain
- **Context-aware**: Receives selected text and surrounding paragraphs
- **DataVeil**: Optionally proxies through privacy layer
- **Status**: ✅ Working

### 1.9 Copilot OAuth (`services/auth_providers/copilot.py`, 288 lines)

- **Device flow**: Uses VS Code's public client ID (`Iv1.b507a08c87ecfe98`)
- **Token exchange**: `device_code` → `access_token` → Copilot session token
- **Auto-refresh**: Session tokens expire ~30min, auto-refreshed with 60s buffer
- **DB persistence**: Stores `copilot_github_token` in `app_settings`
- **Available models**: GPT-4o, GPT-4o Mini, Claude Sonnet 4, Claude 3.5 Sonnet, o3-mini
- **Status**: ✅ Working

### 1.10 Workflow Exports

| Format | Workflows | Documents | Status |
|--------|-----------|-----------|--------|
| Markdown | ✅ | ✅ | Working |
| HTML | ✅ (optional base64 images) | ✅ | Working |
| PDF | ✅ | ✅ | Working |
| DOCX | ✅ | ✅ | Working |

---

## 2. Frontend (React/Vite/Tailwind)

### 2.1 Pages

| Page | Route | Purpose | Status |
|------|-------|---------|--------|
| LoginPage | `/login` | Auth (register/login/reset) | ✅ Working |
| DeviceAuth | `/device-auth` | Copilot OAuth callback | ✅ Working |
| DocumentGallery | `/` | List documents/workflows | ✅ Working |
| FolderView | `/folder/:id` | Folder contents | ✅ Working |
| WorkflowView | `/workflow/:id` | Step cards, zoom, edit, guide | ✅ Working |
| EditorPage | `/document/:id` | TipTap rich text editor | ✅ Working |
| TextContainerPage | `/text/:id` | Simple text view | ✅ Working |
| ProjectSettings | `/settings` | Project config, members | ✅ Working |
| JoinProject | `/join/:code` | Accept invite | ✅ Working |

### 2.2 Key Components

**Chat System** (`components/Chat/`):
- `ChatContext.tsx` — React context provider, SSE streaming, tool call handling, auto-injects project_id
- `ChatMessage.tsx` — Renders messages with tool call/result display inline
- `ChatInput.tsx` — Input with send button
- `ChatPanel.tsx` — Sliding panel with conversation history

**LLM Setup Wizard** (`components/Settings/`):
- 5 providers: GitHub Copilot, OpenAI, Anthropic, Ollama, Custom
- 3-step wizard: choose → configure → review/test
- Copilot: device flow with code display + GitHub auth polling
- Model picker per provider
- 751 lines, clean implementation

**Workflow Components** (`components/workflow/`):
- `workflow-step.tsx` — Step cards with zoom/pan, edit mode, AI-generated titles as primary headers
- `smart-step-card.tsx` — AI annotation overlay (description, category chip, re-annotate/improve buttons)

**TipTap Editor** (`components/Editor/`, `tiptap-extensions/`, `tiptap-ui/`):
- Full rich-text editor with 70+ component files
- Block nodes: Hero, CardList, DataTable, Button, Variable, ProcessRecording embed
- AI slash commands: `/ai write|summarize|improve|expand|simplify|translate|explain`
- Slash command menu, toolbar, formatting controls
- DOCX export extension

**Search** (`components/search/`):
- Full-text + semantic search results
- Highlighted step matches with click-to-navigate

### 2.3 API Layer (`api/`)

12 API client modules: auth, authProviders, chat, documents, folders, inlineAI, processing, projects, search, text_container, users, workflows

### 2.4 UI Framework

- shadcn/ui components (card, badge, button, dropdown, dialog, input, skeleton, tooltip)
- Tabler Icons
- TailwindCSS 3
- React Query for data fetching

---

## 3. Desktop App (C#/WPF/.NET 9)

### 3.1 Core Services

| Service | Purpose | Status |
|---------|---------|--------|
| `RecordingService.cs` | Global hooks (mouse/keyboard), screenshot capture, step management | ✅ Working |
| `SmartAnnotationService.cs` | Async LLM annotation queue (max 3 concurrent, 512px thumbnails, vision auto-detect) | ✅ Working |
| `GuideGenerationService.cs` | Markdown guide from annotated steps | ✅ Working |
| `CloudUploadService.cs` | Upload sessions/steps/images to web backend | ✅ Working |
| `ChatService.cs` | SSE streaming LLM chat with recording context | ✅ Working |
| `AuthenticationService.cs` | Login to web backend | ✅ Working |
| `GlobalHooks.cs` | Low-level mouse/keyboard hooks | ✅ Working |

### 3.2 Windows

| Window | Purpose | Status |
|--------|---------|--------|
| `MainWindow` | Recording UI, step list, start/stop/pause | ✅ Working |
| `ChatWindow` | Floating non-modal LLM chat | ✅ Working |
| `LlmSetupWindow` | Provider config (OpenAI/Ollama/Custom) | ✅ Working |
| `GuidePreviewWindow` | Rendered markdown guide | ✅ Working |
| `CaptureSelectionWindow` | Region selection overlay | ✅ Working |
| `HighlightOverlay` | Click highlight visualization | ✅ Working |
| `SettingsWindow` | General settings | ✅ Working |
| `ExportDialog` | Export format selection | ✅ Working |

### 3.3 Desktop-Specific Features

- **Step recording**: Captures mouse clicks + keyboard actions with screenshots per step
- **Screenshot metadata**: Window title, click coordinates, window size, relative position → enables click circle overlay on web
- **Inline annotation**: Steps annotated with LLM while recording continues (non-blocking)
- **Cloud sync**: Push entire recording session (metadata + images) to web backend
- **Auto-title sync**: `generated_title` from desktop annotation flows through to web display

---

## 4. Infrastructure

### 4.1 Docker Compose Services

| Service | Image | Port | Status |
|---------|-------|------|--------|
| `db` | pgvector/pgvector:pg16 | 5432 | ✅ |
| `redis` | redis:7-alpine | 6379 | ✅ |
| `backend` | Custom (Dockerfile) | 8000 | ✅ |
| `celery-worker` | Same as backend | — | ⚠️ Exists but underused |
| `frontend` | Custom (Vite build + nginx) | 3000 | ✅ |

### 4.2 Alembic Migrations

- `001_initial.py` — Full 13-table schema (for fresh deployments)
- `002_add_ai_columns.py` — AI fields on ProcessRecordingSession/Step (for existing DBs)
- `003_add_embeddings.py` — Embedding table with pgvector

---

## 5. What's Unique vs. Competitors

### Ondoki Has (Competitors Don't)
- **Bring-your-own-LLM**: 5 provider options including free Copilot access
- **AI chat with tool calling**: Not just annotation — the AI can create/rename/analyze workflows
- **RAG semantic search**: "How do I deploy to prod?" finds relevant workflows by meaning
- **TipTap inline AI**: AI writing assistant embedded in the document editor
- **Desktop + Web with sync**: Record on desktop, view/edit/share on web
- **Privacy proxy integration**: DataVeil for enterprise LLM compliance
- **Open architecture**: Self-hosted, no vendor lock-in

### Competitors Have (Ondoki Doesn't Yet)
- **Browser extension** (Scribe, Tango) — web-only recording without desktop app
- **Video recording / GIF export** (Guidde) — Ondoki is screenshot-only
- **AI voiceover / text-to-speech** (Guidde) — 200+ voices, 50+ languages
- **Team collaboration** (all) — comments, reactions, version history
- **Custom branding / brand kits** (all) — logos, colors, domains
- **Automatic PII redaction** (Tango, Guidde) — blur/mask sensitive data in screenshots
- **SSO / SCIM** (Tango Enterprise) — enterprise identity management
- **Engagement analytics** (Tango, Guidde) — who viewed, completion rates
- **Interactive guided walkthroughs** (Tango) — in-app overlay guidance
- **Workflow templates** — pre-built starting points

---

## 6. Known Issues & Rough Edges

1. **No tests**: Zero automated tests in the entire codebase
2. **Pre-existing TypeScript error**: `tsconfig.json(16,25): error TS5095` — `bundler` module resolution config issue
3. **Celery underused**: Worker exists in Docker but AI tasks run synchronously in request handlers
4. **SSE holds DB sessions**: Chat streaming keeps database connections open for duration of stream
5. **No rate limiting**: Any authenticated user can spam LLM endpoints
6. **API keys stored unencrypted**: `app_settings` stores raw API keys in DB
7. **No error boundaries**: Frontend has no React error boundaries
8. **No WebSocket**: Real-time features use SSE only (one-directional)
9. **Embedding generation synchronous**: Blocks the request that triggers it
10. **No CDN for screenshots**: Images served directly from backend filesystem
11. **Large workflows load eagerly**: All steps fetched at once, no pagination
12. **DataVeil not bundled**: Requires separate deployment of the Go proxy
