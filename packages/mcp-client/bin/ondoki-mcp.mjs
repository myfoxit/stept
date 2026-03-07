#!/usr/bin/env node
/**
 * Ondoki MCP Server — stdio ↔ Streamable HTTP bridge.
 *
 * Connects to your Ondoki instance and exposes pages, workflows, and
 * context links to any MCP-compatible AI agent (VS Code Copilot, Claude
 * Desktop, Cursor, etc.).
 *
 * Config via env vars:
 *   ONDOKI_URL      — Base URL of your Ondoki instance (e.g. https://app.ondoki.com)
 *   ONDOKI_API_KEY  — MCP API key (create in Settings → MCP API Keys)
 *
 * Usage:
 *   ONDOKI_URL=https://app.ondoki.com ONDOKI_API_KEY=sk-... npx @ondoki/mcp
 */

import { stdin, stdout, stderr, env, exit } from "node:process";
import { createInterface } from "node:readline";

const ONDOKI_URL = env.ONDOKI_URL?.replace(/\/+$/, "");
const ONDOKI_API_KEY = env.ONDOKI_API_KEY;

if (!ONDOKI_URL) {
  stderr.write("Error: ONDOKI_URL environment variable is required\n");
  stderr.write("  Example: ONDOKI_URL=https://app.ondoki.com\n");
  exit(1);
}
if (!ONDOKI_API_KEY) {
  stderr.write("Error: ONDOKI_API_KEY environment variable is required\n");
  stderr.write("  Create one in Ondoki → Settings → MCP API Keys\n");
  exit(1);
}

// The FastMCP streamable_http_app() mounts at /mcp internally,
// and Ondoki mounts that app at /mcp, so the full path is /mcp/mcp.
// We also support a custom path via ONDOKI_MCP_PATH for flexibility.
const mcpPath = env.ONDOKI_MCP_PATH || "/mcp/mcp";
const MCP_ENDPOINT = `${ONDOKI_URL}${mcpPath}`;

stderr.write(`[ondoki-mcp] connecting to ${ONDOKI_URL}\n`);

// Session ID for Streamable HTTP (set after first response)
let sessionId = null;

/**
 * Forward a JSON-RPC message from stdin to the Ondoki MCP endpoint
 * and write the response back to stdout.
 */
async function forward(line) {
  if (!line.trim()) return;

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    stderr.write(`[ondoki-mcp] invalid JSON: ${line}\n`);
    return;
  }

  const isNotification = parsed.method && !("id" in parsed);

  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${ONDOKI_API_KEY}`,
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }

    const res = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: line,
    });

    // Capture session ID from response
    const sid = res.headers.get("mcp-session-id");
    if (sid) sessionId = sid;

    if (isNotification) {
      // Notifications don't expect a response body
      return;
    }

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
      // SSE response — collect data events and write to stdout
      const text = await res.text();
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data) {
            stdout.write(data + "\n");
            stderr.write(`[ondoki-mcp] ← ${data.slice(0, 120)}\n`);
          }
        }
      }
    } else {
      // Regular JSON response
      const body = await res.text();
      if (body.trim()) {
        stdout.write(body + "\n");
        stderr.write(`[ondoki-mcp] ← ${body.slice(0, 120)}\n`);
      }
    }
  } catch (err) {
    stderr.write(`[ondoki-mcp] request error: ${err.message}\n`);
    if (!isNotification && parsed.id != null) {
      const errResp = JSON.stringify({
        jsonrpc: "2.0",
        id: parsed.id,
        error: { code: -32603, message: `Ondoki connection error: ${err.message}` },
      });
      stdout.write(errResp + "\n");
    }
  }
}

// Read JSON-RPC messages from stdin (one per line)
const rl = createInterface({ input: stdin, terminal: false });
rl.on("line", (line) => forward(line));
rl.on("close", () => {
  stderr.write("[ondoki-mcp] stdin closed, exiting\n");
  exit(0);
});
