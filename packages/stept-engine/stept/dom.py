"""DOM extraction via JavaScript injection."""

import logging
from typing import List, Dict, Any
from playwright.async_api import Page

logger = logging.getLogger(__name__)


async def inject_listener_tracker(page: Page):
    """Inject JS to track elements with click listeners before page scripts load."""
    await page.add_init_script("""
        // Track elements with click listeners
        window.__steptClickListeners = new WeakSet();
        window.__steptOriginalAddEventListener = Element.prototype.addEventListener;
        
        Element.prototype.addEventListener = function(type, listener, options) {
            // Track click-related listeners
            if (['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].includes(type)) {
                window.__steptClickListeners.add(this);
            }
            return window.__steptOriginalAddEventListener.call(this, type, listener, options);
        };
        
        // Also track document/window listeners
        const originalDocAddListener = Document.prototype.addEventListener;
        const originalWinAddListener = Window.prototype.addEventListener;
        
        Document.prototype.addEventListener = function(type, listener, options) {
            if (['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].includes(type)) {
                // Store on document as a marker that there are global click handlers
                document.__hasGlobalClickListeners = true;
            }
            return originalDocAddListener.call(this, type, listener, options);
        };
        
        Window.prototype.addEventListener = function(type, listener, options) {
            if (['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].includes(type)) {
                document.__hasGlobalClickListeners = true;
            }
            return originalWinAddListener.call(this, type, listener, options);
        };
    """)
    logger.debug("Injected click listener tracker")


