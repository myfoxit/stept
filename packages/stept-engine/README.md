# Stept Engine

Browser automation with memory. Record once, replay forever.

## Overview

Stept Engine is a recording-first browser automation framework that combines the speed of deterministic replay with the flexibility of AI agents. It's designed to solve the core problem of brittle web automation by learning from previous executions and building a library of reusable workflows.

## Key Features

### 🎯 **Recording-First Architecture**
- **Replay Mode**: Lightning-fast execution using recorded workflows (0ms LLM cost)
- **Agent Mode**: AI exploration that captures new workflows for future reuse  
- **Hybrid Mode**: Smart combination of replay + agent for maximum reliability

### 🧠 **6-Level Element Finder**
Robust element location using cascading strategies:
1. CSS selectors (confidence: 1.0)
2. data-testid attributes (confidence: 0.95) 
3. ARIA role + name (confidence: 0.85)
4. Tag + text content (confidence: 0.70)
5. Element ID (confidence: 0.65)
6. Placeholder/label text (confidence: 0.50)

### 💾 **Flexible Storage**
- **Local**: JSON files in `~/.stept/recordings/`
- **Remote**: Stept platform with sync capabilities
- **Export**: Generate Playwright/Selenium test code

### 🚀 **Production Ready**
- Thread-safe file operations
- Comprehensive error handling
- Detailed logging and metrics
- Screenshot capture for debugging

## Installation

```bash
# Install from source
cd ~/repos/stept/packages/stept-engine
pip install -e .

# Or install dependencies manually
pip install playwright>=1.40 pydantic>=2.0 httpx>=0.25 click

# Install browser
playwright install chromium
```

## Quick Start

### Basic Usage

```python
from stept import Agent

# Simple task execution
agent = Agent(task="Create a new GitHub issue")
result = await agent.run()

print(f"Mode: {result.mode}")           # replay/agent/hybrid  
print(f"Success: {result.success}")     # True/False
print(f"Time: {result.total_time_ms}ms") # Execution time
print(f"LLM Cost: ${result.total_llm_cost:.3f}") # AI usage cost
```

### With Starting URL

```python
agent = Agent(
    task="Search for flights to Tokyo",
    url="https://google.com/travel",
    headless=False  # Show browser
)
result = await agent.run()
```

### Replay Specific Recording

```python
from stept import ReplayEngine

engine = ReplayEngine()
result = await engine.replay_recording("recording-id-123")
```

### CLI Usage

```bash
# Run a task (auto-selects mode)
stept run "Create Salesforce opportunity" --url https://login.salesforce.com

# Replay specific recording  
stept replay abc-123-def --headless

# List recordings
stept recordings list

# Export as Playwright code
stept recordings export abc-123-def --format playwright -o test.py

# Benchmark recording reliability
stept benchmark abc-123-def --runs 10
```

## Architecture

### Core Components

```
stept/
├── agent.py          # Main Agent class with 3-mode execution
├── replay.py         # Standalone ReplayEngine for recorded workflows  
├── finder.py         # 6-level element finder cascade
├── dom.py            # JavaScript-based DOM extraction
├── actions.py        # Playwright action execution
├── browser.py        # Browser lifecycle management
├── models.py         # Pydantic data models
├── storage/          # Storage backends
│   ├── local.py      # JSON file storage
│   ├── remote.py     # Stept platform API
│   └── base.py       # Abstract interface
└── cli.py            # Command line interface
```

### Execution Flow

```mermaid
graph TD
    A[Agent.run()] --> B[Find Recordings]
    B --> C{Recording Found?}
    C -->|Good Match| D[REPLAY Mode]
    C -->|Partial Match| E[HYBRID Mode]  
    C -->|No Match| F[AGENT Mode]
    
    D --> G[Execute Steps]
    E --> H[Try Replay → Agent on Failure]
    F --> I[LLM Exploration]
    
    G --> J[Update Stats]
    H --> K[Save New Recording]
    I --> K
```

## Data Models

### StepAction
```python
StepAction(
    action=ActionType.CLICK,           # click/type/navigate/scroll/wait/done
    element=ElementInfo(...),          # Rich element data
    value="text to type",              # Optional action value
    description="Click submit button"  # Human-readable description
)
```

### Recording  
```python
Recording(
    id="unique-id",
    name="Create GitHub Issue", 
    url_pattern="*.github.com/*",      # Glob pattern for matching
    steps=[...],                       # List of StepActions
    success_count=5,                   # Replay statistics
    fail_count=1
)
```

## Advanced Features

### Custom LLM Integration

```python
# OpenAI
import openai
client = openai.AsyncOpenAI(api_key="sk-...")

agent = Agent(task="...", llm_client=client)

# Anthropic
import anthropic  
client = anthropic.AsyncAnthropic(api_key="sk-ant-...")

agent = Agent(task="...", llm_client=client)
```

### Remote Storage & Sync

```python
# Use Stept platform
agent = Agent(
    task="...",
    server_url="https://stept.company.com",
    api_key="sp-..."
)

# Manual sync
from stept.storage import RemoteStorage
storage = RemoteStorage("https://stept.company.com", "sp-...")
await storage.sync_recordings(direction="both")
```

### Recording Management

```python
from stept.storage import LocalStorage

storage = LocalStorage()

# Find recordings
recordings = await storage.find_by_task("create opportunity") 
url_matches = await storage.find_by_url("*.salesforce.com*")

# Manage recordings
await storage.save_recording(recording)
await storage.delete_recording("recording-id")

# Export recordings
code = await storage.export_recording("recording-id", format="playwright")
```

## Configuration

### Browser Options
```python
agent = Agent(
    task="...",
    browser_type="chromium",           # chromium/firefox/webkit
    headless=True,                     # True/False
    viewport_size=(1920, 1080),        # Browser window size
    screenshot_dir="/path/to/shots"    # Debug screenshots
)
```

### Storage Options
```python
# Local storage location
agent = Agent(task="...", recordings_dir="/custom/path")

# Remote with fallback
agent = Agent(
    task="...",
    server_url="https://api.stept.com",
    api_key="your-key"  # Falls back to local on network errors
)
```

## Development

### Running Tests
```bash
# Test imports
python test_import.py

# Run with dependencies
pip install playwright pydantic httpx click
playwright install chromium
python test_import.py
```

### Adding New Actions
1. Add to `ActionType` enum in `models.py`
2. Implement execution in `actions.py`
3. Add LLM prompt support in `agent.py`
4. Update CLI help text

### Custom Storage Backend
```python
from stept.storage.base import Storage

class CustomStorage(Storage):
    async def list_recordings(self) -> List[Recording]:
        # Your implementation
        pass
    
    # Implement other abstract methods...
```

## Roadmap

### v0.1 (Current)
- ✅ Core agent with 3 execution modes
- ✅ 6-level element finder 
- ✅ Local JSON storage
- ✅ Basic CLI interface
- ✅ Playwright integration

### v0.2 (Planned)
- [ ] Remote storage API client
- [ ] Recording validation & health checks
- [ ] Improved error recovery
- [ ] Recording merge/diff tools
- [ ] Performance benchmarking

### v0.3 (Future)
- [ ] Visual element matching 
- [ ] Shadow DOM support
- [ ] Multi-page workflows
- [ ] Recording analytics dashboard
- [ ] Browser fingerprint management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

---

**Stept Engine** - Making browser automation reliable through memory and AI.