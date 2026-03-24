"""Recording-first browser automation agent."""

import asyncio
import logging
import time
import uuid
from pathlib import Path
from typing import Optional, Any, Dict, List
import json

from .models import (
    StepAction, StepResult, Recording, RunResult, RunMode, 
    ActionType, ElementInfo
)
from .browser import BrowserManager
from .dom import get_interactive_elements, serialize_elements_for_llm, wait_for_page_stability, inject_listener_tracker, get_page_screenshot
from .actions import execute_action, auto_dismiss_cookie_banner
from .finder import find_and_prepare_element
from .storage.local import LocalStorage
from .storage.remote import RemoteStorage

logger = logging.getLogger(__name__)


# Vision model detection for coordinate-based actions
VISION_MODELS = [
    'claude-sonnet-4', 'claude-opus-4', 'claude-sonnet-3', 'claude-3-5-sonnet',
    'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision',
    'gemini-3-pro', 'gemini-2.0-flash', 'gemini-1.5-pro',
]


class Agent:
    """
    Recording-first browser automation agent.
    
    Execution modes:
    1. REPLAY: Follow recording steps using element finder cascade (fast, no LLM cost)
    2. AGENT: LLM exploration with DOM extraction (flexible, captures new recording)
    3. HYBRID: Follow recording where possible, LLM for missing steps
    """
    
    def __init__(
        self,
        task: str,
        llm_client=None,
        url: str = None,
        headless: bool = True,
        max_steps: int = 30,
        recordings_dir: str = None,
        server_url: str = None,
        api_key: str = None,
        screenshot_dir: str = None,
        browser_type: str = "chromium",
        viewport_size: tuple = (1280, 720)
    ):
        self.task = task
        self.llm_client = llm_client
        self.starting_url = url
        self.headless = headless
        self.max_steps = max_steps
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
        
        logger.info(f"Agent initialized for task: '{task}'")
    
    def _supports_vision(self) -> bool:
        """Check if the configured LLM supports vision/screenshot input."""
        if not self.llm_client:
            return False
        model_name = getattr(self.llm_client, 'model', '') or ''
        return any(v in model_name.lower() for v in VISION_MODELS)
    
    async def _replan_after_stall(self, page, original_task: str, steps_taken: list, plan: list) -> list:
        """Generate a new plan after detecting a stall."""
        from .dom import get_page_info
        
        page_state = await get_page_info(page)
        
        prompt = f"""You were trying to accomplish this task but got stuck:

Task: {original_task}

Original plan:
{chr(10).join(f'{i+1}. {g}' for i, g in enumerate(plan))}

Steps completed so far:
{self._format_steps_for_prompt(steps_taken)}

Current page: {page_state['url']} - {page_state.get('title', '')}

The last few actions didn't change anything. You need a DIFFERENT approach.
Generate a new plan. Each step must be a SPECIFIC browser action (click, type, navigate).

RULES:
- Max 5 steps
- Each step must be a concrete action like "Navigate to imdb.com" or "Type 'query' in search box"
- NO vague steps like "Check resources" or "Use alternative methods"
- If Google is blocked, navigate directly to the answer source (wikipedia.org, imdb.com, etc.)

Return ONLY a numbered list, no explanations."""
        
        # Call LLM for new plan
        new_plan = await self._call_llm_for_plan(prompt)
        return new_plan
    
    async def _call_llm_for_plan(self, prompt: str) -> list:
        """Call LLM to get a new plan."""
        try:
            if hasattr(self.llm_client, 'generate'):
                response = await self.llm_client.generate(prompt)
                content = response.content
            else:
                response = await self.llm_client.create_completion(prompt)
                content = response.get('content', response.get('text', str(response)))
            
            # Parse numbered list
            import re
            lines = content.strip().split('\n')
            goals = []
            for line in lines:
                match = re.match(r'^\d+\.\s*(.+)', line.strip())
                if match:
                    goals.append(match.group(1).strip())
            
            logger.info(f"Generated new plan with {len(goals)} sub-goals after stall")
            return goals[:8]  # Limit to 8 goals max
            
        except Exception as e:
            logger.error(f"Replanning failed: {e}")
            return []
    
    def _compact_history(self, steps_taken: List[StepResult], keep_recent: int = 5) -> str:
        """Compress old step history into a summary to save tokens."""
        if len(steps_taken) <= keep_recent:
            return self._format_steps_for_prompt(steps_taken)
        
        # Summarize old steps
        old_steps = steps_taken[:-keep_recent]
        recent_steps = steps_taken[-keep_recent:]
        
        summary = f"[{len(old_steps)} earlier steps summarized]:\n"
        summary += f"- Started at: {old_steps[0].url_before}\n"
        summary += f"- Actions taken: {', '.join(s.action.action.value for s in old_steps)}\n"
        successful = sum(1 for s in old_steps if s.success)
        summary += f"- {successful}/{len(old_steps)} succeeded\n"
        if old_steps[-1].url_after:
            summary += f"- Ended at: {old_steps[-1].url_after}\n"
        summary += "\n[Recent steps in detail]:\n"
        summary += self._format_steps_for_prompt(recent_steps)
        
        return summary
    
    def _format_steps_for_prompt(self, step_results: List[StepResult]) -> str:
        """Format step results for LLM prompt."""
        if not step_results:
            return "No steps taken yet."
        
        lines = []
        for i, result in enumerate(step_results):
            status = "✓" if result.success else "✗"
            action_desc = result.action.description or f"{result.action.action.value}"
            timing = f"({result.duration_ms}ms)"
            url_change = f" -> {result.url_after}" if result.url_before != result.url_after else ""
            lines.append(f"{i+1}. {status} {action_desc} {timing}{url_change}")
            if not result.success and result.error:
                lines.append(f"   Error: {result.error}")
        
        return "\n".join(lines)
    
    async def run(self) -> RunResult:
        """Main entry point - auto-selects execution mode."""
        try:
            # 1. Find matching recordings
            plan = await self._route_execution()
            
            # 2. Execute based on selected mode
            async with self.browser_manager.page_context() as page:
                # Inject listener tracker before any navigation
                await inject_listener_tracker(page)
                
                # Navigate to starting URL if provided
                if self.starting_url:
                    await page.goto(self.starting_url, wait_until="domcontentloaded")
                    await wait_for_page_stability(page)
                    # Auto-dismiss cookie banners before any interaction
                    await auto_dismiss_cookie_banner(page)
                
                if plan["mode"] == RunMode.REPLAY:
                    result = await self._run_replay(page, plan["recording"])
                elif plan["mode"] == RunMode.HYBRID:
                    result = await self._run_hybrid(page, plan["recording"])
                else:
                    result = await self._run_agent(page, plan.get("context"))
                
                # 3. Save successful runs as recordings
                if result.success and result.mode in [RunMode.AGENT, RunMode.HYBRID]:
                    recording_id = await self._save_run_as_recording(result)
                    result.recording_id = recording_id
                
                # 4. Update recording statistics
                if result.recording_id:
                    await self.storage.update_recording_stats(result.recording_id, result.success)
                
                return result
                
        except Exception as e:
            logger.error(f"Agent run failed: {e}")
            return RunResult(
                mode=RunMode.AGENT,
                success=False,
                steps=[],
                total_time_ms=0,
                total_llm_cost=0.0
            )
        finally:
            # Cleanup
            if hasattr(self.storage, 'close'):
                await self.storage.close()
    
    async def _route_execution(self) -> Dict[str, Any]:
        """Determine execution mode based on available recordings."""
        # Find recordings by task similarity
        task_matches = await self.storage.find_by_task(self.task)
        
        # Find recordings by URL pattern if URL provided
        url_matches = []
        if self.starting_url:
            url_matches = await self.storage.find_by_url(self.starting_url)
        
        # Combine and score matches
        all_matches = {}
        for recording in task_matches + url_matches:
            if recording.id not in all_matches:
                all_matches[recording.id] = recording
        
        if not all_matches:
            logger.info("No matching recordings found - using agent mode")
            return {"mode": RunMode.AGENT}
        
        # Select best recording by combined score
        best_recording = max(all_matches.values(), key=self._score_recording)
        
        # Check task similarity threshold - don't use a bad recording just because URL matches
        task_sim = self._task_similarity(best_recording.name, self.task)
        if task_sim < 0.3:
            logger.info(f"Best recording '{best_recording.name}' has low task similarity ({task_sim:.2f}) - using agent mode")
            return {"mode": RunMode.AGENT}
        
        logger.info(f"Selected recording '{best_recording.name}' (task similarity: {task_sim:.2f})")
        
        # Decide between replay and hybrid based on recording quality
        if self._should_use_replay(best_recording):
            logger.info(f"Using replay mode with recording: {best_recording.name}")
            return {"mode": RunMode.REPLAY, "recording": best_recording}
        else:
            logger.info(f"Using hybrid mode with recording: {best_recording.name}")
            return {"mode": RunMode.HYBRID, "recording": best_recording}
    
    def _task_similarity(self, recording_name: str, task: str) -> float:
        """Simple word overlap score between recording name and current task."""
        words_a = set(recording_name.lower().split())
        words_b = set(task.lower().split())
        # Remove stop words
        stop_words = {'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'it', 'this', 'that', 'with'}
        words_a -= stop_words
        words_b -= stop_words
        if not words_a or not words_b:
            return 0.0
        overlap = words_a & words_b
        return len(overlap) / max(len(words_a), len(words_b))

    def _score_recording(self, recording: Recording) -> float:
        """Score recording for selection (higher = better)."""
        success_rate = recording.success_count / max(recording.success_count + recording.fail_count, 1)
        recency_bonus = 0.1 if recording.last_run_at else 0.0
        completeness = len(recording.steps) / 10  # Assume 10 steps is "complete"
        
        # Add task similarity with high weight (0.5)
        task_sim = self._task_similarity(recording.name, self.task)
        
        return success_rate * 0.3 + recency_bonus + min(completeness, 0.2) + task_sim * 0.5
    
    def _should_use_replay(self, recording: Recording) -> bool:
        """Determine if recording is suitable for pure replay."""
        # Use replay if recording has good success rate and rich element info
        success_rate = recording.success_count / max(recording.success_count + recording.fail_count, 1)
        has_selectors = any(
            step.element and (step.element.selector or step.element.testId or step.element.id)
            for step in recording.steps
        )
        
        return success_rate > 0.7 and has_selectors
    
    async def _run_replay(self, page, recording: Recording) -> RunResult:
        """Mode 1: Deterministic replay from recording."""
        start_time = time.time()
        step_results = []
        
        for i, step in enumerate(recording.steps):
            logger.debug(f"Replaying step {i+1}/{len(recording.steps)}: {step.action}")
            
            # Execute step using recorded element info
            result = await execute_action(
                page, step, [], 
                screenshot_dir=str(self.screenshot_dir) if self.screenshot_dir else None
            )
            
            step_results.append(result)
            
            # Stop on first failure in pure replay mode
            if not result.success:
                logger.warning(f"Replay failed at step {i+1}: {result.error}")
                break
            
            # Brief pause between steps
            await asyncio.sleep(0.3)
        
        total_time = int((time.time() - start_time) * 1000)
        success = all(r.success for r in step_results) and len(step_results) == len(recording.steps)
        
        return RunResult(
            mode=RunMode.REPLAY,
            success=success,
            steps=step_results,
            total_time_ms=total_time,
            total_llm_cost=0.0,  # No LLM calls in pure replay
            recording_reuse_rate=1.0
        )
    
    async def _plan_task(self, task: str, page_state: str) -> List[str]:
        """Break task into numbered sub-goals."""
        if not self.llm_client:
            return []
        
        prompt = f"""Break this task into specific sub-goals:

Task: {task}
Current page: {page_state}

Return a numbered list of concrete actions needed to accomplish this task.
Each sub-goal should be specific and actionable.
Limit to 3-8 sub-goals maximum.

Example format:
1. Navigate to the login page
2. Enter username and password  
3. Click submit button
4. Navigate to the dashboard
5. Find and click the settings menu

Respond with just the numbered list, no additional explanation."""

        try:
            if hasattr(self.llm_client, 'generate'):
                response = await self.llm_client.generate(prompt)
                content = response.content
            else:
                response = await self.llm_client.create_completion(prompt)
                content = response.get('content', response.get('text', str(response)))
            
            # Parse numbered list
            import re
            lines = content.strip().split('\n')
            goals = []
            for line in lines:
                match = re.match(r'^\d+\.\s*(.+)', line.strip())
                if match:
                    goals.append(match.group(1).strip())
            
            logger.info(f"Created task plan with {len(goals)} sub-goals")
            return goals[:8]  # Limit to 8 goals max
            
        except Exception as e:
            logger.error(f"Task planning failed: {e}")
            return []


    async def _validate_action(self, action: StepAction, page_before_url: str, page_after) -> bool:
        """Check if the action had the expected effect."""
        try:
            page_after_url = page_after.url
            
            # Check for URL change (indicates navigation or form submission)
            if page_before_url != page_after_url:
                logger.debug(f"Action caused URL change: {page_before_url} -> {page_after_url}")
                return True
            
            # Check for page content changes using a simple heuristic
            # This could be enhanced with more sophisticated change detection
            if action.action in [ActionType.CLICK, ActionType.TYPE, ActionType.SELECT]:
                # Wait a moment for any changes to manifest
                await page_after.wait_for_timeout(500)
                
                # Check if page title changed
                current_title = await page_after.title()
                # We don't have the previous title stored easily, so skip this check for now
                
                # For now, assume action was effective if it didn't throw an error
                return True
            
            # Navigation, scroll, wait actions are assumed successful if no error
            return True
            
        except Exception as e:
            logger.debug(f"Action validation failed: {e}")
            return False


    def _track_page_state(self, page, step_results: List[StepResult]) -> Dict:
        """Track page states for loop detection."""
        try:
            current_state = {
                'url': page.url,
                'title': '',  # We'll get this synchronously if needed
                'step_count': len(step_results)
            }
            
            # Simple state tracking - could be enhanced
            return current_state
            
        except Exception as e:
            logger.debug(f"Page state tracking failed: {e}")
            return {'url': '', 'title': '', 'step_count': len(step_results)}


    def _detect_loop(self, step_results: List[StepResult], current_state: Dict) -> bool:
        """Detect if agent is stuck in a loop."""
        if len(step_results) < 3:
            return False
        
        # Check last 3 steps for repeated patterns
        recent_steps = step_results[-3:]
        current_url = current_state.get('url', '')
        
        # Simple loop detection: same URL for 3+ consecutive failed actions
        same_url_count = 0
        failed_count = 0
        
        for step in recent_steps:
            if step.url_after == current_url:
                same_url_count += 1
            if not step.success:
                failed_count += 1
        
        # Detect loops: same URL + multiple failures OR repeated identical actions
        if same_url_count >= 3 and failed_count >= 2:
            logger.warning("Loop detected: repeated failures on same page")
            return True
        
        # Check for repeated action types
        recent_actions = [step.action.action for step in recent_steps]
        if len(set(recent_actions)) == 1 and len(recent_actions) >= 3:
            logger.warning(f"Loop detected: repeated {recent_actions[0]} actions")
            return True
        
        return False


    async def _run_agent(self, page, context: Dict = None) -> RunResult:
        """Mode 2: Enhanced LLM agent with planning and loop detection."""
        if not self.llm_client:
            raise ValueError("Agent mode requires LLM client")
        
        start_time = time.time()
        step_results = []
        total_llm_cost = 0.0
        page_states = []
        plan = []
        consecutive_failures = 0
        max_failures = 5
        
        # Planning phase
        try:
            initial_elements = await get_interactive_elements(page)
            initial_elements_text = serialize_elements_for_llm(initial_elements[:10])  # Just first 10 for planning
            page_state_info = f"URL: {page.url}, Elements: {len(initial_elements)} interactive elements"
            
            plan = await self._plan_task(self.task, page_state_info)
            if plan:
                logger.info(f"Task plan: {plan}")
            
        except Exception as e:
            logger.warning(f"Planning phase failed: {e}")
        
        # Track elements between steps for new element detection
        previous_element_ids = set()
        
        for step_num in range(self.max_steps):
            logger.debug(f"Agent step {step_num + 1}/{self.max_steps}")
            
            # 1. Get page state with SPA/empty page handling
            elements = await get_interactive_elements(page)
            
            # 2. Track new elements that appeared since last step
            current_element_ids = set()
            for element in elements:
                # Create unique ID from element properties
                elem_id = self._create_element_id(element)
                current_element_ids.add(elem_id)
                
                # Mark as new if it wasn't in previous step (and this isn't the first step)
                if step_num > 0 and elem_id not in previous_element_ids:
                    element["is_new"] = True
                else:
                    element["is_new"] = False
            
            # Update previous elements for next iteration
            previous_element_ids = current_element_ids
            
            # 3. Check for empty or minimal DOM (SPA loading)
            if len(elements) <= 1:
                logger.warning("Empty or minimal DOM detected, waiting for SPA to render...")
                await asyncio.sleep(2.5)  # Wait for SPA content
                # Retry DOM extraction
                elements = await get_interactive_elements(page)
                if len(elements) <= 1:
                    # Still empty - try scrolling or pressing Escape to dismiss modal
                    logger.warning("Still empty after wait, trying to dismiss modal...")
                    try:
                        await page.keyboard.press('Escape')
                        await asyncio.sleep(1.0)
                        elements = await get_interactive_elements(page)
                    except Exception as e:
                        logger.debug(f"Modal dismiss failed: {e}")
                        
                    # If still empty, check if we're on a bot detection page
                    if len(elements) <= 1:
                        current_url = page.url
                        page_content = await page.content()
                        
                        # Check for bot detection indicators
                        bot_detection_signals = [
                            'solveSimpleChallenge', 'captcha', 'verify you are human',
                            'unusual traffic', 'automated requests', 'blocked', 'challenge'
                        ]
                        
                        is_bot_detection = any(signal.lower() in page_content.lower() 
                                             for signal in bot_detection_signals)
                        
                        if is_bot_detection and 'google.com' in current_url:
                            logger.warning("Bot detection page detected, trying DuckDuckGo as alternative...")
                            try:
                                # Navigate to DuckDuckGo as alternative
                                await page.goto('https://duckduckgo.com', wait_until="domcontentloaded")
                                await asyncio.sleep(1.0)
                                elements = await get_interactive_elements(page)
                                logger.info(f"Switched to DuckDuckGo, found {len(elements)} elements")
                            except Exception as e:
                                logger.debug(f"DuckDuckGo fallback failed: {e}")
                        else:
                            logger.warning("Page appears to be empty or blocked, scrolling...")
                            try:
                                await page.mouse.wheel(0, 500)  # Scroll down
                                await asyncio.sleep(1.0)
                                elements = await get_interactive_elements(page)
                            except Exception:
                                pass
            
            elements_text = serialize_elements_for_llm(elements)
            
            # 4. Track state for loop detection
            current_state = self._track_page_state(page, step_results)
            page_states.append(current_state)
            
            # 5. Loop detection and replanning
            if step_num > 2 and self._detect_loop(step_results, current_state):
                logger.warning("Loop detected, attempting to replan")
                context = context or {}
                context['loop_warning'] = True
                context['recent_failures'] = [r.error for r in step_results[-3:] if not r.success]
                
                # Attempt replanning after stall
                try:
                    new_plan = await self._replan_after_stall(page, self.task, step_results, plan)
                    if new_plan:
                        logger.info(f"Generated new plan after stall: {new_plan}")
                        plan = new_plan  # Replace current plan
                        context['replanned'] = True
                except Exception as e:
                    logger.warning(f"Replanning failed: {e}")
            
            # 6. Build prompt with plan context
            prompt = self._build_agent_prompt(
                elements_text=elements_text,
                step_results=step_results,
                context=context,
                plan=plan,
                step_number=step_num + 1
            )
            
            # 7. Get LLM decision
            action, llm_cost = await self._get_llm_decision(page, prompt)
            total_llm_cost += llm_cost
            
            # 8. Check if done
            if action.action == ActionType.DONE:
                # Extract enhanced fields from action if available
                enhanced = getattr(action, '_enhanced_output', {})
                step_results.append(StepResult(
                    success=True,
                    action=action,
                    url_before=page.url,
                    url_after=page.url,
                    llm_cost=llm_cost,
                    thinking=enhanced.get('thinking'),
                    evaluation=enhanced.get('evaluation'),
                    memory=enhanced.get('memory'),
                    next_goal=enhanced.get('next_goal')
                ))
                break
            
            # 9. Execute action
            page_before_url = page.url
            result = await execute_action(
                page, action, elements,
                screenshot_dir=str(self.screenshot_dir) if self.screenshot_dir else None
            )
            result.llm_cost = llm_cost
            
            # 8. Enhance result with agent reasoning fields
            enhanced = getattr(action, '_enhanced_output', {})
            result.thinking = enhanced.get('thinking')
            result.evaluation = enhanced.get('evaluation')
            result.memory = enhanced.get('memory')
            result.next_goal = enhanced.get('next_goal')
            
            # 9. Validate action effectiveness
            action_valid = await self._validate_action(action, page_before_url, page)
            if not action_valid:
                logger.warning(f"Action may not have been effective: {action.action}")
            
            # 10. Enrich action with element info for recording
            if action.element and action.element.index is not None and elements:
                target_element = elements[action.element.index]
                action.element.selector = target_element.get("selector")
                action.element.testId = target_element.get("testId")
                action.element.id = target_element.get("id")
                action.element.tagName = target_element.get("tagName")
                action.element.text = target_element.get("text")
                action.element.ariaLabel = target_element.get("ariaLabel")
                action.element.role = target_element.get("role")
            
            step_results.append(result)
            
            # 11. Handle failure with counter (don't break on first failure)
            if not result.success:
                consecutive_failures += 1
                logger.warning(f"Agent step failed: {result.error} (consecutive failures: {consecutive_failures})")
                if consecutive_failures >= max_failures:
                    logger.warning(f"Breaking after {max_failures} consecutive failures")
                    break
            else:
                consecutive_failures = 0  # Reset counter on success
            
            # 12. Brief pause
            await asyncio.sleep(0.5)
        
        total_time = int((time.time() - start_time) * 1000)
        has_done_action = any(r.action.action == ActionType.DONE for r in step_results)
        success = all(r.success for r in step_results) and has_done_action
        
        return RunResult(
            mode=RunMode.AGENT,
            success=success,
            steps=step_results,
            total_time_ms=total_time,
            total_llm_cost=total_llm_cost,
            recording_reuse_rate=0.0
        )
    
    async def _run_hybrid(self, page, recording: Recording) -> RunResult:
        """Mode 3: Follow recording, switch to agent when stuck."""
        # First attempt replay
        replay_result = await self._run_replay(page, recording)
        
        if replay_result.success:
            return replay_result
        
        # Find where replay failed
        failed_step_idx = next(
            (i for i, r in enumerate(replay_result.steps) if not r.success),
            len(replay_result.steps)
        )
        
        logger.info(f"Replay failed at step {failed_step_idx + 1}, switching to agent mode")
        
        # Continue from failure point with agent
        context = {
            "partial_recording": recording.name,
            "completed_steps": failed_step_idx,
            "total_steps": len(recording.steps),
            "remaining_steps": [
                step.model_dump() for step in recording.steps[failed_step_idx:]
            ]
        }
        
        agent_result = await self._run_agent(page, context)
        
        # Combine results
        combined_steps = replay_result.steps[:failed_step_idx] + agent_result.steps
        replay_steps = len(replay_result.steps[:failed_step_idx])
        
        return RunResult(
            mode=RunMode.HYBRID,
            success=agent_result.success,
            steps=combined_steps,
            total_time_ms=replay_result.total_time_ms + agent_result.total_time_ms,
            total_llm_cost=agent_result.total_llm_cost,
            recording_reuse_rate=replay_steps / max(len(combined_steps), 1)
        )
    
    def _build_agent_prompt(
        self, 
        elements_text: str, 
        step_results: List[StepResult], 
        context: Dict = None,
        plan: List[str] = None,
        step_number: int = 1
    ) -> str:
        """Build per-step user message. System prompt is sent separately."""
        prompt_parts = [
            f"<user_request>{self.task}</user_request>",
            "",
        ]

        # Executive summary for complex workflows  
        if step_results and len(step_results) >= 3:
            successful_steps = len([r for r in step_results if r.success])
            prompt_parts.extend([
                f"**PROGRESS OVERVIEW:** {successful_steps}/{len(step_results)} steps completed successfully.",
                f"**CURRENT URL:** {step_results[-1].url_after if step_results else 'Unknown'}",
                "",
            ])

        # Enhanced task plan with status tracking
        if plan:
            prompt_parts.extend([
                "**TASK BREAKDOWN:**"
            ])
            for i, goal in enumerate(plan, 1):
                if i < step_number:
                    status = "✅ COMPLETED"
                elif i == step_number:
                    status = "🔄 IN PROGRESS"
                else:
                    status = "⭕ PENDING"
                prompt_parts.append(f"{i}. {status}: {goal}")
            prompt_parts.extend(["", f"**FOCUS:** Currently working on step {step_number}/{len(plan)}", ""])

        # Critical warnings for loops and failures
        if context and context.get("loop_warning"):
            prompt_parts.extend([
                "🚨 **CRITICAL ALERT:** Loop detected! You've been repeating actions without progress.",
                "**REQUIRED ACTION:** Try a completely different approach or call done() if task is actually complete.",
                f"**RECENT FAILURES:** {', '.join(context.get('recent_failures', []))}",
                "",
            ])

        # Recording context for hybrid mode
        if context and context.get("remaining_steps"):
            prompt_parts.extend([
                "**CONTEXT:** Following a recorded workflow that partially failed.",
                f"**PROGRESS:** {context.get('completed_steps', 0)}/{context.get('total_steps', '?')} recorded steps completed.",
                "**ADAPTATION:** The remaining recorded steps may not work exactly - adapt them to current page state.",
                "",
            ])

        # Page state and interactive elements
        prompt_parts.extend([
            "**CURRENT PAGE ELEMENTS:**",
            "Interactive elements are numbered [index] for your reference. Only use indexes that appear below.",
            "",
            elements_text,
            "",
        ])

        # Detailed step history with rich context
        if step_results:
            prompt_parts.extend([
                "**EXECUTION HISTORY:**"
            ])
            
            # Show recent detailed steps or compacted history for long runs
            if len(step_results) > 8:
                # Compact old steps, show recent ones in detail
                old_steps = step_results[:-5]
                recent_steps = step_results[-5:]
                
                # Summarize old steps
                successful_old = len([s for s in old_steps if s.success])
                prompt_parts.extend([
                    f"[Earlier Steps 1-{len(old_steps)}]: {successful_old}/{len(old_steps)} successful",
                    f"  • Started at: {old_steps[0].url_before}",
                    f"  • Key actions: {', '.join(set(s.action.action.value for s in old_steps[-3:]))}",
                    "",
                    "[Recent Steps - Detailed]:"
                ])
                
                # Detailed recent steps
                for i, result in enumerate(recent_steps, len(old_steps) + 1):
                    self._add_detailed_step_info(prompt_parts, i, result)
            else:
                # Show all steps in detail for shorter runs
                for i, result in enumerate(step_results, 1):
                    self._add_detailed_step_info(prompt_parts, i, result)
            
            prompt_parts.append("")

        # Available actions with enhanced guidance
        action_section = self._build_action_guidance()
        prompt_parts.extend(action_section)

        # Critical rules section inspired by browser-use
        rules_section = self._build_critical_rules()
        prompt_parts.extend(rules_section)

        # Enhanced output format requirements
        output_section = self._build_output_format_requirements()
        prompt_parts.extend(output_section)

        # Pre-done verification checklist
        verification_section = self._build_verification_checklist()
        prompt_parts.extend(verification_section)

        # Error recovery guidance
        error_section = self._build_error_recovery_guidance()
        prompt_parts.extend(error_section)

        return "\n".join(prompt_parts)
    
    def _add_detailed_step_info(self, prompt_parts: List[str], step_num: int, result: StepResult):
        """Add detailed step information to prompt."""
        status = "✅" if result.success else "❌"
        action_desc = result.action.description or f"{result.action.action.value}"
        
        # Enhanced step info with timing and URL changes
        timing_info = f"({result.duration_ms}ms)"
        url_change = ""
        if result.url_before != result.url_after:
            url_change = f" 🔗 {result.url_after}"
        
        prompt_parts.append(f"Step {step_num}: {status} {action_desc} {timing_info}{url_change}")
        
        # Add error details for failed steps
        if not result.success and result.error:
            prompt_parts.append(f"  ⚠️ Error: {result.error}")
        
        # Add agent reasoning if available (from enhanced output)
        if hasattr(result, 'memory') and result.memory:
            prompt_parts.append(f"  📝 Memory: {result.memory}")
        if hasattr(result, 'next_goal') and result.next_goal:
            prompt_parts.append(f"  🎯 Goal: {result.next_goal}")

    def _build_action_guidance(self) -> List[str]:
        """Build comprehensive action guidance section."""
        guidance = [
            "**AVAILABLE ACTIONS:**"
        ]
        
        if self._supports_vision():
            guidance.extend([
                "**Vision-Enhanced Actions** (you can see the page screenshot):",
                "• `click` - Click an element using [index] from the elements list",
                "• `click_at` - Click at specific pixel coordinates (x, y) when element lacks index",
                "• `type` - Type text into an input field using [index]",
                "• `type_at` - Click at coordinates then type text (for unlisted inputs)",
                "• `select` - Choose option from dropdown using [index] (provide option text as value)",
                "• `navigate` - Go to a new URL (provide full URL as value)",
                "• `scroll` - Scroll page (values: 'up', 'down', 'left', 'right', or pixel amount)",
                "• `wait` - Wait for specified milliseconds (provide number as value)",
                "• `done` - Mark task as completed (provide final result as value)",
                ""
            ])
        else:
            guidance.extend([
                "**Standard Actions:**",
                "• `click` - Click an element using [index] from the elements list",
                "• `type` - Type text into an input field using [index]",
                "• `select` - Choose option from dropdown using [index] (provide option text as value)",
                "• `navigate` - Go to a new URL (provide full URL as value)",
                "• `scroll` - Scroll page (values: 'up', 'down', 'left', 'right', or pixel amount)",
                "• `wait` - Wait for specified milliseconds (provide number as value)",
                "• `done` - Mark task as completed (provide final result as value)",
                ""
            ])

        guidance.extend([
            "**Action Patterns:**",
            "• **Search workflows:** Type search term → Wait for autocomplete → Select suggestion OR press Enter",
            "• **Form filling:** Type into each required field → Click submit button",
            "• **Navigation:** Click links/buttons → Wait for page load → Continue with next action",
            "• **Data extraction:** Scroll to find information → Read carefully → Call done() with complete details",
            ""
        ])

        return guidance

    def _build_critical_rules(self) -> List[str]:
        """Build comprehensive critical rules section inspired by browser-use."""
        rules = [
            "**🎯 ANSWER EXTRACTION (MOST IMPORTANT):**",
            "When the task asks you to FIND, SEARCH, LOOK UP, or PROVIDE information:",
            "- Read the page text in the elements list — the answer is often RIGHT THERE in the element text",
            "- Extract SPECIFIC data: names, numbers, dates, ratings, prices — NOT descriptions of the page",
            '- BAD answer: "The page shows search results for quantum computing"',
            '- GOOD answer: "Paper: Quantum Error Correction with Surface Codes, Authors: Smith et al., Date: 2026-03-20"',
            "- Call done() with the ACTUAL extracted information, not a summary of what you see",
            "- Include ALL details the user asked for (pronunciation, ratings, dates, prices, etc.)",
            "",
            "**🎯 CRITICAL EXECUTION RULES:**",
            "",
            "**Element Interaction Fundamentals:**",
            "• ONLY use [index] numbers that appear in the current page elements list above",
            "• Elements marked (HAS_LISTENERS) are likely clickable and responsive", 
            "• Elements marked (DISABLED) cannot be interacted with - find alternatives",
            "• Elements marked (REQUIRED) must be filled before form submission",
            "• Elements marked (INVALID) have validation errors - check requirements",
            "• Elements marked (SCROLL: X pages) indicate scrollable content - use scroll action",
            "• Elements marked with *[index] appeared since your last action - they may be dropdowns, modals, or dynamic content requiring immediate attention",
            "",
            "**Action Success Verification Protocol:**",
            "• ALWAYS verify your previous action succeeded before proceeding to the next action",
            "• Success indicators: URL changes, new elements appearing (*[index]), content updates, page title changes",
            "• If an action appears to have no effect, wait one step to see if changes are loading",
            "• If an action fails 2-3 times consecutively, STOP repeating and try a completely different approach",
            "• Never assume an action succeeded just because it didn't throw an error",
            "",
            "**Autocomplete and Dropdown Handling:**",
            "• For autocomplete fields: Type your search text → WAIT one step → Check for dropdown suggestions → Select appropriate option",
            "• DO NOT press Enter immediately after typing in autocomplete fields",
            "• If dropdown appears (*[index] elements), click the correct suggestion instead of pressing Enter",
            "• For date/time inputs, use proper formats: YYYY-MM-DD for dates, HH:MM for times",
            "• For select dropdowns, use exact option text as the value",
            "",
            "**Page State Management:**",
            "• Handle popups, modals, cookie banners, and overlays IMMEDIATELY before attempting other actions",
            "• Common popup dismissal patterns: X buttons, Close, Dismiss, No thanks, Accept All, Reject All",
            "• If blocked by bot detection or CAPTCHAs, try alternative websites or search engines",
            "• If login walls appear unexpectedly, try accessing information through search engines or public pages",
            "• Check for notification bars, cookie consents, or subscription prompts that might block interaction",
            "",
            "**Search and Navigation Strategy:**", 
            "• When user specifies criteria (price range, ratings, dates, locations), apply ALL filters BEFORE browsing results",
            "• Use specific search terms rather than browsing categories randomly",
            "• Look for 'advanced search' or 'filter' options to narrow down results efficiently",
            "• Read existing page content carefully - answers are often already visible without navigation",
            "• For e-commerce: look for product specifications, pricing tables, feature comparisons on product pages",
            "• For information gathering: check page headers, sidebars, and footer content",
            "",
            "**Form Interaction Best Practices:**",
            "• Fill required fields first (marked as REQUIRED)",
            "• Check for field validation messages and correct errors immediately",
            "• For multi-step forms, complete each section before proceeding",
            "• Look for 'Continue', 'Next', or 'Submit' buttons after filling forms",
            "• If form submission fails, check for missing required fields or validation errors",
            "",
            "**Error Recovery and Alternative Strategies:**",
            "• If stuck on same URL for 3+ consecutive actions, navigate to a different starting point",
            "• If login/payment walls block progress, try different sites, search engines, or public directories",
            "• If page appears empty or minimal, wait 2-3 seconds then scroll or dismiss modals",
            "• If elements frequently fail to be found, the page might be loading slowly - use wait action",
            "• For access denied errors (403), try alternative approaches rather than retrying the same URL",
            "• NEVER repeat the exact same failing action more than 2-3 times",
            "",
            "**Content Reading and Data Extraction:**",
            "• Scroll down to see more content before concluding information is missing",
            "• Check multiple sections: main content, sidebars, headers, footers, tabs",
            "• Look for 'More details', 'Specifications', or 'Show more' links to reveal additional information",
            "• When extracting data, include ALL relevant details: prices, specifications, dates, contact info",
            "• If partial information is found, note what's missing and continue searching other sections",
            "",
            "**Performance and Efficiency Guidelines:**",
            "• Combine related actions when possible (fill multiple form fields in sequence)",
            "• Use direct navigation when you know specific URLs rather than browsing through menus",
            "• Prefer search over manual browsing when looking for specific information",
            "• If a task requires multiple pages, bookmark or note important URLs for reference",
            ""
        ]

        return rules

    def _build_output_format_requirements(self) -> List[str]:
        """Build structured output format requirements."""
        format_reqs = [
            "**📋 REQUIRED RESPONSE FORMAT:**",
            "",
            "You MUST respond with a JSON object containing these fields:",
            "",
            "```json",
            "{",
            '  "thinking": "Your reasoning about the current state and what to do next",',
            '  "evaluation": "Assessment of your previous action (succeeded/failed and why)", ',
            '  "memory": "Key information to remember (progress, findings, what you\'ve tried)",',
            '  "next_goal": "Specific goal for this next action",',
            '  "action": "click|type|select|navigate|scroll|wait|done|click_at|type_at",',
            '  "element_index": 5,  // Only for click, type, select actions',
            '  "value": "text to type or URL to navigate",  // When needed',
            '  "x": 450,  // Only for click_at, type_at actions',
            '  "y": 320,  // Only for click_at, type_at actions',
            '  "description": "Brief description of what this action will accomplish"',
            "}",
            "```",
            "",
            "**Field Guidelines:**",
            '• `thinking`: Analyze page state, progress toward goal, and plan next step',
            '• `evaluation`: If previous action exists, assess if it succeeded/failed and why',
            '• `memory`: Track what you\'ve found, tried, and still need to accomplish',
            '• `next_goal`: Be specific about the immediate objective',
            '• `action`: Choose from available actions (see list above)',
            '• `element_index`: Required for click/type/select, must match [index] from elements list',
            '• `value`: Required for type/navigate/scroll, optional for others',
            '• `x`, `y`: Only for click_at/type_at coordinate-based actions',
            '• `description`: Helpful for debugging and understanding intent',
            ""
        ]

        return format_reqs

    def _build_verification_checklist(self) -> List[str]:
        """Build comprehensive pre-done verification checklist."""
        verification = [
            "**✅ PRE-DONE VERIFICATION CHECKLIST:**",
            "",
            "Before calling `done`, perform this systematic verification:",
            "",
            "**1. Request Analysis:**",
            "   • Re-read the original user request word by word",
            "   • List every specific requirement, criteria, or piece of information requested",
            "   • Note any format requirements (JSON, list, table, specific fields)",
            "   • Check for quantity requirements (find 5 items, get 3 prices, etc.)",
            "",
            "**2. Completeness Check:**",
            "   • Did you find ALL requested information types?",
            "   • Did you meet any quantity requirements (number of items, examples, etc.)?",
            "   • Are any requested fields missing or incomplete?",
            "   • Did you check all relevant sections of the page/site?",
            "",
            "**3. Data Accuracy Verification:**",
            "   • ALL facts, prices, dates, names, URLs must come from page content you actually saw during this session",
            "   • NEVER use your training knowledge to fill gaps or make assumptions",
            "   • Every piece of data should be traceable to a specific page you visited",
            "   • If information seems outdated, note when it was last updated (if available)",
            "",
            "**4. Format and Structure Compliance:**",
            "   • Does your output match the user's requested format exactly?",
            "   • Are required fields included (prices, descriptions, links, etc.)?",
            "   • Is the data structured as requested (table, list, JSON, paragraphs)?",
            "   • Are units included for numerical data (currencies, measurements)?",
            "",
            "**5. Action Confirmation:**",
            "   • If you submitted forms, placed orders, or made changes - verify they succeeded",
            "   • Check for confirmation messages, updated page content, or changed URLs",
            "   • If actions failed, include error messages in your results",
            "",
            "**6. Quality and Detail Assessment:**",
            "   • Is the information specific enough to be useful?",
            "   • Did you include context that helps understand the data?",
            "   • Are there any relevant warnings, disclaimers, or conditions mentioned?",
            "   • Did you note any limitations of the data you found?",
            "",
            "**Data Grounding Rules:**",
            "• ✅ VALID: 'Price shown as $299 on the product page'",
            "• ❌ INVALID: 'Price is probably around $300' (guessed)",
            "• ✅ VALID: 'Contact form submitted successfully - confirmation page displayed'",
            "• ❌ INVALID: 'I submitted the form' (without verification)",
            "• If information is missing from pages you visited, explicitly state: 'Could not find [specific item] after checking [pages visited]'",
            "",
            "**Final Decision Criteria:**",
            "• ✅ Call done() with full results if 100% of requirements met with verified data",
            "• ⚠️ Call done() with partial results if blocked by technical issues but include what you found",
            "• ❌ Continue working if key requirements are unmet and alternatives exist",
            "• Include ALL findings in the `value` field, clearly structured and complete",
            "",
            "**Output Quality Standards:**",
            "• Be specific: Include exact prices, model numbers, dates, and specifications",
            "• Be complete: Don't leave out details that were requested",
            "• Be honest: Clearly distinguish between what you found vs what you couldn't find",
            "• Be helpful: Include context and explanations that make the data useful",
            ""
        ]

        return verification

    def _build_error_recovery_guidance(self) -> List[str]:
        """Build comprehensive error recovery guidance section."""
        recovery = [
            "**🔧 ERROR RECOVERY STRATEGIES:**",
            "",
            "**Action Failure Troubleshooting:**",
            "• **Element Not Found:** Verify [index] exists in current elements list, try scrolling to reveal more elements",
            "• **Click Failed:** Check if element is disabled, covered by modal, or requires different interaction method",
            "• **Type Failed:** Ensure element is an input field, not disabled, and accepts text input",
            "• **Select Failed:** Verify dropdown is expanded and option text exactly matches available choices",
            "• **Page Changes Unexpectedly:** Wait for stability, dismiss new popups, check if navigation occurred",
            "",
            "**Interaction Pattern Failures:**",
            "• **Autocomplete Issues:** Type partial text → wait 1 step → look for *[index] dropdown → select option (don't press Enter)",
            "• **Form Submission Problems:** Check all required fields filled, look for validation errors, find correct submit button",
            "• **Search Results:** Try different keywords, check spelling, use filters, look for 'no results' messages",
            "• **Navigation Problems:** Use breadcrumbs, site maps, or direct URLs instead of complex menu navigation",
            "",
            "**Loop Detection and Breaking:**",
            "• **Same Page Loops:** If on same URL for 3+ actions, navigate to completely different starting point",
            "• **Action Repetition:** If same action type fails repeatedly, switch to alternative approach",
            "• **Pattern Breaking:** Try search engines, direct navigation, or different websites entirely",
            "• **Alternative Entry Points:** Use Google, Wikipedia, or public directories to find information",
            "",
            "**Page Loading and Content Issues:**",
            "• **Empty/Minimal Pages:** Wait 2-3 seconds for SPA content, scroll down for lazy-loading, dismiss blocking modals",
            "• **Dynamic Content:** Look for loading indicators, wait for animations to complete, check for *[index] new elements",
            "• **JavaScript Errors:** Refresh page, try different browser actions, or navigate to alternative sources",
            "• **Slow Loading:** Use wait action with appropriate timeouts, check network connectivity messages",
            "",
            "**Access and Permission Problems:**",
            "• **Login Walls:** Look for 'Continue as Guest', try alternative sites, or use search engines for public information",
            "• **Paywalls:** Try free alternatives, search for public summaries, or note limitation in results",
            "• **Geographic Restrictions:** Try different country domains (.com vs .uk), or note regional limitations",
            "• **Bot Detection:** Try alternative search engines (DuckDuckGo), different sites, or note detection in results",
            "",
            "**Information Gathering Failures:**",
            "• **Missing Data:** Check multiple page sections (tabs, accordions, 'show more' links), search site specifically",
            "• **Outdated Information:** Look for 'last updated' dates, try official sources, note data freshness concerns",
            "• **Incomplete Results:** Use site search, try related terms, check FAQ or help sections",
            "• **Conflicting Information:** Note discrepancies, prefer official sources, include multiple perspectives",
            "",
            "**Technical Recovery Patterns:**",
            "• **Viewport Issues:** Scroll to bring elements into view, try different scroll positions",
            "• **Timing Problems:** Use wait action between related operations, allow time for page updates",
            "• **State Synchronization:** Verify page state matches expectations before proceeding with next action",
            "• **Element Staleness:** Re-identify elements after page changes, update element indexes",
            "",
            "**Alternative Strategy Framework:**",
            "• **Primary Approach Fails:** Try direct search instead of navigation menus",
            "• **Secondary Approach Fails:** Use competitor sites or alternative sources",
            "• **Tertiary Approach Fails:** Try search engines or public databases",
            "• **All Approaches Fail:** Document attempts and call done() with partial results and clear explanations",
            "",
            "**Progressive Fallback Strategy:**",
            "1. **Direct Method:** Use intended site/feature as designed",
            "2. **Alternative Method:** Same site, different approach (search vs browse)",
            "3. **Alternative Source:** Different website with same information",
            "4. **Search Engine:** Google/DuckDuckGo to find information on any site",
            "5. **Partial Results:** Document what was found and what couldn't be accessed",
            "",
            "**Critical Recovery Rules:**",
            "• Never give up after just 1-2 attempts - try at least 3 different approaches",
            "• Always document what was tried and why it failed",
            "• Include partial results rather than empty results when blocked",
            "• Be explicit about limitations and blockers encountered",
            "• If completely stuck, explain the situation and provide whatever information was gathered",
            ""
        ]

        return recovery
    
    async def _get_llm_decision(self, page, prompt: str) -> tuple[StepAction, float]:
        """Get LLM decision and parse into StepAction with vision support and bulletproof parsing."""
        from .prompts import SYSTEM_PROMPT
        max_retries = 2
        
        for retry_attempt in range(max_retries + 1):
            try:
                # Always take a screenshot
                screenshot = await get_page_screenshot(page)
                
                # Add retry-specific instruction for failed parsing attempts
                if retry_attempt > 0:
                    retry_prompt = f"""Your previous response was not valid JSON. Please respond with ONLY a JSON object like:
{{"action": "click", "element_index": 5}}

Original prompt:
{prompt}"""
                    current_prompt = retry_prompt
                else:
                    current_prompt = prompt
                
                # Prepare messages with system prompt
                if self._supports_vision():
                    import base64
                    screenshot_b64 = base64.b64encode(screenshot).decode('utf-8')
                    
                    messages = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": current_prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}
                                }
                            ]
                        }
                    ]
                    
                    # Call LLM with vision content
                    if hasattr(self.llm_client, 'generate_with_vision'):
                        response = await self.llm_client.generate_with_vision(messages)
                        cost = getattr(response, 'cost', 0.02)  # Vision models typically cost more
                        content = response.content
                    elif hasattr(self.llm_client, 'create_completion'):
                        response = await self.llm_client.create_completion(messages=messages)
                        cost = 0.02
                        content = response.get('content', response.get('text', str(response)))
                    else:
                        # Fallback - try generate with just text
                        response = await self.llm_client.generate(current_prompt)
                        cost = 0.01
                        content = response.content
                else:
                    # Non-vision models - send system + user messages
                    messages = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": current_prompt}
                    ]
                    if hasattr(self.llm_client, 'generate_with_vision'):
                        # Reuse the messages-based API even for non-vision
                        response = await self.llm_client.generate_with_vision(messages)
                        cost = getattr(response, 'cost', 0.01)
                        content = response.content
                    elif hasattr(self.llm_client, 'generate'):
                        # Fallback: combine system + user into one prompt
                        combined = f"{SYSTEM_PROMPT}\n\n{current_prompt}"
                        response = await self.llm_client.generate(combined)
                        cost = getattr(response, 'cost', 0.01)
                        content = response.content
                    else:
                        response = await self.llm_client.create_completion(current_prompt)
                        cost = 0.01
                        content = response.get('content', response.get('text', str(response)))
                
                # Parse JSON response with bulletproof error handling
                decision = await self._parse_llm_response(content)
                
                # Extract the enhanced agent output fields
                thinking = decision.get('thinking', '')
                evaluation = decision.get('evaluation', '')
                memory = decision.get('memory', '')
                next_goal = decision.get('next_goal', '')
                
                # Log the enhanced output for debugging
                logger.debug(f"Agent thinking: {thinking}")
                logger.debug(f"Agent evaluation: {evaluation}")
                logger.debug(f"Agent memory: {memory}")
                logger.debug(f"Agent next_goal: {next_goal}")
                
                # Convert to StepAction with field aliases and case normalization
                action_str = decision.get('action', '').lower().strip()
                
                # Handle common action name variations - convert to lowercase for consistency with ActionType enum
                action_aliases = {
                    'type': 'type',
                    'click': 'click', 
                    'scroll': 'scroll',
                    'navigate': 'navigate',
                    'select': 'select',
                    'wait': 'wait',
                    'done': 'done',
                    'click_at': 'click_at',
                    'type_at': 'type_at'
                }
                
                normalized_action = action_aliases.get(action_str, action_str)
                
                action_type = ActionType(normalized_action)
                element = None
                coordinate_x = None
                coordinate_y = None
                
                # Handle element index with aliases (element_index, index)
                element_index = decision.get('element_index') or decision.get('index')
                if element_index is not None:
                    element = ElementInfo(index=element_index)
                
                # Handle value with aliases (value, result) and ensure it's a string
                raw_value = decision.get('value') or decision.get('result')
                value = str(raw_value) if raw_value is not None else None
                
                # Handle coordinate-based actions
                if action_type in [ActionType.CLICK_AT, ActionType.TYPE_AT]:
                    coordinate_x = decision.get('x')
                    coordinate_y = decision.get('y')
                    if coordinate_x is None or coordinate_y is None:
                        raise ValueError(f"Coordinate action {action_type} requires x and y coordinates")
                
                action = StepAction(
                    action=action_type,
                    element=element,
                    value=value,
                    description=decision.get('description'),
                    coordinate_x=coordinate_x,
                    coordinate_y=coordinate_y
                )
                
                # Store the enhanced fields for later use
                action._enhanced_output = {
                    'thinking': thinking,
                    'evaluation': evaluation,
                    'memory': memory,
                    'next_goal': next_goal
                }
                
                logger.debug(f"LLM decided: {action.action} - {action.description}")
                return action, cost
                
            except Exception as e:
                logger.warning(f"LLM decision failed (attempt {retry_attempt + 1}/{max_retries + 1}): {e}")
                if retry_attempt == max_retries:
                    # Final fallback: return scroll action instead of failing completely
                    logger.error(f"All parsing attempts failed, falling back to scroll action")
                    return StepAction(action=ActionType.SCROLL, value="down", description="LLM parse failed, scrolling to continue"), 0.0
        
        # Should not reach here, but safety fallback
        return StepAction(action=ActionType.SCROLL, value="down", description="LLM parse failed, scrolling to continue"), 0.0
    
    async def _parse_llm_response(self, content: str) -> dict:
        """Parse LLM response with multiple strategies for maximum robustness and backward compatibility."""
        content = content.strip()
        
        # Strategy 1: Direct JSON parse
        try:
            parsed = json.loads(content)
            return self._ensure_enhanced_fields(parsed)
        except json.JSONDecodeError:
            pass
        
        # Strategy 2: Remove markdown code fences
        import re
        content_clean = re.sub(r'```(?:json)?\s*', '', content, flags=re.IGNORECASE)
        content_clean = re.sub(r'\s*```', '', content_clean)
        
        try:
            parsed = json.loads(content_clean.strip())
            return self._ensure_enhanced_fields(parsed)
        except json.JSONDecodeError:
            pass
        
        # Strategy 3: Extract JSON object from text
        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content_clean, re.DOTALL)
        if json_match:
            json_text = json_match.group(0)
            
            # Try direct parse
            try:
                parsed = json.loads(json_text)
                return self._ensure_enhanced_fields(parsed)
            except json.JSONDecodeError:
                pass
            
            # Try with single quotes to double quotes
            try:
                json_fixed = json_text.replace("'", '"')
                parsed = json.loads(json_fixed)
                return self._ensure_enhanced_fields(parsed)
            except json.JSONDecodeError:
                pass
            
            # Try Python literal eval for Python-like dict syntax
            try:
                import ast
                parsed = ast.literal_eval(json_text)
                return self._ensure_enhanced_fields(parsed)
            except (ValueError, SyntaxError):
                pass
        
        # Strategy 4: Extract key-value pairs with regex (backward compatibility)
        action_match = re.search(r'"?action"?\s*:\s*"?([^",\s}]+)"?', content, re.IGNORECASE)
        if action_match:
            parsed = {"action": action_match.group(1).strip('"')}
            
            # Extract element_index/index
            index_match = re.search(r'"?(?:element_index|index)"?\s*:\s*(\d+)', content, re.IGNORECASE)
            if index_match:
                parsed["element_index"] = int(index_match.group(1))
            
            # Extract value/result
            value_match = re.search(r'"?(?:value|result)"?\s*:\s*"([^"]*)"', content, re.IGNORECASE)
            if value_match:
                parsed["value"] = value_match.group(1)
            
            # Extract coordinates for coordinate actions
            x_match = re.search(r'"?x"?\s*:\s*(\d+)', content, re.IGNORECASE)
            y_match = re.search(r'"?y"?\s*:\s*(\d+)', content, re.IGNORECASE)
            if x_match and y_match:
                parsed["x"] = int(x_match.group(1))
                parsed["y"] = int(y_match.group(1))
            
            return self._ensure_enhanced_fields(parsed)
        
        raise ValueError(f"Could not parse LLM response: {content}")
    
    def _ensure_enhanced_fields(self, parsed: dict) -> dict:
        """Ensure parsed response has enhanced fields for backward compatibility."""
        # Add empty enhanced fields if they don't exist (backward compatibility)
        if 'thinking' not in parsed:
            parsed['thinking'] = ""
        if 'evaluation' not in parsed:
            parsed['evaluation'] = ""
        if 'memory' not in parsed:
            parsed['memory'] = ""
        if 'next_goal' not in parsed:
            parsed['next_goal'] = ""
        
        return parsed
    
    def _create_element_id(self, element: Dict[str, Any]) -> str:
        """Create a unique identifier for an element to track new elements."""
        # Use a combination of properties that should be stable for the same element
        tag = element.get("tagName", "")
        text = element.get("text", "")[:50]  # Truncate to avoid very long IDs
        role = element.get("role", "")
        aria_label = element.get("ariaLabel", "")
        element_id = element.get("id", "")
        selector = element.get("selector", "")
        
        # Create a reasonably unique identifier
        id_parts = [tag, text, role, aria_label, element_id, selector]
        return "|".join(part for part in id_parts if part)
    
    async def _save_run_as_recording(self, result: RunResult) -> str:
        """Convert successful agent/hybrid run into reusable recording."""
        # Extract valid steps (exclude DONE actions)
        steps = [
            r.action for r in result.steps 
            if r.action.action != ActionType.DONE and r.success
        ]
        
        # Generate recording ID
        recording_id = str(uuid.uuid4())
        
        # Derive URL pattern from first navigation or starting URL
        url_pattern = None
        if self.starting_url:
            # Simple pattern: replace specific paths with wildcards
            import re
            url_pattern = re.sub(r'/[^/]*$', '/*', self.starting_url)
        
        recording = Recording(
            id=recording_id,
            name=self.task,
            url_pattern=url_pattern,
            steps=steps,
            source="agent" if result.mode == RunMode.AGENT else "hybrid",
            success_count=1,
            created_at=str(int(time.time()))
        )
        
        await self.storage.save_recording(recording)
        logger.info(f"Saved new recording: {recording_id}")
        
        return recording_id