async def get_interactive_elements(page: Page) -> List[Dict[str, Any]]:
    """Extract all interactive elements from the page via JS injection."""
    try:
        elements = await page.evaluate("""() => {
            // Interactive element selectors
            const INTERACTIVE_SELECTORS = [
                'a[href]', 'button', 'input', 'select', 'textarea',
                '[role="button"]', '[role="link"]', '[role="textbox"]', 
                '[role="combobox"]', '[role="checkbox"]', '[role="radio"]',
                '[role="tab"]', '[role="menuitem"]', '[role="option"]',
                '[onclick]', '[tabindex]:not([tabindex="-1"])',
                'label[for]', '[contenteditable="true"]'
            ].join(', ');
            
            const elements = [];
            const seen = new Set();
            let hiddenElementsCount = 0;
            
            // Helper to check if element is visible with enhanced checks
            function isElementVisible(el) {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                
                // Basic visibility checks
                if (rect.width === 0 || rect.height === 0) return false;
                if (style.display === 'none') return false;
                if (style.visibility === 'hidden') return false;
                if (parseFloat(style.opacity) === 0) return false;
                
                // Check if element is in viewport (at least partially)
                if (rect.bottom < 0 || rect.right < 0) return false;
                if (rect.top > window.innerHeight || rect.left > window.innerWidth) return false;
                
                return true;
            }
            
            // Helper to check if element has click listeners
            function hasClickListeners(el) {
                if (window.__steptClickListeners && window.__steptClickListeners.has(el)) {
                    return true;
                }
                // Check for common click handler attributes
                return el.onclick !== null || el.hasAttribute('onclick');
            }
            
            // Helper to check scroll properties
            function getScrollInfo(el) {
                const style = window.getComputedStyle(el);
                const isScrollable = ['auto', 'scroll'].includes(style.overflow) || 
                                   ['auto', 'scroll'].includes(style.overflowY) ||
                                   ['auto', 'scroll'].includes(style.overflowX);
                
                const scrollHeight = el.scrollHeight;
                const clientHeight = el.clientHeight;
                const scrollWidth = el.scrollWidth;
                const clientWidth = el.clientWidth;
                
                const hasVerticalScroll = scrollHeight > clientHeight;
                const hasHorizontalScroll = scrollWidth > clientWidth;
                
                return {
                    isScrollable: isScrollable && (hasVerticalScroll || hasHorizontalScroll),
                    hasVerticalScroll,
                    hasHorizontalScroll,
                    scrollTop: el.scrollTop,
                    scrollLeft: el.scrollLeft,
                    scrollHeight,
                    clientHeight,
                    scrollWidth,
                    clientWidth
                };
            }
            
            // Helper to get detailed element state
            function getElementState(el) {
                const style = window.getComputedStyle(el);
                const state = {
                    disabled: el.disabled || el.hasAttribute('disabled') || 
                             el.getAttribute('aria-disabled') === 'true',
                    checked: el.checked,
                    selected: el.selected,
                    expanded: el.getAttribute('aria-expanded') === 'true',
                    hidden: el.hidden || el.getAttribute('aria-hidden') === 'true',
                    readonly: el.readOnly || el.hasAttribute('readonly'),
                    required: el.required || el.hasAttribute('required'),
                    invalid: el.matches(':invalid') || el.getAttribute('aria-invalid') === 'true'
                };
                
                // Form element values
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                    state.value = el.value;
                    state.placeholder = el.placeholder;
                }
                
                return state;
            }
            
            // Helper to generate CSS selector
            function generateSelector(el) {
                // Prefer ID
                if (el.id) {
                    return '#' + CSS.escape(el.id);
                }
                
                // Prefer data-testid
                const testId = el.getAttribute('data-testid') || 
                             el.getAttribute('data-test') || 
                             el.getAttribute('data-cy');
                if (testId) {
                    return '[data-testid="' + CSS.escape(testId) + '"]';
                }
                
                // Build hierarchical selector
                let path = el.tagName.toLowerCase();
                
                // Add classes (limit to 2 most specific)
                if (el.className && typeof el.className === 'string') {
                    const classes = el.className.trim().split(/\\s+/)
                        .filter(cls => cls && !cls.match(/^[\\d]/))  // Filter out invalid/numeric classes
                        .slice(0, 2);  // Limit to first 2
                    if (classes.length) {
                        path += '.' + classes.map(cls => CSS.escape(cls)).join('.');
                    }
                }
                
                // Add nth-child if not unique
                const parent = el.parentElement;
                if (parent) {
                    const selector = path;
                    const siblings = parent.querySelectorAll(':scope > ' + selector);
                    if (siblings.length > 1) {
                        const index = Array.from(parent.children).indexOf(el) + 1;
                        path += ':nth-child(' + index + ')';
                    }
                }
                
                return path;
            }
            
            // Helper to get parent context
            function getParentText(el) {
                const parent = el.parentElement;
                if (!parent) return null;
                
                // Get text from parent but exclude current element's text
                let parentText = '';
                for (const node of parent.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        parentText += node.textContent;
                    } else if (node !== el && node.nodeType === Node.ELEMENT_NODE) {
                        const nodeText = node.textContent || '';
                        if (nodeText.length < 200) {  // Avoid huge text blocks
                            parentText += nodeText;
                        }
                    }
                }
                return parentText.trim().slice(0, 100) || null;
            }
            
            // Extract all interactive elements
            document.querySelectorAll(INTERACTIVE_SELECTORS).forEach((el, globalIndex) => {
                if (!isElementVisible(el)) return;
                
                const rect = el.getBoundingClientRect();
                const text = (el.textContent || '').trim();
                
                // Deduplicate by position + text
                const dedupeKey = Math.round(rect.x) + ',' + Math.round(rect.y) + ',' + text.slice(0, 20);
                if (seen.has(dedupeKey)) return;
                seen.add(dedupeKey);
                
                // Get enhanced element information
                const scrollInfo = getScrollInfo(el);
                const elementState = getElementState(el);
                const hasListeners = hasClickListeners(el);
                
                // Extract comprehensive element data
                const elementData = {
                    index: elements.length,
                    tagName: el.tagName.toLowerCase(),
                    text: text.slice(0, 200),  // Limit text length
                    role: el.getAttribute('role'),
                    ariaLabel: el.getAttribute('aria-label'),
                    type: el.getAttribute('type'),
                    name: el.getAttribute('name'),
                    placeholder: el.getAttribute('placeholder'),
                    id: el.id || null,
                    className: el.className || null,
                    testId: el.getAttribute('data-testid') || 
                           el.getAttribute('data-test') || 
                           el.getAttribute('data-cy') || null,
                    href: (el.tagName === 'A' && el.href) ? el.href : null,
                    value: elementState.value,
                    checked: elementState.checked,
                    disabled: elementState.disabled,
                    readonly: elementState.readonly,
                    required: elementState.required,
                    expanded: elementState.expanded,
                    invalid: elementState.invalid,
                    hasClickListeners: hasListeners,
                    isScrollable: scrollInfo.isScrollable,
                    scrollInfo: scrollInfo.isScrollable ? {
                        scrollTop: scrollInfo.scrollTop,
                        scrollLeft: scrollInfo.scrollLeft,
                        scrollHeight: scrollInfo.scrollHeight,
                        clientHeight: scrollInfo.clientHeight,
                        hasVerticalScroll: scrollInfo.hasVerticalScroll,
                        hasHorizontalScroll: scrollInfo.hasHorizontalScroll
                    } : null,
                    rect: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        w: Math.round(rect.width),
                        h: Math.round(rect.height)
                    },
                    parentText: getParentText(el),
                    selector: generateSelector(el),
                    // Additional metadata
                    focused: document.activeElement === el,
                    tabIndex: el.tabIndex,
                    title: el.title || null
                };
                
                elements.push(elementData);
            });
            
            return elements;
        }""")
        
        logger.info(f"Extracted {len(elements)} interactive elements from page")
        return elements
        
    except Exception as e:
        logger.error(f"Failed to extract DOM elements: {e}")
        return []


