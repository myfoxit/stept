"""
AI Tool Registry — extensible plugin system for chat function calling.

Each tool is a separate module in this package that exports:
  - name: str
  - description: str
  - parameters: dict (JSON Schema)
  - execute(db, user_id, project_id, **params) -> dict

The registry collects all tools and provides:
  - OpenAI function-calling format definitions
  - Tool lookup and execution
"""

from __future__ import annotations

import importlib
import logging
import pkgutil
from typing import Any, Callable, Awaitable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class Tool:
    """Wrapper for a single AI tool."""

    __slots__ = ("name", "description", "parameters", "execute_fn", "requires_confirmation")

    def __init__(
        self,
        name: str,
        description: str,
        parameters: dict,
        execute_fn: Callable[..., Awaitable[dict]],
        requires_confirmation: bool = False,
    ):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.execute_fn = execute_fn
        self.requires_confirmation = requires_confirmation

    def to_openai_function(self) -> dict:
        """Return OpenAI function-calling format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    async def execute(
        self,
        db: AsyncSession,
        user_id: str,
        project_id: Optional[str],
        **kwargs: Any,
    ) -> dict:
        """Execute the tool with security context."""
        return await self.execute_fn(
            db=db, user_id=user_id, project_id=project_id, **kwargs
        )


class ToolRegistry:
    """Registry that auto-discovers tool modules in this package."""

    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool
        logger.info("Registered AI tool: %s", tool.name)

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def all_tools(self) -> list[Tool]:
        return list(self._tools.values())

    def openai_tool_definitions(self) -> list[dict]:
        """Return all tool definitions in OpenAI function-calling format."""
        return [t.to_openai_function() for t in self._tools.values()]

    def auto_discover(self) -> None:
        """Import all sibling modules and register their tools."""
        package = importlib.import_module(__package__)
        for importer, modname, ispkg in pkgutil.iter_modules(package.__path__):
            if modname.startswith("_"):
                continue
            try:
                mod = importlib.import_module(f"{__package__}.{modname}")
                # Each module must expose: name, description, parameters, execute
                if all(hasattr(mod, attr) for attr in ("name", "description", "parameters", "execute")):
                    tool = Tool(
                        name=mod.name,
                        description=mod.description,
                        parameters=mod.parameters,
                        execute_fn=mod.execute,
                        requires_confirmation=getattr(mod, "requires_confirmation", False),
                    )
                    self.register(tool)
                else:
                    logger.debug("Skipping module %s — missing required exports", modname)
            except Exception as exc:
                logger.warning("Failed to load AI tool module %s: %s", modname, exc)


# Singleton registry — initialised on first import
registry = ToolRegistry()
registry.auto_discover()
