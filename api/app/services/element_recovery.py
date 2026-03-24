"""
Element recovery service - LLM-assisted element finding when selectors fail.
"""

import json
import logging
from typing import List, Dict, Any, Optional

from app.services.llm import chat_completion
from app.services.llm import ChatMessage

logger = logging.getLogger(__name__)


def serialize_elements_for_llm(elements: List[Dict[str, Any]], target_info: Optional[Dict[str, Any]] = None) -> str:
    """
    Format page elements for LLM element recovery.
    Based on stept-engine's serialize_elements_for_llm pattern.
    """
    if not elements:
        return "No interactive elements found on the page."
    
    lines = []
    
    # Add header with context
    total_elements = len(elements)
    lines.append(f"Interactive elements on page ({total_elements} found):")
    lines.append("")
    
    for i, element in enumerate(elements):
        parts = [f"[{i}]"]
        
        # Tag name
        tag = element.get("tagName", "unknown")
        parts.append(f"<{tag}>")
        
        # Text content (most important for matching)
        text = element.get("text", "").strip()
        if text:
            display_text = text[:100] + "..." if len(text) > 100 else text
            parts.append(f'"{display_text}"')
        
        # Important attributes for identification
        if element.get("role"):
            parts.append(f'role="{element["role"]}"')
        
        if element.get("ariaLabel"):
            parts.append(f'aria-label="{element["ariaLabel"]}"')
        
        if element.get("placeholder"):
            parts.append(f'placeholder="{element["placeholder"]}"')
        
        if element.get("type"):
            parts.append(f'type="{element["type"]}"')
        
        if element.get("href"):
            href = element["href"]
            if len(href) > 60:
                href = href[:60] + "..."
            parts.append(f'href="{href}"')
        
        # Value for inputs
        if element.get("value"):
            value = str(element["value"])[:50]
            parts.append(f'value="{value}"')
        
        # State information
        if element.get("disabled"):
            parts.append("(DISABLED)")
        if element.get("checked"):
            parts.append("(CHECKED)")
        if element.get("focused"):
            parts.append("(FOCUSED)")
        
        # Parent context if available
        if element.get("parentText"):
            parent_text = element["parentText"][:50]
            parts.append(f'in:"{parent_text}"')
        
        line = " ".join(parts)
        lines.append(line)
    
    return "\n".join(lines)