def _is_in_viewport(element: Dict[str, Any]) -> bool:
    """Check if element is currently in viewport."""
    rect = element.get("rect", {})
    if not rect:
        return True  # Assume visible if no rect info
    
    # Simple viewport check - this could be enhanced with actual viewport size
    # For now, assume anything with positive coordinates and reasonable size is visible
    return rect.get("x", 0) >= 0 and rect.get("y", 0) >= 0 and rect.get("w", 0) > 0 and rect.get("h", 0) > 0


def _get_element_hierarchy(element: Dict[str, Any]) -> str:
    """Get element hierarchy context for better LLM understanding."""
    parts = []
    
    # Add parent context if available
    if element.get("parentText"):
        parent_text = element["parentText"][:30]
        parts.append(f"parent:{parent_text}")
    
    # Add form context
    if element.get("tagName") in ["input", "select", "textarea", "button"]:
        # Could check for form parent here if that info was extracted
        pass
    
    return " > ".join(parts) if parts else None


def serialize_elements_for_llm(elements: List[Dict[str, Any]], max_length: int = 40000) -> str:
    """Format elements as readable text for LLM consumption with enhanced information."""
    if not elements:
        return "No interactive elements found on the page."
    
    lines = []
    total_length = 0
    hidden_elements_count = 0
    
    # Count elements that would be hidden
    for element in elements:
        if not _is_in_viewport(element):
            hidden_elements_count += 1
    
    for element in elements:
        # Mark new elements with *[ prefix (elements that appeared since last step)
        index_prefix = f'*[{element["index"]}]' if element.get("is_new", False) else f'[{element["index"]}]'
        parts = [index_prefix]
        
        # Tag name
        tag = element.get("tagName", "unknown")
        parts.append(f'<{tag}>')
        
        # Role (if different from default)
        if element.get("role"):
            parts.append(f'role="{element["role"]}"')
        
        # Enhanced state information
        if element.get("disabled"):
            parts.append("(DISABLED)")
        
        if element.get("required"):
            parts.append("(REQUIRED)")
            
        if element.get("invalid"):
            parts.append("(INVALID)")
            
        if element.get("expanded") is True:
            parts.append("(EXPANDED)")
        elif element.get("expanded") is False:
            parts.append("(COLLAPSED)")
        
        # Click listener detection
        if element.get("hasClickListeners"):
            parts.append("(HAS_LISTENERS)")
        
        # Scrollable containers
        if element.get("isScrollable"):
            scroll_info = element.get("scrollInfo", {})
            if scroll_info.get("hasVerticalScroll"):
                pages_above = scroll_info.get("scrollTop", 0) / scroll_info.get("clientHeight", 1)
                remaining_height = scroll_info.get("scrollHeight", 0) - scroll_info.get("scrollTop", 0) - scroll_info.get("clientHeight", 0)
                pages_below = remaining_height / scroll_info.get("clientHeight", 1)
                parts.append(f"(SCROLL: {pages_above:.1f} pages above, {pages_below:.1f} pages below)")
        
        # Main text content
        text = element.get("text", "").strip()
        if text:
            # Truncate long text
            display_text = text[:80] + "..." if len(text) > 80 else text
            parts.append(f'"{display_text}"')
        
        # Form field attributes
        if element.get("placeholder"):
            parts.append(f'placeholder="{element["placeholder"]}"')
        
        if element.get("type"):
            parts.append(f'type={element["type"]}')
        
        if element.get("ariaLabel"):
            aria_label = element["ariaLabel"][:50]  # Truncate aria-label
            parts.append(f'aria-label="{aria_label}"')
        
        # Link href
        if element.get("href"):
            href = element["href"]
            if len(href) > 60:
                href = href[:60] + "..."
            parts.append(f'href="{href}"')
        
        # Form values
        if element.get("value") is not None:
            value = str(element["value"])[:30]  # Truncate value
            parts.append(f'value="{value}"')
        
        # Boolean states
        if element.get("checked") is True:
            parts.append("(checked)")
        
        if element.get("disabled"):
            parts.append("(disabled)")
        
        if element.get("focused"):
            parts.append("(focused)")
        
        # Parent context for disambiguation
        hierarchy = _get_element_hierarchy(element)
        if hierarchy:
            parts.append(f'in:{hierarchy}')
        
        # Position info (show only if element might be off-screen)
        if not _is_in_viewport(element):
            rect = element.get("rect", {})
            if rect:
                parts.append(f'pos=({rect.get("x", 0)},{rect.get("y", 0)})')
        
        line = " ".join(parts)
        lines.append(line)
        
        # Check length limit with better truncation
        total_length += len(line) + 1  # +1 for newline
        if total_length > max_length:
            # Truncate gracefully at element boundaries
            remaining = len(elements) - len(lines)
            if remaining > 0:
                lines.append(f"\\n--- TRUNCATED: {remaining} more elements below ---")
            break
    
    result = "\\n".join(lines)
    
    # Add comprehensive header with scroll position and hidden elements info
    visible_count = len(lines) - 1 if "TRUNCATED" in result else len(lines)
    
    header_parts = [f"Interactive elements on page ({visible_count}/{len(elements)} shown)"]
    
    if hidden_elements_count > 0:
        header_parts.append(f"{hidden_elements_count} elements below viewport")
    
    # Could add current scroll position here if available
    header = ", ".join(header_parts) + ":\\n"
    
    return header + result


