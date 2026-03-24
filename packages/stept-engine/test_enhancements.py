#!/usr/bin/env python3
"""Test script for the enhanced stept-engine features."""

import asyncio
import logging
from stept.dom import inject_listener_tracker, get_interactive_elements, serialize_elements_for_llm
from stept.actions import auto_dismiss_cookie_banner
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

async def test_enhanced_features():
    """Test the new enhanced features."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        try:
            # Test 1: Inject listener tracker
            logger.info("Testing listener tracker injection...")
            await inject_listener_tracker(page)
            logger.info("✓ Listener tracker injected successfully")
            
            # Test 2: Navigate to a test page with interactive elements
            logger.info("Testing enhanced DOM extraction...")
            await page.goto('https://httpbin.org/forms/post')
            await page.wait_for_timeout(2000)
            
            # Test 3: Extract elements with enhanced features
            elements = await get_interactive_elements(page)
            logger.info(f"✓ Extracted {len(elements)} elements")
            
            # Test 4: Serialize with enhanced formatting
            serialized = serialize_elements_for_llm(elements)
            print("\nSerialized elements preview:")
            print("=" * 50)
            print(serialized[:1000] + "..." if len(serialized) > 1000 else serialized)
            print("=" * 50)
            
            # Test 5: Cookie banner auto-dismiss (won't find any on this page, but tests the function)
            logger.info("Testing cookie banner auto-dismiss...")
            dismissed = await auto_dismiss_cookie_banner(page)
            logger.info(f"✓ Cookie banner dismissal tested (found: {dismissed})")
            
            logger.info("\n🎉 All enhanced features tested successfully!")
            
        except Exception as e:
            logger.error(f"Test failed: {e}")
            raise
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(test_enhanced_features())