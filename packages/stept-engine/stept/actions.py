"""Playwright action execution."""

import asyncio
import logging
import time
from typing import List, Dict, Any, Optional
from playwright.async_api import Page

from .models import StepAction, StepResult, ActionType, ElementInfo
from .finder import find_and_prepare_element
from .dom import get_page_screenshot

logger = logging.getLogger(__name__)


async def execute_coordinate_click(page: Page, x: int, y: int) -> str:
    """Click at exact pixel coordinates on the page. Used when DOM-based clicking fails."""
    await page.mouse.click(x, y)
    await asyncio.sleep(300)  # Wait for any reaction
    return f"Clicked at coordinates ({x}, {y})"


async def execute_coordinate_type(page: Page, x: int, y: int, text: str) -> str:
    """Click at coordinates to focus, then type text."""
    await page.mouse.click(x, y)
    await asyncio.sleep(200)
    await page.keyboard.type(text, delay=50)
    return f"Typed '{text}' at coordinates ({x}, {y})"


async def execute_action(
    page: Page, 
    action: StepAction, 
    elements: List[Dict[str, Any]], 
    screenshot_dir: str = None
) -> StepResult:
    """Execute a single action on the page with enhanced capabilities."""
    url_before = page.url
    start_time = time.time()
    screenshot_path = None
    element_found_by = None
    
    try:
        # Auto-dismiss cookie banners before any interaction
        if action.action in [ActionType.CLICK, ActionType.TYPE, ActionType.SELECT]:
            cookie_dismissed = await auto_dismiss_cookie_banner(page)
            if cookie_dismissed:
                logger.info("Auto-dismissed cookie banner")
                await page.wait_for_timeout(1000)  # Wait for any animations
        
        # Execute the action based on type
        if action.action == ActionType.CLICK:
            element_found_by = await _execute_click(page, action, elements)
        elif action.action == ActionType.CLICK_AT:
            if action.coordinate_x is not None and action.coordinate_y is not None:
                result_msg = await execute_coordinate_click(page, action.coordinate_x, action.coordinate_y)
                element_found_by = "coordinate_click"
            else:
                raise ValueError("CLICK_AT action requires coordinate_x and coordinate_y")
        elif action.action == ActionType.TYPE:
            # Check if this might be a date input
            if (action.element and action.element.type in ['date', 'datetime-local', 'time', 'month', 'week'] or
                (action.value and _looks_like_date(action.value))):
                element_found_by = await _handle_date_input(page, action.element, action.value, elements)
            else:
                element_found_by = await _execute_type(page, action, elements)
        elif action.action == ActionType.TYPE_AT:
            if action.coordinate_x is not None and action.coordinate_y is not None and action.value is not None:
                result_msg = await execute_coordinate_type(page, action.coordinate_x, action.coordinate_y, action.value)
                element_found_by = "coordinate_type"
            else:
                raise ValueError("TYPE_AT action requires coordinate_x, coordinate_y, and value")
        elif action.action == ActionType.SELECT:
            element_found_by = await _execute_select(page, action, elements)
        elif action.action == ActionType.NAVIGATE:
            await _execute_navigate(page, action.value)
        elif action.action == ActionType.SCROLL:
            await _execute_scroll(page, action.value)
        elif action.action == ActionType.WAIT:
            await _execute_wait(page, action.value)
        elif action.action == ActionType.DONE:
            # No operation needed for DONE
            pass
        else:
            raise ValueError(f"Unknown action type: {action.action}")
        
        # Enhanced wait strategy based on action type
        if action.action == ActionType.NAVIGATE:
            # Wait for navigation to complete and check for SPA content
            await _wait_for_navigation_complete(page)
        elif action.action == ActionType.CLICK:
            # Wait for click effects to stabilize
            await _wait_for_click_stability(page)
        elif action.action == ActionType.TYPE and element_found_by and "autocomplete" in element_found_by:
            # Already handled autocomplete timing in _execute_type
            pass
        else:
            # Standard brief pause
            await page.wait_for_timeout(200)
        
        # Take screenshot after action
        if screenshot_dir:
            timestamp = int(time.time() * 1000)
            screenshot_path = f"{screenshot_dir}/step_{timestamp}_{action.action.value}.png"
            await get_page_screenshot(page, screenshot_path)
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        return StepResult(
            success=True,
            action=action,
            url_before=url_before,
            url_after=page.url,
            screenshot_path=screenshot_path,
            element_found_by=element_found_by,
            duration_ms=duration_ms
        )
        
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Action failed: {action.action} - {e}")
        
        return StepResult(
            success=False,
            action=action,
            url_before=url_before,
            url_after=page.url,
            error=str(e),
            duration_ms=duration_ms,
            element_found_by=element_found_by
        )


