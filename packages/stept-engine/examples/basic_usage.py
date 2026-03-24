#!/usr/bin/env python3
"""
Basic usage examples for Stept Engine.

Note: These examples require playwright to be installed:
    pip install playwright
    playwright install chromium
"""

import asyncio
from pathlib import Path
import sys

# Add stept to path for local development
sys.path.insert(0, str(Path(__file__).parent.parent))

from stept import Agent, ReplayEngine
from stept.models import Recording, StepAction, ActionType, ElementInfo


async def example_1_basic_agent():
    """Example 1: Basic agent usage with a simple task."""
    print("🤖 Example 1: Basic Agent Usage")
    print("=" * 50)
    
    # Create agent for a simple web task
    # Note: This requires an LLM client for agent mode
    agent = Agent(
        task="Go to Google and search for 'browser automation'",
        url="https://google.com",
        headless=False,  # Show browser for demo
        max_steps=5
    )
    
    try:
        result = await agent.run()
        
        print(f"✅ Task completed!")
        print(f"Mode: {result.mode.value}")
        print(f"Success: {result.success}")
        print(f"Steps taken: {len(result.steps)}")
        print(f"Time: {result.total_time_ms}ms")
        print(f"LLM Cost: ${result.total_llm_cost:.3f}")
        
        if result.recording_id:
            print(f"💾 Saved as recording: {result.recording_id}")
        
    except Exception as e:
        print(f"❌ Error: {e}")


async def example_2_create_recording():
    """Example 2: Create a recording programmatically."""
    print("\\n📝 Example 2: Create Recording Programmatically")
    print("=" * 50)
    
    from stept.storage import LocalStorage
    
    # Create a sample recording
    recording = Recording(
        id="example-google-search",
        name="Google Search Example",
        url_pattern="*.google.com*",
        steps=[
            StepAction(
                action=ActionType.NAVIGATE,
                value="https://google.com",
                description="Navigate to Google homepage"
            ),
            StepAction(
                action=ActionType.TYPE,
                element=ElementInfo(
                    selector="input[name='q']",
                    placeholder="Search",
                    ariaLabel="Search"
                ),
                value="browser automation",
                description="Type search query"
            ),
            StepAction(
                action=ActionType.CLICK,
                element=ElementInfo(
                    selector="input[value='Google Search']",
                    tagName="input",
                    type="submit"
                ),
                description="Click search button"
            ),
            StepAction(
                action=ActionType.DONE,
                description="Search completed"
            )
        ],
        source="manual"
    )
    
    # Save recording
    storage = LocalStorage()
    recording_id = await storage.save_recording(recording)
    
    print(f"✅ Recording created: {recording_id}")
    print(f"📁 Saved to: ~/.stept/recordings/{recording_id}.json")
    
    return recording_id


async def example_3_replay_recording(recording_id: str):
    """Example 3: Replay a specific recording."""
    print("\\n▶️  Example 3: Replay Recording")
    print("=" * 50)
    
    engine = ReplayEngine(headless=False)  # Show browser
    
    try:
        result = await engine.replay_recording(recording_id)
        
        print(f"✅ Replay completed!")
        print(f"Success: {result.success}")
        print(f"Steps executed: {len(result.steps)}")
        print(f"Time: {result.total_time_ms}ms")
        print(f"Recording reuse: {result.recording_reuse_rate:.1%}")
        
        if not result.success:
            failed_step = next((i for i, s in enumerate(result.steps) if not s.success), None)
            if failed_step is not None:
                error = result.steps[failed_step].error
                print(f"❌ Failed at step {failed_step + 1}: {error}")
        
    except Exception as e:
        print(f"❌ Replay error: {e}")


async def example_4_list_recordings():
    """Example 4: List and manage recordings."""
    print("\\n📋 Example 4: List Recordings")
    print("=" * 50)
    
    from stept.storage import LocalStorage
    
    storage = LocalStorage()
    recordings = await storage.list_recordings()
    
    if not recordings:
        print("📭 No recordings found")
        return
    
    print(f"Found {len(recordings)} recordings:")
    print()
    
    for i, rec in enumerate(recordings[:5], 1):  # Show first 5
        success_rate = rec.success_count / max(rec.success_count + rec.fail_count, 1)
        print(f"{i}. {rec.name}")
        print(f"   ID: {rec.id}")
        print(f"   Steps: {len(rec.steps)}")
        print(f"   Success rate: {success_rate:.1%} ({rec.success_count}/{rec.success_count + rec.fail_count})")
        print(f"   Source: {rec.source}")
        print()


async def example_5_export_recording(recording_id: str):
    """Example 5: Export recording as code."""
    print("\\n💻 Example 5: Export Recording as Code")
    print("=" * 50)
    
    engine = ReplayEngine()
    
    try:
        # Export as Playwright code
        code = await engine.export_recording_as_code(recording_id, format="playwright")
        
        print("Generated Playwright code:")
        print("=" * 30)
        print(code)
        print("=" * 30)
        
        # Save to file
        output_file = f"exported_{recording_id}.py"
        with open(output_file, 'w') as f:
            f.write(code)
        
        print(f"💾 Code saved to: {output_file}")
        
    except Exception as e:
        print(f"❌ Export error: {e}")


async def main():
    """Run all examples."""
    print("🚀 Stept Engine Examples")
    print("========================")
    print()
    
    # Note: Example 1 requires LLM integration
    print("⚠️  Example 1 skipped - requires LLM client setup")
    print("   See README.md for LLM integration examples")
    print()
    
    # Create a sample recording
    recording_id = await example_2_create_recording()
    
    # Replay it
    await example_3_replay_recording(recording_id)
    
    # List recordings
    await example_4_list_recordings()
    
    # Export recording
    await example_5_export_recording(recording_id)
    
    print()
    print("🎉 All examples completed!")
    print()
    print("Next steps:")
    print("1. Install an LLM client (openai, anthropic, etc.)")
    print("2. Try the full agent mode with: stept run 'your task' --url https://example.com")
    print("3. Build your own recordings and automations!")


if __name__ == "__main__":
    # Check if playwright is available
    try:
        import playwright
        print("✅ Playwright is available")
    except ImportError:
        print("❌ Playwright not installed")
        print("Please install with: pip install playwright && playwright install chromium")
        sys.exit(1)
    
    # Run examples
    asyncio.run(main())