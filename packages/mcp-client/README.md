# @ondoki/mcp

Connect your AI coding agent to your company's Ondoki knowledge base — from any repo, any project.

Works with **VS Code Copilot**, **Claude Desktop**, **Cursor**, and any MCP-compatible client.

## Setup (one-time, global)

### 1. Create an API Key

In Ondoki → **Settings → MCP API Keys** → Create a new key. Copy it.

### 2. Configure your AI agent

#### VS Code (Copilot / GitHub Copilot Chat)

Open **User Settings (JSON)** (`Cmd+Shift+P` → "Preferences: Open User Settings (JSON)") and add:

```json
{
  "mcp": {
    "servers": {
      "ondoki": {
        "command": "npx",
        "args": ["@ondoki/mcp"],
        "env": {
          "ONDOKI_URL": "https://your-ondoki-instance.com",
          "ONDOKI_API_KEY": "your-api-key"
        }
      }
    }
  }
}
```

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ondoki": {
      "command": "npx",
      "args": ["@ondoki/mcp"],
      "env": {
        "ONDOKI_URL": "https://your-ondoki-instance.com",
        "ONDOKI_API_KEY": "your-api-key"
      }
    }
  }
}
```

#### Cursor

Settings → MCP → Add Server:
- **Command:** `npx @ondoki/mcp`
- **Environment:** `ONDOKI_URL=..., ONDOKI_API_KEY=...`

### 3. Use it

In any project, ask your AI agent:

- *"Search my Ondoki pages for onboarding docs"*
- *"Find workflows related to deploying to production"*
- *"What Ondoki docs are relevant to this URL?"*

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List projects accessible to your API key |
| `search_pages` | Full-text search across pages/documents |
| `get_page` | Get full page content as Markdown |
| `search_workflows` | Search recorded workflows |
| `get_workflow` | Get workflow with all steps |
| `get_context` | Find relevant docs by URL, app name, or window title |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONDOKI_URL` | ✅ | Your Ondoki instance URL |
| `ONDOKI_API_KEY` | ✅ | MCP API key from Settings |

## How it works

This package is a lightweight stdio ↔ HTTP bridge. It:

1. Receives MCP JSON-RPC messages on stdin (from your AI agent)
2. Forwards them to your Ondoki instance's `/mcp` endpoint
3. Returns the responses on stdout

Your data stays on your Ondoki server. This package has **zero dependencies** and doesn't store anything locally.