async def _execute_click(page: Page, action: StepAction, elements: List[Dict[str, Any]]) -> Optional[str]:
    """Click with multiple strategies and click interception handling."""
    element = action.element
    if not element:
        raise ValueError("Click action requires element info")
    
    # Strategy 1: Use finder cascade (for replay mode with rich element data)
    if any([element.selector, element.testId, element.id, element.role]):
        result = await find_and_prepare_element(page, element)
        if result:
            return await _click_with_interception_handling(page, result.locator, result.method)
    
    # Strategy 2: Use index from DOM extraction (for agent mode)
    if element.index is not None and elements and element.index < len(elements):
        target = elements[element.index]
        selector = target.get("selector")
        
        if selector:
            locator = page.locator(selector)
            count = await locator.count()
            if count >= 1:
                # Use first visible element
                for i in range(count):
                    element_locator = locator.nth(i)
                    if await element_locator.is_visible(timeout=2000):
                        return await _click_with_interception_handling(page, element_locator, "index_selector")
                
        # Fallback: coordinate click
        rect = target.get("rect")
        if rect and rect.get("x") is not None and rect.get("y") is not None:
            x = rect["x"] + rect.get("w", 0) // 2
            y = rect["y"] + rect.get("h", 0) // 2
            await page.mouse.click(x, y)
            logger.debug(f"Clicked element by coordinates: ({x}, {y})")
            return "coordinates"
    
    # Strategy 3: Text-based fallback
    if element.text:
        try:
            # Try exact text match
            text_locator = page.get_by_text(element.text, exact=False)
            if await text_locator.count() >= 1:
                first_visible = text_locator.first
                if await first_visible.is_visible(timeout=2000):
                    return await _click_with_interception_handling(page, first_visible, "text_fallback")
        except Exception as e:
            logger.debug(f"Text fallback failed: {e}")
    
    raise ValueError(f"Could not find clickable element: {element}")


async def _click_with_interception_handling(page: Page, locator, method: str) -> str:
    """Handle click with interception fallbacks like browser-use."""
    try:
        # First try: Normal click
        await locator.click(timeout=5000)
        logger.debug(f"Clicked element using {method}")
        return method
        
    except Exception as e:
        error_msg = str(e).lower()
        
        # Check for "intercepts pointer events" error
        if "intercepts pointer events" in error_msg or "not clickable" in error_msg:
            logger.warning(f"Click intercepted, trying fallback strategies: {e}")
            
            # Strategy 1: Dispatch click event (bypasses overlay)
            try:
                await locator.dispatch_event('click')
                logger.debug(f"Clicked element using dispatch_event ({method})")
                return f"{method}_dispatch"
            except Exception as dispatch_e:
                logger.debug(f"Dispatch click failed: {dispatch_e}")
            
            # Strategy 2: JavaScript click
            try:
                await locator.evaluate('el => el.click()')
                logger.debug(f"Clicked element using JavaScript ({method})")
                return f"{method}_javascript"
            except Exception as js_e:
                logger.debug(f"JavaScript click failed: {js_e}")
            
            # Strategy 3: Scroll and retry
            try:
                await locator.scroll_into_view_if_needed()
                await page.wait_for_timeout(500)
                await locator.click(timeout=5000)
                logger.debug(f"Clicked element after scroll ({method})")
                return f"{method}_scroll_retry"
            except Exception as scroll_e:
                logger.debug(f"Scroll retry failed: {scroll_e}")
                
            # If all strategies fail, raise the original error
            raise e
        else:
            # Different error, re-raise
            raise e


async def _execute_type(page: Page, action: StepAction, elements: List[Dict[str, Any]]) -> Optional[str]:
    """Type text into an element with enhanced autocomplete support."""
    return await _execute_enhanced_type(page, action, elements)


