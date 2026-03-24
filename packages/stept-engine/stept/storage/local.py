"""Local JSON file storage for recordings."""

import asyncio
import json
import os
import glob
import logging
from pathlib import Path
from typing import List, Optional
from fnmatch import fnmatch
import threading

from .base import Storage
from ..models import Recording

logger = logging.getLogger(__name__)


class LocalStorage(Storage):
    """JSON file storage in ~/.stept/recordings/"""
    
    def __init__(self, recordings_dir: str = None):
        if recordings_dir:
            self.recordings_dir = Path(recordings_dir)
        else:
            self.recordings_dir = Path.home() / ".stept" / "recordings"
        
        # Create directory if it doesn't exist
        self.recordings_dir.mkdir(parents=True, exist_ok=True)
        
        # Thread lock for file operations
        self._lock = threading.Lock()
        
        logger.info(f"Local storage initialized: {self.recordings_dir}")
    
    async def list_recordings(self) -> List[Recording]:
        """Get all recordings from JSON files."""
        recordings = []
        
        try:
            # Use glob to find all .json files
            pattern = str(self.recordings_dir / "*.json")
            json_files = glob.glob(pattern)
            
            for file_path in json_files:
                try:
                    recording = await self._load_recording_file(file_path)
                    if recording:
                        recordings.append(recording)
                except Exception as e:
                    logger.warning(f"Failed to load recording from {file_path}: {e}")
                    
        except Exception as e:
            logger.error(f"Failed to list recordings: {e}")
        
        # Sort by creation time (newest first)
        recordings.sort(key=lambda r: r.created_at or "0", reverse=True)
        return recordings
    
    async def get_recording(self, recording_id: str) -> Optional[Recording]:
        """Get specific recording by ID."""
        file_path = self.recordings_dir / f"{recording_id}.json"
        
        if not file_path.exists():
            return None
        
        return await self._load_recording_file(str(file_path))
    
    async def save_recording(self, recording: Recording) -> str:
        """Save recording to JSON file."""
        file_path = self.recordings_dir / f"{recording.id}.json"
        
        try:
            # Convert to dict for JSON serialization
            recording_dict = recording.model_dump()
            
            # Thread-safe file write
            with self._lock:
                await asyncio.to_thread(self._write_json_file, str(file_path), recording_dict)
            
            logger.debug(f"Saved recording: {recording.id}")
            return recording.id
            
        except Exception as e:
            logger.error(f"Failed to save recording {recording.id}: {e}")
            raise
    
    async def delete_recording(self, recording_id: str) -> bool:
        """Delete recording file."""
        file_path = self.recordings_dir / f"{recording_id}.json"
        
        try:
            if file_path.exists():
                with self._lock:
                    await asyncio.to_thread(file_path.unlink)
                logger.debug(f"Deleted recording: {recording_id}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Failed to delete recording {recording_id}: {e}")
            return False
    
    async def find_by_url(self, url_pattern: str) -> List[Recording]:
        """Find recordings matching URL pattern using glob-style matching."""
        all_recordings = await self.list_recordings()
        matching = []
        
        for recording in all_recordings:
            if recording.url_pattern:
                # Use fnmatch for glob-style pattern matching
                if fnmatch(url_pattern, recording.url_pattern) or fnmatch(recording.url_pattern, url_pattern):
                    matching.append(recording)
            elif recording.steps and recording.steps[0].action.name == "navigate":
                # Check first navigation step
                nav_url = recording.steps[0].value or ""
                if fnmatch(url_pattern, nav_url) or fnmatch(nav_url, url_pattern):
                    matching.append(recording)
        
        # Sort by success rate and recency
        matching.sort(key=lambda r: (
            r.success_count / max(r.success_count + r.fail_count, 1),  # Success rate
            r.last_run_at or r.created_at or "0"  # Recency
        ), reverse=True)
        
        return matching
    
    async def find_by_task(self, task: str) -> List[Recording]:
        """Find recordings by task description using improved word overlap scoring."""
        all_recordings = await self.list_recordings()
        scored_recordings = []
        
        # Normalize task for matching
        task_words = set(task.lower().split())
        # Remove stop words
        stop_words = {'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'it', 'this', 'that', 'with'}
        task_words -= stop_words
        
        for recording in all_recordings:
            # Score based on word overlap with recording name
            name_words = set(recording.name.lower().split())
            name_words -= stop_words
            
            if not task_words or not name_words:
                continue
                
            overlap = task_words & name_words
            score = len(overlap) / max(len(task_words), len(name_words))
            
            if score > 0.2:  # Only consider recordings with meaningful overlap
                # Boost score for recordings with good success rate
                success_rate = recording.success_count / max(recording.success_count + recording.fail_count, 1)
                adjusted_score = score * (0.7 + 0.3 * success_rate)
                
                scored_recordings.append((adjusted_score, recording))
        
        # Sort by score (highest first)
        scored_recordings.sort(key=lambda x: x[0], reverse=True)
        
        # Return recordings with score > 0.2 (meaningful similarity)
        return [recording for score, recording in scored_recordings if score > 0.2]
    
    async def _load_recording_file(self, file_path: str) -> Optional[Recording]:
        """Load recording from JSON file."""
        try:
            with self._lock:
                data = await asyncio.to_thread(self._read_json_file, file_path)
            
            # Convert to Recording object
            return Recording.model_validate(data)
            
        except Exception as e:
            logger.error(f"Failed to load recording from {file_path}: {e}")
            return None
    
    def _read_json_file(self, file_path: str) -> dict:
        """Synchronous JSON file read."""
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def _write_json_file(self, file_path: str, data: dict):
        """Synchronous JSON file write with atomic operation."""
        # Write to temp file first, then move (atomic on most filesystems)
        temp_path = file_path + ".tmp"
        try:
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # Atomic move
            os.replace(temp_path, file_path)
            
        except Exception:
            # Cleanup temp file on error
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise
    
    async def export_recording(self, recording_id: str, format: str = "json") -> Optional[str]:
        """Export recording in different formats."""
        recording = await self.get_recording(recording_id)
        if not recording:
            return None
        
        if format == "json":
            return recording.model_dump_json(indent=2)
        
        elif format == "playwright":
            # Export as Playwright test code
            lines = [
                "from playwright.async_api import async_playwright",
                "",
                f"async def test_{recording.name.lower().replace(' ', '_')}():",
                "    async with async_playwright() as p:",
                "        browser = await p.chromium.launch()",
                "        page = await browser.new_page()",
                "        ",
            ]
            
            for step in recording.steps:
                if step.action == "navigate":
                    lines.append(f"        await page.goto('{step.value}')")
                elif step.action == "click" and step.element:
                    selector = step.element.selector or f"text='{step.element.text}'"
                    lines.append(f"        await page.locator('{selector}').click()")
                elif step.action == "type" and step.element:
                    selector = step.element.selector or f"text='{step.element.text}'"
                    lines.append(f"        await page.locator('{selector}').fill('{step.value}')")
                # Add more action types as needed
            
            lines.extend([
                "        ",
                "        await browser.close()"
            ])
            
            return "\n".join(lines)
        
        return None
    
    async def get_storage_stats(self) -> dict:
        """Get storage statistics."""
        recordings = await self.list_recordings()
        
        total_steps = sum(len(r.steps) for r in recordings)
        total_successes = sum(r.success_count for r in recordings)
        total_failures = sum(r.fail_count for r in recordings)
        
        return {
            "total_recordings": len(recordings),
            "total_steps": total_steps,
            "total_runs": total_successes + total_failures,
            "success_rate": total_successes / max(total_successes + total_failures, 1),
            "storage_path": str(self.recordings_dir),
            "disk_usage_mb": sum(f.stat().st_size for f in self.recordings_dir.glob("*.json")) / 1024 / 1024
        }