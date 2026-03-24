"""Data models for Stept browser automation."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
import time


class ActionType(str, Enum):
    """Types of actions that can be performed."""
    CLICK = "click"
    TYPE = "type"
    SELECT = "select"
    NAVIGATE = "navigate"
    SCROLL = "scroll"
    WAIT = "wait"
    DONE = "done"
    CLICK_AT = "click_at"      # Coordinate-based click
    TYPE_AT = "type_at"         # Coordinate-based type


class ElementInfo(BaseModel):
    """Rich element data matching Chrome extension capture format."""
    index: Optional[int] = None
    selector: Optional[str] = None
    testId: Optional[str] = None
    tagName: Optional[str] = None
    text: Optional[str] = None
    ariaLabel: Optional[str] = None
    role: Optional[str] = None
    id: Optional[str] = None
    className: Optional[str] = None
    type: Optional[str] = None
    placeholder: Optional[str] = None
    href: Optional[str] = None
    rect: Optional[Dict[str, int]] = None  # {x, y, w, h}
    parentText: Optional[str] = None
    parentChain: Optional[List[Dict[str, Any]]] = None


class StepAction(BaseModel):
    """A single action to perform."""
    action: ActionType
    element: Optional[ElementInfo] = None
    value: Optional[str] = None
    description: Optional[str] = None
    coordinate_x: Optional[int] = None
    coordinate_y: Optional[int] = None


class StepResult(BaseModel):
    """Result of executing a step."""
    success: bool
    action: StepAction
    url_before: str
    url_after: str
    screenshot_path: Optional[str] = None
    element_found_by: Optional[str] = None  # "selector", "testid", "role", "llm_recovery"
    error: Optional[str] = None
    duration_ms: int = 0
    llm_cost: float = 0.0
    # Enhanced agent output fields
    thinking: Optional[str] = None
    evaluation: Optional[str] = None
    memory: Optional[str] = None
    next_goal: Optional[str] = None


class Recording(BaseModel):
    """A recorded workflow."""
    id: str
    name: str
    url_pattern: Optional[str] = None
    steps: List[StepAction] = Field(default_factory=list)
    source: str = "manual"  # "manual" | "agent" | "imported"
    success_count: int = 0
    fail_count: int = 0
    last_run_at: Optional[str] = None
    created_at: Optional[str] = Field(default_factory=lambda: str(int(time.time())))


class RunMode(str, Enum):
    """Execution modes."""
    REPLAY = "replay"     # Full recording exists
    AGENT = "agent"       # No recording, explore
    HYBRID = "hybrid"     # Partial recording + agent for gaps


class RunResult(BaseModel):
    """Result of a complete run."""
    mode: RunMode
    success: bool
    steps: List[StepResult] = Field(default_factory=list)
    total_time_ms: int = 0
    total_llm_cost: float = 0.0
    recording_id: Optional[str] = None
    recording_reuse_rate: float = 0.0  # % of steps from recording vs LLM
    # Enhanced tracking
    total_tokens: Optional[int] = None
    plan_used: bool = False
    loops_detected: int = 0
    autocomplete_interactions: int = 0
    cookie_banners_dismissed: int = 0