async def _detect_dropdown_type(locator, page: Page) -> str:
    """Detect if dropdown is native select, custom dropdown, or combobox."""
    try:
        element_info = await locator.evaluate("""el => ({
            tagName: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            ariaHaspopup: el.getAttribute('aria-haspopup'),
            className: el.className
        })""")
        
        tag_name = element_info.get('tagName', '')
        role = element_info.get('role', '')
        aria_haspopup = element_info.get('ariaHaspopup', '')
        class_name = element_info.get('className', '').lower()
        
        if tag_name == 'select':
            return 'native'
        elif role == 'combobox' or 'combobox' in class_name:
            return 'combobox'
        elif aria_haspopup in ['true', 'listbox', 'menu']:
            return 'custom'
        elif any(pattern in class_name for pattern in ['dropdown', 'select', 'menu']):
            return 'custom'
        else:
            return 'unknown'
            
    except Exception as e:
        logger.debug(f"Could not detect dropdown type: {e}")
        return 'unknown'


async def _execute_select(page: Page, action: StepAction, elements: List[Dict[str, Any]]) -> Optional[str]:
    """Enhanced select with support for native selects, custom dropdowns, and comboboxes."""
    element = action.element
    value = action.value
    
    if not element or not value:
        raise ValueError("Select action requires element and value")
    
    # Find the element using existing strategies
    result = None
    method_used = None
    
    # Strategy 1: Use finder cascade
    if any([element.selector, element.testId, element.id]):
        result = await find_and_prepare_element(page, element)
        if result:
            method_used = result.method
    
    # Strategy 2: Index-based approach
    if not result and element.index is not None and elements and element.index < len(elements):
        target = elements[element.index]
        selector = target.get("selector")
        
        if selector:
            locator = page.locator(selector)
            if await locator.count() >= 1:
                result = type('Result', (), {'locator': locator.first})()
                method_used = "index_selector"
    
    if not result:
        raise ValueError(f"Could not find dropdown element: {element}")
    
    # Detect dropdown type
    dropdown_type = await _detect_dropdown_type(result.locator, page)
    logger.debug(f"Detected dropdown type: {dropdown_type}")
    
    if dropdown_type == 'native':
        # Native HTML select element
        try:
            # Try by visible text first
            await result.locator.select_option(label=value)
            logger.debug(f"Selected native option by label: '{value}'")
            return f"{method_used}_native_label"
        except:
            try:
                # Try by value attribute
                await result.locator.select_option(value=value)
                logger.debug(f"Selected native option by value: '{value}'")
                return f"{method_used}_native_value"
            except Exception as e:
                raise ValueError(f"Could not select option '{value}' from native select: {e}")
    
    elif dropdown_type in ['custom', 'combobox', 'unknown']:
        # Custom dropdown or combobox
        try:
            # Click to open dropdown
            await result.locator.click(timeout=3000)
            logger.debug("Clicked to open custom dropdown")
            
            # Wait for dropdown options to appear
            await page.wait_for_timeout(800)  # Give time for dropdown animation
            
            # Try multiple strategies to find the option
            option_selectors = [
                f'[role="option"]:has-text("{value}")',
                f'li:has-text("{value}")', 
                f'.option:has-text("{value}")',
                f'[data-value="{value}"]',
                f'[value="{value}"]',
                f'*:has-text("{value}")'  # Broader search
            ]
            
            option_found = False
            for selector in option_selectors:
                try:
                    option_locator = page.locator(selector)
                    if await option_locator.count() > 0:
                        # Find visible option
                        for i in range(await option_locator.count()):
                            candidate = option_locator.nth(i)
                            if await candidate.is_visible(timeout=1000):
                                await candidate.click(timeout=3000)
                                logger.debug(f"Selected custom option using selector '{selector}': '{value}'")
                                option_found = True
                                break
                    if option_found:
                        break
                except Exception as e:
                    logger.debug(f"Option selector '{selector}' failed: {e}")
                    continue
            
            if not option_found:
                # Fallback: try exact text match
                try:
                    text_locator = page.get_by_text(value, exact=False)
                    if await text_locator.count() > 0:
                        # Look for the most specific match
                        await text_locator.first.click(timeout=3000)
                        logger.debug(f"Selected custom option by text match: '{value}'")
                        option_found = True
                except Exception as e:
                    logger.debug(f"Text match fallback failed: {e}")
            
            if option_found:
                return f"{method_used}_custom_{dropdown_type}"
            else:
                raise ValueError(f"Could not find option '{value}' in custom dropdown")
                
        except Exception as e:
            raise ValueError(f"Could not interact with custom dropdown: {e}")
    
    else:
        raise ValueError(f"Unsupported dropdown type: {dropdown_type}")


