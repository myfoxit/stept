#!/usr/bin/env python3
"""
Test script to verify the enhanced agent prompt quality.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'packages/stept-engine'))

from stept.agent import Agent
from stept.models import StepResult, StepAction, ActionType

def test_enhanced_prompt():
    """Test the enhanced prompt generation."""
    
    # Create an agent instance
    agent = Agent(
        task="Find the price of iPhone 15 Pro on Apple's website",
        llm_client=None,  # We don't need LLM for prompt testing
        url="https://apple.com"
    )
    
    # Mock some elements
    mock_elements = [
        {"index": 0, "tagName": "input", "placeholder": "Search apple.com", "role": "searchbox"},
        {"index": 1, "tagName": "button", "text": "Search", "hasClickListeners": True},
        {"index": 2, "tagName": "a", "text": "iPhone", "href": "/iphone/"},
        {"index": 3, "tagName": "div", "text": "iPhone 15 Pro from $999", "is_new": True},  # New element
    ]
    
    # Mock step results 
    mock_steps = [
        StepResult(
            success=True,
            action=StepAction(action=ActionType.NAVIGATE, value="https://apple.com"),
            url_before="",
            url_after="https://apple.com",
            thinking="I need to navigate to Apple's website first",
            memory="Started on Apple homepage",
            next_goal="Search for iPhone 15 Pro"
        ),
        StepResult(
            success=False,
            action=StepAction(action=ActionType.CLICK, element_index=5),
            url_before="https://apple.com",
            url_after="https://apple.com",
            error="Element not found",
            thinking="Tried to click iPhone link but it wasn't found",
            evaluation="Failed because element index was wrong",
            memory="Homepage loaded but couldn't find the iPhone link"
        )
    ]
    
    # Build enhanced prompt
    from stept.dom import serialize_elements_for_llm
    elements_text = serialize_elements_for_llm(mock_elements)
    
    prompt = agent._build_agent_prompt(
        elements_text=elements_text,
        step_results=mock_steps,
        plan=["Navigate to Apple website", "Search for iPhone 15 Pro", "Find pricing information"],
        step_number=3
    )
    
    print(f"Enhanced Prompt Length: {len(prompt)} characters ({len(prompt)/1024:.1f}KB)")
    print("\n" + "="*80)
    print("ENHANCED AGENT PROMPT:")
    print("="*80)
    print(prompt)
    print("="*80)
    
    # Verify key improvements are present
    improvements_found = []
    
    if "CRITICAL EXECUTION RULES" in prompt:
        improvements_found.append("✓ Critical rules section")
    if "PRE-DONE VERIFICATION" in prompt:
        improvements_found.append("✓ Verification checklist")
    if "ERROR RECOVERY" in prompt:
        improvements_found.append("✓ Error recovery guidance")
    if "thinking" in prompt and "evaluation" in prompt:
        improvements_found.append("✓ Structured output format")
    if "*[3]" in prompt:  # Check for new element marking
        improvements_found.append("✓ New element tracking")
    if "Step 1: ✅" in prompt:  # Check for detailed step info
        improvements_found.append("✓ Enhanced step history")
    
    print(f"\nKey Improvements Found ({len(improvements_found)}/6):")
    for improvement in improvements_found:
        print(f"  {improvement}")
    
    if len(improvements_found) >= 5:
        print("\n🎉 SUCCESS: Enhanced prompt contains most key improvements!")
        return True
    else:
        print("\n❌ INCOMPLETE: Some improvements are missing.")
        return False

if __name__ == "__main__":
    success = test_enhanced_prompt()
    sys.exit(0 if success else 1)