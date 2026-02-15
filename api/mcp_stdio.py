#!/usr/bin/env python3
"""Standalone stdio entry point for the Ondoki MCP server."""
import asyncio
from app.mcp_server import mcp

if __name__ == "__main__":
    mcp.run(transport="stdio")