async def _execute_navigate(page: Page, url: str):
    """Navigate to URL."""
    if not url:
        raise ValueError("Navigate action requires URL")
    
    # Handle relative URLs
    if url.startswith("/"):
        current_url = page.url
        if current_url:
            from urllib.parse import urljoin
            url = urljoin(current_url, url)
    
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    
    # Wait a bit for potential JS navigation
    await page.wait_for_timeout(1000)
    
    logger.debug(f"Navigated to: {url}")


async def _execute_scroll(page: Page, direction: str):
    """Scroll the page."""
    direction = (direction or "down").lower()
    
    if direction in ["down", "up"]:
        delta_y = 500 if direction == "down" else -500
        await page.mouse.wheel(0, delta_y)
    elif direction in ["left", "right"]:
        delta_x = 500 if direction == "right" else -500
        await page.mouse.wheel(delta_x, 0)
    else:
        # Try to parse as number of pixels
        try:
            pixels = int(direction)
            await page.mouse.wheel(0, pixels)
        except ValueError:
            raise ValueError(f"Invalid scroll direction: {direction}")
    
    # Wait for scroll to complete
    await page.wait_for_timeout(500)
    
    logger.debug(f"Scrolled: {direction}")


async def _execute_wait(page: Page, duration: str):
    """Wait for specified duration."""
    try:
        ms = int(duration) if duration else 1000
    except ValueError:
        ms = 1000
    
    await page.wait_for_timeout(ms)
    logger.debug(f"Waited: {ms}ms")


# Cookie consent selectors for auto-dismissal
COOKIE_SELECTORS = [
    # Google specific
    'button#L2AGLb',                          # Google "Accept all" / "Alle akzeptieren"
    'button[jsname="b3VHJd"]',               # Google consent alt
    'form[action*="consent"] button:first-of-type',  # Google consent form
    'button:has-text("Alle akzeptieren")',     # Google DE
    'button:has-text("Tout accepter")',        # Google FR
    'button:has-text("Aceptar todo")',         # Google ES
    # Generic patterns
    '#onetrust-accept-btn-handler',
    '[id*="cookie"] button[id*="accept"]',
    '.cookie-consent-accept',
    'button:has-text("Accept all")',
    'button:has-text("Accept cookies")',
    'button:has-text("Accept All Cookies")',
    'button:has-text("I Accept")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    '[data-cy="accept-all"]',
    '[data-testid="accept-all"]',
    '.cookie-banner button[aria-label*="accept"]',
    '.gdpr-accept-button',
    '.cookie-accept',
    '#cookie-accept',
    '.accept-cookies',
    # CMP frameworks
    '.fc-cta-consent',                        # Funding Choices
    '#didomi-notice-agree-button',            # Didomi
    '.cc-accept-all',                         # CookieConsent
]


async def auto_dismiss_cookie_banner(page: Page) -> bool:
    """Automatically dismiss cookie consent banners."""
    try:
        for selector in COOKIE_SELECTORS:
            try:
                locator = page.locator(selector)
                if await locator.count() > 0 and await locator.first.is_visible(timeout=1000):
                    await locator.first.click(timeout=2000)
                    logger.info(f"Auto-dismissed cookie banner using selector: {selector}")
                    await page.wait_for_timeout(500)  # Wait for banner to disappear
                    return True
            except Exception:
                continue
        return False
    except Exception as e:
        logger.debug(f"Cookie banner auto-dismiss failed: {e}")
        return False