async def get_page_screenshot(page: Page, path: str = None, **kwargs) -> bytes:
    """Capture page screenshot."""
    screenshot_options = {
        "full_page": False,  # Viewport only by default
        "type": "png",
        **kwargs
    }
    
    if path:
        screenshot_options["path"] = path
    
    try:
        screenshot = await page.screenshot(**screenshot_options)
        logger.debug(f"Screenshot captured: {len(screenshot)} bytes")
        return screenshot
    except Exception as e:
        logger.error(f"Failed to capture screenshot: {e}")
        return b""


async def get_page_info(page: Page) -> Dict[str, Any]:
    """Get basic page information."""
    try:
        info = {
            "url": page.url,
            "title": await page.title(),
            "viewport": page.viewport_size,
        }
        
        # Add scroll position
        scroll_info = await page.evaluate("""() => ({
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            scrollHeight: document.documentElement.scrollHeight,
            scrollWidth: document.documentElement.scrollWidth,
            clientHeight: document.documentElement.clientHeight,
            clientWidth: document.documentElement.clientWidth
        })""")
        
        info.update(scroll_info)
        return info
        
    except Exception as e:
        logger.error(f"Failed to get page info: {e}")
        return {"url": page.url, "error": str(e)}


async def wait_for_page_stability(page: Page, timeout: int = 5000) -> bool:
    """Wait for page to stabilize (useful for SPAs)."""
    try:
        # Wait for network to be idle
        await page.wait_for_load_state("networkidle", timeout=timeout)
        
        # Additional wait for DOM mutations to settle
        stable = await page.evaluate("""(timeout) => {
            return new Promise((resolve) => {
                let mutationCount = 0;
                let timer;
                
                const observer = new MutationObserver(() => {
                    mutationCount++;
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        observer.disconnect();
                        resolve(mutationCount < 10);  // Consider stable if < 10 mutations
                    }, 1000);  // Wait 1s after last mutation
                });
                
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true
                });
                
                // Fallback timeout
                setTimeout(() => {
                    observer.disconnect();
                    resolve(true);
                }, timeout);
            });
        }""", timeout)
        
        return stable
        
    except Exception as e:
        logger.warning(f"Page stability check failed: {e}")
        return False