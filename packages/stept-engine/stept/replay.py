"""Standalone replay engine for recorded workflows."""

import asyncio
import logging
import time
from pathlib import Path
from typing import Optional

from .models import Recording, RunResult, RunMode, StepResult
from .browser import BrowserManager
from .actions import execute_action
from .storage.local import LocalStorage
from .storage.remote import RemoteStorage
from .dom import wait_for_page_stability

logger = logging.getLogger(__name__)


class ReplayEngine:
    """
    Standalone engine for replaying recorded workflows.
    
    Focused on deterministic replay without LLM dependencies.
    Optimized for speed and reliability.
    """
    
    def __init__(
        self,
        headless: bool = True,
        browser_type: str = "chromium",
        viewport_size: tuple = (1280, 720),
        recordings_dir: str = None,
        server_url: str = None,
        api_key: str = None,
        screenshot_dir: str = None
    ):
        self.headless = headless
        self.browser_type = browser_type
        self.viewport_size = viewport_size
        
        # Storage setup
        if server_url:
            self.storage = RemoteStorage(server_url, api_key, fallback_to_local=True)
        else:
            self.storage = LocalStorage(recordings_dir)
        
        # Screenshot directory
        if screenshot_dir:
            self.screenshot_dir = Path(screenshot_dir)
            self.screenshot_dir.mkdir(parents=True, exist_ok=True)
        else:
            self.screenshot_dir = None
        
        # Browser manager
        self.browser_manager = BrowserManager(
            headless=headless,
            browser_type=browser_type,
            viewport_size=viewport_size
        )
        
        logger.info("Replay engine initialized")
    
    async def replay_recording(
        self, 
        recording_id: str, 
        starting_url: str = None,
        max_retries: int = 2
    ) -> RunResult:
        """Replay a specific recording by ID."""
        recording = await self.storage.get_recording(recording_id)
        if not recording:
            logger.error(f"Recording not found: {recording_id}")
            return RunResult(
                mode=RunMode.REPLAY,
                success=False,
                steps=[],
                total_time_ms=0,
                total_llm_cost=0.0
            )
        
        return await self.replay(recording, starting_url, max_retries)
    
    async def replay(
        self, 
        recording: Recording, 
        starting_url: str = None,
        max_retries: int = 2
    ) -> RunResult:
        """Replay a recording with optional retries."""
        logger.info(f"Replaying: {recording.name} ({len(recording.steps)} steps)")
        
        for attempt in range(max_retries + 1):
            if attempt > 0:
                logger.info(f"Retry attempt {attempt}/{max_retries}")
                await asyncio.sleep(1)  # Brief pause before retry
            
            try:
                result = await self._execute_replay(recording, starting_url)
                
                # Update recording statistics
                await self.storage.update_recording_stats(recording.id, result.success)
                
                if result.success or attempt == max_retries:
                    return result
                    
            except Exception as e:
                logger.error(f"Replay attempt {attempt + 1} failed: {e}")
                if attempt == max_retries:
                    return RunResult(
                        mode=RunMode.REPLAY,
                        success=False,
                        steps=[],
                        total_time_ms=0,
                        total_llm_cost=0.0,
                        recording_id=recording.id
                    )
        
        # This shouldn't be reached, but just in case
        return RunResult(
            mode=RunMode.REPLAY,
            success=False,
            steps=[],
            total_time_ms=0,
            total_llm_cost=0.0,
            recording_id=recording.id
        )
    
    async def _execute_replay(self, recording: Recording, starting_url: str = None) -> RunResult:
        """Execute the actual replay."""
        start_time = time.time()
        step_results = []
        
        async with self.browser_manager.page_context() as page:
            # Navigate to starting URL
            if starting_url:
                await page.goto(starting_url, wait_until="domcontentloaded")
                await wait_for_page_stability(page, timeout=3000)
            elif recording.steps and recording.steps[0].action.name == "navigate":
                # Use first navigation step from recording
                nav_step = recording.steps[0]
                await page.goto(nav_step.value, wait_until="domcontentloaded")
                await wait_for_page_stability(page, timeout=3000)
            
            # Execute each step
            for i, step in enumerate(recording.steps):
                logger.debug(f"Step {i+1}/{len(recording.steps)}: {step.action} - {step.description}")
                
                # Execute step
                result = await execute_action(
                    page, step, [],  # No elements array needed for replay
                    screenshot_dir=str(self.screenshot_dir) if self.screenshot_dir else None
                )
                
                step_results.append(result)
                
                # Stop on first failure in pure replay
                if not result.success:
                    logger.warning(f"Step {i+1} failed: {result.error}")
                    break
                
                # Adaptive pause based on action type
                if step.action.name in ["navigate"]:
                    await asyncio.sleep(1.0)  # Longer pause after navigation
                elif step.action.name in ["click", "select"]:
                    await asyncio.sleep(0.5)  # Medium pause after interactions
                else:
                    await asyncio.sleep(0.2)  # Short pause for other actions
        
        total_time = int((time.time() - start_time) * 1000)
        all_steps_completed = len(step_results) == len(recording.steps)
        all_steps_successful = all(r.success for r in step_results)
        success = all_steps_completed and all_steps_successful
        
        return RunResult(
            mode=RunMode.REPLAY,
            success=success,
            steps=step_results,
            total_time_ms=total_time,
            total_llm_cost=0.0,  # No LLM calls in replay
            recording_reuse_rate=1.0,
            recording_id=recording.id
        )
    
    async def validate_recording(self, recording: Recording) -> dict:
        """Validate a recording without executing it (dry run check)."""
        validation = {
            "valid": True,
            "issues": [],
            "step_count": len(recording.steps),
            "has_navigation": False,
            "has_selectors": 0,
            "has_testids": 0,
        }
        
        for i, step in enumerate(recording.steps):
            # Check for navigation
            if step.action.name == "navigate":
                validation["has_navigation"] = True
                if not step.value:
                    validation["issues"].append(f"Step {i+1}: Navigate action missing URL")
                    validation["valid"] = False
            
            # Check element info quality
            if step.element:
                if step.element.selector:
                    validation["has_selectors"] += 1
                if step.element.testId:
                    validation["has_testids"] += 1
                
                # Check for minimal element info
                if not any([
                    step.element.selector,
                    step.element.testId, 
                    step.element.id,
                    step.element.text
                ]):
                    validation["issues"].append(f"Step {i+1}: Element has insufficient identification info")
                    validation["valid"] = False
        
        # Overall quality checks
        if not validation["has_navigation"]:
            validation["issues"].append("Recording has no navigation step - may fail if starting URL not provided")
        
        selector_coverage = validation["has_selectors"] / max(len(recording.steps), 1)
        if selector_coverage < 0.5:
            validation["issues"].append(f"Low selector coverage ({selector_coverage:.1%}) - replay may be unreliable")
        
        return validation
    
    async def benchmark_recording(
        self, 
        recording_id: str, 
        runs: int = 5, 
        starting_url: str = None
    ) -> dict:
        """Benchmark recording performance and reliability."""
        logger.info(f"Benchmarking recording {recording_id} with {runs} runs")
        
        recording = await self.storage.get_recording(recording_id)
        if not recording:
            return {"error": "Recording not found"}
        
        results = []
        total_time = 0
        success_count = 0
        
        for run in range(runs):
            logger.info(f"Benchmark run {run + 1}/{runs}")
            
            result = await self.replay(recording, starting_url, max_retries=0)
            results.append({
                "run": run + 1,
                "success": result.success,
                "time_ms": result.total_time_ms,
                "steps_completed": len(result.steps),
                "failed_at_step": next(
                    (i + 1 for i, r in enumerate(result.steps) if not r.success), 
                    None
                )
            })
            
            total_time += result.total_time_ms
            if result.success:
                success_count += 1
            
            # Brief pause between runs
            await asyncio.sleep(2)
        
        # Calculate statistics
        times = [r["time_ms"] for r in results]
        success_rate = success_count / runs
        
        benchmark = {
            "recording_id": recording_id,
            "recording_name": recording.name,
            "runs": runs,
            "success_rate": success_rate,
            "avg_time_ms": total_time // runs,
            "min_time_ms": min(times) if times else 0,
            "max_time_ms": max(times) if times else 0,
            "results": results
        }
        
        # Identify common failure points
        failure_steps = [r["failed_at_step"] for r in results if r["failed_at_step"]]
        if failure_steps:
            from collections import Counter
            failure_counter = Counter(failure_steps)
            benchmark["common_failure_steps"] = dict(failure_counter.most_common(3))
        
        logger.info(f"Benchmark complete: {success_rate:.1%} success rate, {total_time // runs}ms avg time")
        return benchmark
    
    async def export_recording_as_code(
        self, 
        recording_id: str, 
        format: str = "playwright",
        output_file: str = None
    ) -> str:
        """Export recording as executable code."""
        recording = await self.storage.get_recording(recording_id)
        if not recording:
            raise ValueError(f"Recording not found: {recording_id}")
        
        if format == "playwright":
            code = self._generate_playwright_code(recording)
        elif format == "selenium":
            code = self._generate_selenium_code(recording)
        elif format == "puppeteer":
            code = self._generate_puppeteer_code(recording)
        else:
            raise ValueError(f"Unsupported export format: {format}")
        
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(code)
            logger.info(f"Exported {format} code to: {output_file}")
        
        return code
    
    def _generate_playwright_code(self, recording: Recording) -> str:
        """Generate Playwright test code."""
        lines = [
            "import asyncio",
            "from playwright.async_api import async_playwright",
            "",
            f"async def test_{recording.name.lower().replace(' ', '_').replace('-', '_')}():",
            '    """Auto-generated from Stept recording."""',
            "    async with async_playwright() as p:",
            "        browser = await p.chromium.launch()",
            "        page = await browser.new_page()",
            "        ",
        ]
        
        for step in recording.steps:
            if step.action.name == "navigate":
                lines.append(f"        await page.goto('{step.value}')")
            elif step.action.name == "click" and step.element:
                selector = self._get_selector_for_export(step.element)
                lines.append(f"        await page.locator('{selector}').click()")
            elif step.action.name == "type" and step.element:
                selector = self._get_selector_for_export(step.element)
                lines.append(f"        await page.locator('{selector}').fill('{step.value}')")
            elif step.action.name == "select" and step.element:
                selector = self._get_selector_for_export(step.element)
                lines.append(f"        await page.locator('{selector}').select_option(label='{step.value}')")
            elif step.action.name == "wait":
                lines.append(f"        await page.wait_for_timeout({step.value})")
            
            if step.description:
                lines[-1] = lines[-1] + f"  # {step.description}"
        
        lines.extend([
            "        ",
            "        await browser.close()",
            "",
            "if __name__ == '__main__':",
            f"    asyncio.run(test_{recording.name.lower().replace(' ', '_').replace('-', '_')}())"
        ])
        
        return "\\n".join(lines)
    
    def _get_selector_for_export(self, element) -> str:
        """Get best selector for code export."""
        if element.testId:
            return f'[data-testid="{element.testId}"]'
        elif element.id:
            return f'#{element.id}'
        elif element.selector:
            return element.selector
        elif element.text:
            return f'text="{element.text[:50]}"'
        else:
            return 'body'  # Fallback
    
    def _generate_selenium_code(self, recording: Recording) -> str:
        """Generate Selenium test code (placeholder)."""
        return f"# Selenium export for '{recording.name}' - Not implemented yet"
    
    def _generate_puppeteer_code(self, recording: Recording) -> str:
        """Generate Puppeteer test code (placeholder)."""
        return f"// Puppeteer export for '{recording.name}' - Not implemented yet"
    
    async def close(self):
        """Clean up resources."""
        if hasattr(self.storage, 'close'):
            await self.storage.close()