async def _is_autocomplete_field(element: ElementInfo, page: Page) -> bool:
    """Detect if element is an autocomplete/combobox field."""
    # Check if we have element attributes available
    if element.role == "combobox":
        return True
    
    # Check element attributes if available through DOM
    if element.selector:
        try:
            attrs = await page.locator(element.selector).first.evaluate("""el => ({
                role: el.getAttribute('role'),
                ariaAutocomplete: el.getAttribute('aria-autocomplete'), 
                ariaHaspopup: el.getAttribute('aria-haspopup'),
                list: el.getAttribute('list'),
                className: el.className
            })""")
            
            if attrs.get('role') == 'combobox':
                return True
            if attrs.get('ariaAutocomplete') and attrs.get('ariaAutocomplete') != 'none':
                return True
            if attrs.get('list'):  # HTML5 datalist
                return True
            if attrs.get('ariaHaspopup') and attrs.get('ariaHaspopup') != 'false':
                return True
            
            # Check for common autocomplete class patterns
            class_name = attrs.get('className', '').lower()
            autocomplete_patterns = ['autocomplete', 'combobox', 'typeahead', 'search-input']
            if any(pattern in class_name for pattern in autocomplete_patterns):
                return True
                
        except Exception as e:
            logger.debug(f"Could not check autocomplete attributes: {e}")
    
    return False


