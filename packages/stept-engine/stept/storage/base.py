"""Abstract storage interface for recordings."""

from abc import ABC, abstractmethod
from typing import List, Optional
from ..models import Recording


class Storage(ABC):
    """Abstract base class for recording storage."""
    
    @abstractmethod
    async def list_recordings(self) -> List[Recording]:
        """Get all available recordings."""
        pass
    
    @abstractmethod
    async def get_recording(self, recording_id: str) -> Optional[Recording]:
        """Get a specific recording by ID."""
        pass
    
    @abstractmethod
    async def save_recording(self, recording: Recording) -> str:
        """Save a recording and return its ID."""
        pass
    
    @abstractmethod
    async def delete_recording(self, recording_id: str) -> bool:
        """Delete a recording by ID. Returns True if successful."""
        pass
    
    @abstractmethod
    async def find_by_url(self, url_pattern: str) -> List[Recording]:
        """Find recordings that match a URL pattern."""
        pass
    
    @abstractmethod
    async def find_by_task(self, task: str) -> List[Recording]:
        """Find recordings that match a task description."""
        pass
    
    async def update_recording_stats(self, recording_id: str, success: bool) -> bool:
        """Update recording success/fail statistics."""
        recording = await self.get_recording(recording_id)
        if not recording:
            return False
        
        if success:
            recording.success_count += 1
        else:
            recording.fail_count += 1
        
        recording.last_run_at = str(int(__import__('time').time()))
        await self.save_recording(recording)
        return True