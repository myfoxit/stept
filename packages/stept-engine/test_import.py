#!/usr/bin/env python3
"""Test script to verify the package is importable."""

import sys
from pathlib import Path

# Add the package to Python path
package_root = Path(__file__).parent / "stept"
sys.path.insert(0, str(package_root.parent))

def test_imports():
    """Test that all main modules can be imported."""
    print("Testing imports...")
    
    try:
        # Test main package
        import stept
        print("✓ Main package imported")
        
        # Test models
        from stept.models import Recording, StepAction, ActionType, RunResult
        print("✓ Models imported")
        
        # Test core classes
        from stept import Agent, ReplayEngine
        print("✓ Agent and ReplayEngine imported")
        
        # Test storage
        from stept.storage import LocalStorage, RemoteStorage
        print("✓ Storage backends imported")
        
        # Test browser manager
        from stept.browser import BrowserManager
        print("✓ Browser manager imported")
        
        # Test other modules
        from stept import finder, dom, actions
        print("✓ Core modules imported")
        
        print("\\n✓ All imports successful!")
        return True
        
    except Exception as e:
        print(f"✗ Import failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_basic_functionality():
    """Test basic object creation."""
    print("\\nTesting basic functionality...")
    
    try:
        from stept.models import Recording, StepAction, ActionType
        from stept.storage import LocalStorage
        
        # Test model creation
        action = StepAction(
            action=ActionType.CLICK,
            description="Test click action"
        )
        print("✓ StepAction created")
        
        recording = Recording(
            id="test-123",
            name="Test Recording",
            steps=[action]
        )
        print("✓ Recording created")
        
        # Test storage creation
        storage = LocalStorage()
        print("✓ LocalStorage created")
        
        print("\\n✓ Basic functionality test passed!")
        return True
        
    except Exception as e:
        print(f"✗ Functionality test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_imports() and test_basic_functionality()
    
    if success:
        print("\\n🎉 Package is ready!")
        sys.exit(0)
    else:
        print("\\n❌ Package has issues")
        sys.exit(1)