async def _wait_for_autocomplete_dropdown(page: Page, timeout: int = 2000) -> bool:
    """Wait for autocomplete dropdown to appear after typing."""
    try:
        # Common autocomplete dropdown selectors
        dropdown_selectors = [
            '[role="listbox"]',
            '[role="menu"]', 
            '.autocomplete-dropdown',
            '.dropdown-menu',
            '.suggestions',
            '.typeahead-dropdown',
            'ul[id*="autocomplete"]',
            'div[id*="suggestions"]',
            '[data-testid*="dropdown"]',
            '[data-testid*="suggestions"]'
        ]
        
        # Wait for any dropdown to appear
        for selector in dropdown_selectors:
            try:
                await page.wait_for_selector(selector, state="visible", timeout=timeout // len(dropdown_selectors))
                logger.debug(f"Autocomplete dropdown appeared: {selector}")
                return True
            except Exception:
                continue
                
        return False
        
    except Exception as e:
        logger.debug(f"Failed to detect autocomplete dropdown: {e}")
        return False


async def _execute_enhanced_type(page: Page, action: StepAction, elements: List[Dict[str, Any]]) -> Optional[str]:
    """Enhanced type function with autocomplete detection and handling."""
    element = action.element
    text_value = action.value or ""
    
    if not element:
        raise ValueError("Type action requires element info")
    
    # First, find the element using existing logic
    result = None
    method_used = None
    
    # Strategy 1: Use finder cascade
    if any([element.selector, element.testId, element.id, element.placeholder]):
        result = await find_and_prepare_element(page, element)
        if result:
            method_used = result.method
    
    # Strategy 2: Use index from DOM extraction
    if not result and element.index is not None and elements and element.index < len(elements):
        target = elements[element.index]
        selector = target.get("selector")
        
        if selector:
            locator = page.locator(selector)
            if await locator.count() >= 1:
                first_element = locator.first
                if await first_element.is_visible(timeout=2000):
                    result = type('Result', (), {'locator': first_element})()
                    method_used = "index_selector"
    
    if not result:
        # Strategy 3: Placeholder-based fallback
        if element.placeholder:
            try:
                placeholder_locator = page.get_by_placeholder(element.placeholder, exact=False)
                if await placeholder_locator.count() >= 1:
                    first_element = placeholder_locator.first
                    if await first_element.is_visible(timeout=2000):
                        result = type('Result', (), {'locator': first_element})()
                        method_used = "placeholder_fallback"
            except Exception as e:
                logger.debug(f"Placeholder fallback failed: {e}")
    
    if not result:
        raise ValueError(f"Could not find typeable element: {element}")
    
    # Check if this is an autocomplete field
    is_autocomplete = await _is_autocomplete_field(element, page)
    
    # Focus and clear the field (with interception handling)
    try:
        await result.locator.click(timeout=3000)
    except Exception:
        try:
            await result.locator.dispatch_event('click')
        except Exception:
            try:
                await result.locator.evaluate('el => { el.focus(); el.click(); }')
            except Exception:
                pass  # Proceed with fill anyway — it might work without explicit focus
    await result.locator.fill(text_value)
    
    if is_autocomplete:
        logger.debug(f"Detected autocomplete field, waiting for dropdown...")
        # Wait for autocomplete dropdown to appear
        dropdown_appeared = await _wait_for_autocomplete_dropdown(page)
        
        if dropdown_appeared:
            logger.debug(f"Autocomplete dropdown appeared, ready for selection")
            # Don't auto-select - let the agent choose from the options in next step
            method_used += "_autocomplete_ready"
        else:
            # No dropdown appeared, proceed normally (maybe press Enter)
            logger.debug(f"No autocomplete dropdown, proceeding with enter")
            await result.locator.press('Enter')
            method_used += "_autocomplete_submitted"
    else:
        # Regular field, just typed the text
        logger.debug(f"Regular field, typed text: '{text_value[:50]}'")
    
    return method_used


# Additional helper functions for complex interactions

async def _detect_date_picker_type(element: ElementInfo, page: Page) -> str:
    """Detect type of date picker: native HTML5, jQuery, Bootstrap, etc."""
    try:
        if element.selector:
            element_info = await page.locator(element.selector).first.evaluate("""el => ({
                type: el.getAttribute('type'),
                className: el.className,
                datepicker: el.hasAttribute('data-datepicker'),
                dateFormat: el.getAttribute('data-date-format'),
                hasCalendarIcon: !!el.parentElement.querySelector('.calendar, .date-icon, [class*="calendar"]')
            })""")
            
            input_type = element_info.get('type', '').lower()
            class_name = element_info.get('className', '').lower()
            
            # Native HTML5 date inputs
            if input_type in ['date', 'datetime-local', 'time', 'month', 'week']:
                return f'native_{input_type}'
            
            # Check for common datepicker frameworks
            if ('datepicker' in class_name or 
                element_info.get('datepicker') or
                'pikaday' in class_name or
                'flatpickr' in class_name):
                return 'custom_datepicker'
                
            if element_info.get('hasCalendarIcon'):
                return 'custom_with_icon'
                
        return 'unknown'
        
    except Exception as e:
        logger.debug(f"Could not detect date picker type: {e}")
        return 'unknown'


async def _handle_date_input(page: Page, element: ElementInfo, date_value: str, elements: List[Dict[str, Any]]) -> str:
    """Handle date input with support for native and custom date pickers."""
    
    date_picker_type = await _detect_date_picker_type(element, page)
    logger.debug(f"Detected date picker type: {date_picker_type}")
    
    # Find the element
    result = None
    method_used = None
    
    if any([element.selector, element.testId, element.id]):
        result = await find_and_prepare_element(page, element)
        if result:
            method_used = result.method
    elif element.index is not None and elements and element.index < len(elements):
        target = elements[element.index]
        selector = target.get("selector")
        if selector:
            locator = page.locator(selector)
            if await locator.count() >= 1:
                result = type('Result', (), {'locator': locator.first})()
                method_used = "index_selector"
    
    if not result:
        raise ValueError(f"Could not find date input element: {element}")
    
    if date_picker_type.startswith('native_'):
        # Native HTML5 date input - use direct value setting with ISO format
        input_type = date_picker_type.split('_')[1]
        
        # Convert date_value to appropriate ISO format if needed
        iso_value = date_value  # Assume it's already in correct format
        
        # For native inputs, set the value directly
        await result.locator.fill(iso_value)
        logger.debug(f"Set native {input_type} input to: {iso_value}")
        return f"{method_used}_native_{input_type}"
        
    elif date_picker_type in ['custom_datepicker', 'custom_with_icon']:
        # Custom date picker - click to open, then navigate
        await result.locator.click(timeout=3000)
        await page.wait_for_timeout(1000)  # Wait for calendar to open
        
        # Try to find and interact with the calendar
        # This is a simplified approach - real implementation would need
        # to parse the date and navigate the calendar properly
        try:
            # Look for today button first (common in many date pickers)
            today_selectors = [
                'button:has-text("Today")',
                '.today',
                '[data-action="selectToday"]',
                '.ui-datepicker-current'
            ]
            
            for selector in today_selectors:
                try:
                    today_btn = page.locator(selector)
                    if await today_btn.count() > 0 and await today_btn.first.is_visible(timeout=1000):
                        await today_btn.first.click(timeout=3000)
                        logger.debug(f"Used 'Today' button in custom date picker")
                        return f"{method_used}_custom_today"
                except:
                    continue
            
            # If no today button, try to type the date directly
            await result.locator.fill(date_value)
            await result.locator.press('Enter')
            logger.debug(f"Typed date directly in custom picker: {date_value}")
            return f"{method_used}_custom_typed"
            
        except Exception as e:
            logger.warning(f"Custom date picker interaction failed: {e}")
            # Fallback to typing
            await result.locator.fill(date_value)
            return f"{method_used}_custom_fallback"
    
    else:
        # Unknown type - treat as regular input
        await result.locator.click(timeout=3000)
        await result.locator.fill(date_value)
        logger.debug(f"Treated unknown date picker as regular input: {date_value}")
        return f"{method_used}_unknown_type"


async def handle_file_upload(page: Page, element: ElementInfo, file_paths: List[str]) -> str:
    """Enhanced file upload handling for visible and hidden file inputs."""
    # Find the actual file input (might be hidden)
    result = await find_and_prepare_element(page, element)
    if not result:
        raise ValueError("Could not find file input element")
    
    # Check if the input is hidden
    is_hidden = await result.locator.evaluate("""el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || 
               style.visibility === 'hidden' || 
               parseFloat(style.opacity) === 0 ||
               el.offsetWidth === 0 || 
               el.offsetHeight === 0;
    }""")
    
    if is_hidden:
        # Hidden file input - look for a visible trigger button
        logger.debug("File input is hidden, looking for visible trigger")
        
        # Common patterns for file upload triggers
        trigger_selectors = [
            'button:has-text("Choose File")',
            'button:has-text("Browse")',
            'button:has-text("Upload")',
            'label[for="' + (element.id or '') + '"]' if element.id else None,
            '.file-upload-trigger',
            '.upload-button',
            '[data-testid*="file-upload"]'
        ]
        
        # Remove None values
        trigger_selectors = [s for s in trigger_selectors if s]
        
        # Try to find and click the trigger first
        trigger_clicked = False
        for selector in trigger_selectors:
            try:
                trigger = page.locator(selector)
                if await trigger.count() > 0 and await trigger.first.is_visible(timeout=1000):
                    await trigger.first.click(timeout=3000)
                    logger.debug(f"Clicked file upload trigger: {selector}")
                    trigger_clicked = True
                    break
            except:
                continue
        
        if not trigger_clicked:
            logger.debug("No visible trigger found, setting files directly on hidden input")
    
    # Set the files on the actual input element
    await result.locator.set_input_files(file_paths)
    logger.debug(f"Uploaded files: {file_paths}")
    
    return f"{result.method}_{'hidden' if is_hidden else 'visible'}"


async def handle_alert_dialogs(page: Page, accept: bool = True, prompt_text: str = None):
    """Handle JavaScript alert/confirm/prompt dialogs."""
    def dialog_handler(dialog):
        logger.info(f"Dialog appeared: {dialog.type} - {dialog.message}")
        if dialog.type == "prompt" and prompt_text:
            dialog.accept(prompt_text)
        elif accept:
            dialog.accept()
        else:
            dialog.dismiss()
    
    page.on("dialog", dialog_handler)
    return dialog_handler


async def wait_for_element_state(
    page: Page, 
    element: ElementInfo, 
    state: str = "visible", 
    timeout: int = 10000
) -> bool:
    """Wait for element to reach specific state."""
    result = await find_and_prepare_element(page, element)
    if not result:
        return False
    
    try:
        if state == "visible":
            await result.locator.wait_for(state="visible", timeout=timeout)
        elif state == "hidden":
            await result.locator.wait_for(state="hidden", timeout=timeout)
        elif state == "enabled":
            await result.locator.wait_for(state="enabled", timeout=timeout)
        elif state == "disabled":
            await result.locator.wait_for(state="disabled", timeout=timeout)
        else:
            raise ValueError(f"Unknown state: {state}")
        
        return True
        
    except Exception as e:
        logger.warning(f"Element state wait failed: {state} - {e}")
        return False


def _looks_like_date(value: str) -> bool:
    """Check if a string looks like a date value."""
    if not value:
        return False
    
    # Common date patterns
    date_patterns = [
        r'\d{4}-\d{2}-\d{2}',  # YYYY-MM-DD
        r'\d{2}/\d{2}/\d{4}',  # MM/DD/YYYY
        r'\d{2}-\d{2}-\d{4}',  # MM-DD-YYYY
        r'\d{2}\.\d{2}\.\d{4}',  # MM.DD.YYYY
        r'\d{1,2}/\d{1,2}/\d{4}',  # M/D/YYYY
        r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}',  # YYYY-MM-DDTHH:MM
    ]
    
    import re
    for pattern in date_patterns:
        if re.match(pattern, value.strip()):
            return True
    
    return False


