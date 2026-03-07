#!/usr/bin/env python3
"""Standalone stdio entry point for the Ondoki MCP server."""
import logging
import os
import sys

# Log MCP tool calls to stderr (visible in terminal, doesn't interfere with stdio JSON-RPC)
logging.basicConfig(
    level=logging.DEBUG if os.environ.get("MCP_DEBUG") else logging.INFO,
    format="%(asctime)s [MCP] %(message)s",
    stream=sys.stderr,
)

from app.mcp_server import mcp

if __name__ == "__main__":
    mcp.run(transport="stdio")