async def recover_element_with_llm(target_info: Dict[str, Any], page_elements: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Use LLM to find the best matching element when selectors fail.
    
    Args:
        target_info: Information about the target element we're looking for
        page_elements: List of current page elements 
        
    Returns:
        Dict with 'found', 'element_index', 'confidence', 'reasoning' keys
    """
    if not page_elements:
        return {"found": False, "error": "No elements provided"}
    
    # Build LLM prompt
    elements_text = serialize_elements_for_llm(page_elements, target_info)
    
    # Extract target description from target_info
    target_description = _extract_target_description(target_info)
    
    prompt = f"""I need to find an element on a web page. The original selectors no longer work, but I have information about what I'm looking for.

TARGET ELEMENT I'M LOOKING FOR:
{target_description}

CURRENT PAGE ELEMENTS:
{elements_text}

Please analyze the elements and find the best match for my target element. Respond with JSON in this exact format:

{{"found": true/false, "element_index": number or null, "confidence": 0.0-1.0, "reasoning": "explanation"}}

Instructions:
- Look for elements that match the target's purpose, text content, or context
- Consider semantic similarity (e.g., "Submit" button matching "Submit Order" target)
- Prefer exact text matches, but allow fuzzy matching for slight variations
- Return confidence 0.9+ for very confident matches, 0.7+ for good matches, 0.5+ for uncertain matches
- Return found: false if no reasonable match exists
- Only return found: true if confidence >= 0.5"""

    try:
        # Create messages for chat completion
        messages = [
            {"role": "user", "content": prompt}
        ]
        
        # Call LLM service
        response = await chat_completion(
            messages=messages,
            model=None,  # Use default model
            stream=False  # We need the complete response to parse JSON
        )
        
        # Extract text from response
        if hasattr(response, 'text'):
            response_text = response.text
        else:
            # Handle streaming response by collecting all chunks
            response_text = ""
            async for chunk in response:
                response_text += chunk
        
        # Parse JSON response
        try:
            result = json.loads(response_text.strip())
            
            # Validate response format
            if not isinstance(result, dict):
                raise ValueError("Response is not a JSON object")
            
            # Set defaults for missing keys
            result.setdefault("found", False)
            result.setdefault("element_index", None)
            result.setdefault("confidence", 0.0)
            result.setdefault("reasoning", "Unknown")
            
            # Validate element_index
            if result["found"] and result["element_index"] is not None:
                idx = result["element_index"]
                if not isinstance(idx, int) or idx < 0 or idx >= len(page_elements):
                    logger.warning(f"Invalid element_index {idx}, setting found=False")
                    result["found"] = False
                    result["element_index"] = None
            
            logger.info(f"Element recovery result: found={result['found']}, confidence={result.get('confidence', 0)}")
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}, response: {response_text[:200]}")
            return {
                "found": False,
                "error": "Failed to parse LLM response",
                "raw_response": response_text[:500]
            }
        
    except Exception as e:
        logger.error(f"LLM element recovery failed: {e}")
        return {
            "found": False,
            "error": f"LLM call failed: {str(e)}"
        }


def _extract_target_description(target_info: Dict[str, Any]) -> str:
    """Extract a human-readable description of the target element."""
    parts = []
    
    # Add content/text if available
    if target_info.get("content"):
        parts.append(f'Text content: "{target_info["content"]}"')
    elif target_info.get("text"):
        parts.append(f'Text content: "{target_info["text"]}"')
    
    # Add element type information
    if target_info.get("tagName"):
        parts.append(f'HTML tag: <{target_info["tagName"]}>')
    
    if target_info.get("role"):
        parts.append(f'ARIA role: "{target_info["role"]}"')
    
    if target_info.get("type"):
        parts.append(f'Input type: "{target_info["type"]}"')
    
    # Add identifying attributes
    if target_info.get("ariaLabel"):
        parts.append(f'ARIA label: "{target_info["ariaLabel"]}"')
    
    if target_info.get("placeholder"):
        parts.append(f'Placeholder: "{target_info["placeholder"]}"')
    
    if target_info.get("title"):
        parts.append(f'Title: "{target_info["title"]}"')
    
    # Add step context if available
    if target_info.get("step_title"):
        parts.append(f'Step context: "{target_info["step_title"]}"')
    
    if target_info.get("step_description"):
        parts.append(f'Step description: "{target_info["step_description"]}"')
    
    # Add action context
    if target_info.get("action_type"):
        parts.append(f'Expected action: {target_info["action_type"]}')
    
    if not parts:
        parts.append("No specific target information available")
    
    return "\n".join(parts)


async def extract_new_selectors(element: Dict[str, Any], page_elements: List[Dict[str, Any]]) -> List[str]:
    """
    Generate new reliable selectors for the found element.
    This will be used for self-healing functionality.
    """
    selectors = []
    
    # Basic selectors based on element attributes
    if element.get("id"):
        selectors.append(f'#{element["id"]}')
    
    if element.get("testId"):
        for attr in ["data-testid", "data-test", "data-cy"]:
            selectors.append(f'[{attr}="{element["testId"]}"]')
    
    if element.get("ariaLabel"):
        selectors.append(f'[aria-label="{element["ariaLabel"]}"]')
    
    if element.get("name"):
        selectors.append(f'[name="{element["name"]}"]')
    
    # Tag + attribute combinations
    tag = element.get("tagName", "")
    if tag and element.get("type"):
        selectors.append(f'{tag}[type="{element["type"]}"]')
    
    if tag and element.get("role"):
        selectors.append(f'{tag}[role="{element["role"]}"]')
    
    # Text-based selectors (less reliable but useful as fallback)
    if element.get("text") and len(element["text"]) > 2:
        text = element["text"].strip()[:50]  # Limit length
        # This would need to be implemented on the frontend
        selectors.append(f'*[text*="{text}"]')  # Pseudo-selector for text matching
    
    return selectors