async def _wait_for_navigation_complete(page: Page, timeout: int = 15000) -> bool:
    """Wait for navigation to complete with enhanced SPA support like browser-use."""
    try:
        # Wait for basic load state
        await page.wait_for_load_state("domcontentloaded", timeout=timeout)
        
        # Check if this is a typical SPA that needs more time
        is_spa = await page.evaluate("""() => {
            // Check for common SPA frameworks
            return !!(window.React || window.Vue || window.angular || 
                     window.next || window.nuxt || 
                     document.querySelector('[data-reactroot]') ||
                     document.querySelector('[ng-app]') ||
                     document.querySelector('.vue-app'));
        }""")
        
        if is_spa:
            logger.debug("SPA detected, waiting for content to load...")
            # Wait longer for SPAs
            await page.wait_for_timeout(2000)
        
        # Wait for at least 5 interactive elements to appear (poll for 3 seconds)
        interactive_elements_ready = False
        for attempt in range(6):  # 6 attempts * 500ms = 3 seconds
            try:
                element_count = await page.evaluate("""() => {
                    // Count meaningful interactive elements
                    const interactiveSelectors = [
                        'button:not([disabled])',
                        'input:not([disabled])', 
                        'select:not([disabled])',
                        'textarea:not([disabled])',
                        'a[href]',
                        '[role="button"]:not([disabled])',
                        '[onclick]',
                        '[tabindex]:not([tabindex="-1"])'
                    ];
                    
                    let count = 0;
                    interactiveSelectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            const rect = el.getBoundingClientRect();
                            // Only count visible elements with area > 0
                            if (rect.width > 0 && rect.height > 0) {
                                count++;
                            }
                        });
                    });
                    return count;
                }""")
                
                if element_count >= 5:
                    interactive_elements_ready = True
                    break
                    
            except Exception:
                pass
            
            await page.wait_for_timeout(500)
        
        if not interactive_elements_ready:
            logger.debug("Not enough interactive elements found, but proceeding...")
        
        # Check if page is still loading
        is_loading = await page.evaluate("""() => {
            // Check for common loading indicators
            const loadingSelectors = [
                '.loading', '.spinner', '[data-loading]', '.loader',
                '.progress', '.loading-spinner', '.loading-overlay',
                '.skeleton', '.shimmer'
            ];
            
            for (const sel of loadingSelectors) {
                const el = document.querySelector(sel);
                if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
                    return true;
                }
            }
            
            // Check if document is still in loading state
            return document.readyState === 'loading';
        }""")
        
        if is_loading:
            logger.debug("Page still loading, waiting additional time...")
            await page.wait_for_timeout(1500)
        
        return True
        
    except Exception as e:
        logger.debug(f"Navigation wait failed: {e}")
        return False


async def _wait_for_click_stability(page: Page) -> bool:
    """Wait for page to stabilize after a click."""
    try:
        # Wait for any immediate changes
        await page.wait_for_timeout(500)
        
        # Use mutation observer to detect if page is still changing
        stable = await page.evaluate("""() => {
            return new Promise((resolve) => {
                let changeCount = 0;
                const observer = new MutationObserver(() => {
                    changeCount++;
                });
                
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: false
                });
                
                setTimeout(() => {
                    observer.disconnect();
                    resolve(changeCount < 3); // Consider stable if < 3 changes in 1s
                }, 1000);
            });
        }""")
        
        return stable
        
    except Exception as e:
        logger.debug(f"Click stability check failed: {e}")
        return False