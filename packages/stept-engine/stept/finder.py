"""Element finder using 6-level cascade from TypeScript implementation."""

import logging
from typing import Optional
from dataclasses import dataclass
from playwright.async_api import Page, Locator

from .models import ElementInfo

logger = logging.getLogger(__name__)


@dataclass
class FindResult:
    """Result of element finding operation."""
    locator: Locator
    confidence: float
    method: str


async def find_element(page: Page, target: ElementInfo) -> Optional[FindResult]:
    """
    6-level element finder cascade matching guide-runtime/index.ts.
    Returns best match or None.
    
    Levels (in order of confidence):
    1. CSS selector (1.0)
    2. data-testid (0.95) 
    3. ARIA role + name (0.85)
    4. Tag + text (0.70)
    5. ID (0.65)
    6. Placeholder/label (0.50)
    """
    
    # Level 1: CSS selector (confidence 1.0)
    if target.selector:
        try:
            locator = page.locator(target.selector)
            count = await locator.count()
            if count == 1 and await _is_visible(locator):
                logger.debug(f"Found element by selector: {target.selector}")
                return FindResult(locator, 1.0, "selector")
            elif count > 1:
                # Multiple matches - try to find the visible one
                for i in range(count):
                    element_locator = locator.nth(i)
                    if await _is_visible(element_locator):
                        logger.debug(f"Found element by selector (nth={i}): {target.selector}")
                        return FindResult(element_locator, 0.95, "selector")
        except Exception as e:
            logger.debug(f"Selector failed: {target.selector} - {e}")
    
    # Level 2: data-testid (confidence 0.95)
    if target.testId:
        for attr in ["data-testid", "data-test", "data-cy"]:
            try:
                locator = page.locator(f'[{attr}="{target.testId}"]')
                if await locator.count() >= 1 and await _is_visible(locator.first):
                    logger.debug(f"Found element by {attr}: {target.testId}")
                    return FindResult(locator.first, 0.95, "testid")
            except Exception:
                continue
    
    # Level 3: ARIA role + name (confidence 0.85)
    if target.role and (target.text or target.ariaLabel):
        name = target.ariaLabel or target.text
        if name:
            try:
                locator = page.get_by_role(target.role, name=name, exact=False)
                if await locator.count() >= 1 and await _is_visible(locator.first):
                    logger.debug(f"Found element by role+name: {target.role} '{name}'")
                    return FindResult(locator.first, 0.85, "role+text")
            except Exception as e:
                logger.debug(f"Role+name failed: {target.role} '{name}' - {e}")
    
    # Level 4: Tag + text (confidence 0.70) 
    if target.tagName and target.text:
        # Truncate text for matching to avoid overly long selectors
        text_match = target.text[:50].strip()
        if text_match:
            try:
                locator = page.locator(f'{target.tagName}:has-text("{text_match}")')
                count = await locator.count()
                if count >= 1:
                    # Try exact match first
                    for i in range(min(count, 3)):  # Check first 3 matches
                        element_locator = locator.nth(i)
                        if await _is_visible(element_locator):
                            logger.debug(f"Found element by tag+text: {target.tagName} '{text_match}'")
                            return FindResult(element_locator, 0.70, "tag+text")
            except Exception as e:
                logger.debug(f"Tag+text failed: {target.tagName} '{text_match}' - {e}")
    
    # Level 5: ID (confidence 0.65)
    if target.id:
        try:
            locator = page.locator(f'#{target.id}')
            if await locator.count() == 1 and await _is_visible(locator):
                logger.debug(f"Found element by ID: {target.id}")
                return FindResult(locator, 0.65, "id")
        except Exception as e:
            logger.debug(f"ID failed: {target.id} - {e}")
    
    # Level 6: Form field attributes (confidence 0.50)
    if target.placeholder:
        try:
            locator = page.get_by_placeholder(target.placeholder, exact=False)
            if await locator.count() >= 1 and await _is_visible(locator.first):
                logger.debug(f"Found element by placeholder: {target.placeholder}")
                return FindResult(locator.first, 0.50, "placeholder")
        except Exception as e:
            logger.debug(f"Placeholder failed: {target.placeholder} - {e}")
    
    if target.ariaLabel:
        try:
            locator = page.get_by_label(target.ariaLabel, exact=False)
            if await locator.count() >= 1 and await _is_visible(locator.first):
                logger.debug(f"Found element by label: {target.ariaLabel}")
                return FindResult(locator.first, 0.50, "label")
        except Exception as e:
            logger.debug(f"Label failed: {target.ariaLabel} - {e}")
    
    # Additional fallback: text content search
    if target.text and len(target.text) > 3:
        try:
            # Try get_by_text for exact matches
            locator = page.get_by_text(target.text, exact=False)
            if await locator.count() >= 1 and await _is_visible(locator.first):
                logger.debug(f"Found element by text: {target.text}")
                return FindResult(locator.first, 0.40, "text")
        except Exception as e:
            logger.debug(f"Text search failed: {target.text} - {e}")
    
    logger.debug(f"Element not found with any strategy: {target}")
    return None


async def _is_visible(locator: Locator) -> bool:
    """Check if element is visible with timeout handling."""
    try:
        return await locator.is_visible(timeout=2000)
    except Exception:
        return False


async def _scroll_into_view(locator: Locator) -> bool:
    """Scroll element into view if it's off-screen."""
    try:
        await locator.scroll_into_view_if_needed(timeout=5000)
        return True
    except Exception as e:
        logger.debug(f"Scroll into view failed: {e}")
        return False


async def find_and_prepare_element(page: Page, target: ElementInfo) -> Optional[FindResult]:
    """Find element and prepare it for interaction (scroll into view if needed)."""
    result = await find_element(page, target)
    if result:
        # Ensure element is visible and scrolled into view
        if not await _is_visible(result.locator):
            await _scroll_into_view(result.locator)
            
            # Check again after scrolling
            if not await _is_visible(result.locator):
                logger.warning("Element still not visible after scroll")
                return None
        
        return result
    
    return None