"""Remote storage client for Stept platform."""

import asyncio
import logging
from typing import List, Optional
import httpx

from .base import Storage
from .local import LocalStorage
from ..models import Recording

logger = logging.getLogger(__name__)


class RemoteStorage(Storage):
    """Stept platform API client with local storage fallback."""
    
    def __init__(
        self,
        server_url: str,
        api_key: str = None,
        timeout: int = 30,
        fallback_to_local: bool = True,
        local_storage_dir: str = None
    ):
        self.server_url = server_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        
        # Setup local storage as fallback
        self.fallback_to_local = fallback_to_local
        self.local_storage = LocalStorage(local_storage_dir) if fallback_to_local else None
        
        # HTTP client configuration
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        self.client = httpx.AsyncClient(
            base_url=f"{self.server_url}/api/v1",
            headers=headers,
            timeout=timeout
        )
        
        logger.info(f"Remote storage initialized: {server_url}")
    
    async def list_recordings(self) -> List[Recording]:
        """Get all recordings from remote server."""
        try:
            response = await self.client.get("/recordings")
            response.raise_for_status()
            
            data = response.json()
            recordings = [Recording.model_validate(item) for item in data.get("recordings", [])]
            
            logger.debug(f"Retrieved {len(recordings)} recordings from server")
            return recordings
            
        except Exception as e:
            logger.warning(f"Failed to list recordings from server: {e}")
            if self.local_storage:
                logger.info("Falling back to local storage")
                return await self.local_storage.list_recordings()
            return []
    
    async def get_recording(self, recording_id: str) -> Optional[Recording]:
        """Get specific recording from server."""
        try:
            response = await self.client.get(f"/recordings/{recording_id}")
            response.raise_for_status()
            
            data = response.json()
            recording = Recording.model_validate(data)
            
            # Cache locally if fallback is enabled
            if self.local_storage:
                await self.local_storage.save_recording(recording)
            
            return recording
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.debug(f"Recording {recording_id} not found on server")
            else:
                logger.warning(f"Failed to get recording {recording_id}: {e}")
                
            if self.local_storage:
                return await self.local_storage.get_recording(recording_id)
            return None
            
        except Exception as e:
            logger.warning(f"Error getting recording {recording_id}: {e}")
            if self.local_storage:
                return await self.local_storage.get_recording(recording_id)
            return None
    
    async def save_recording(self, recording: Recording) -> str:
        """Save recording to server."""
        try:
            recording_dict = recording.model_dump()
            response = await self.client.post("/recordings", json=recording_dict)
            response.raise_for_status()
            
            data = response.json()
            saved_id = data.get("id", recording.id)
            
            # Update local ID if server returned different one
            if saved_id != recording.id:
                recording.id = saved_id
            
            # Cache locally as well
            if self.local_storage:
                await self.local_storage.save_recording(recording)
            
            logger.debug(f"Saved recording to server: {saved_id}")
            return saved_id
            
        except Exception as e:
            logger.warning(f"Failed to save recording to server: {e}")
            if self.local_storage:
                logger.info("Falling back to local storage")
                return await self.local_storage.save_recording(recording)
            raise
    
    async def delete_recording(self, recording_id: str) -> bool:
        """Delete recording from server."""
        try:
            response = await self.client.delete(f"/recordings/{recording_id}")
            response.raise_for_status()
            
            # Also delete locally
            if self.local_storage:
                await self.local_storage.delete_recording(recording_id)
            
            logger.debug(f"Deleted recording from server: {recording_id}")
            return True
            
        except Exception as e:
            logger.warning(f"Failed to delete recording from server: {e}")
            if self.local_storage:
                return await self.local_storage.delete_recording(recording_id)
            return False
    
    async def find_by_url(self, url_pattern: str) -> List[Recording]:
        """Find recordings by URL pattern using server search."""
        try:
            params = {"url_pattern": url_pattern}
            response = await self.client.get("/recordings/search", params=params)
            response.raise_for_status()
            
            data = response.json()
            recordings = [Recording.model_validate(item) for item in data.get("recordings", [])]
            
            logger.debug(f"Found {len(recordings)} recordings by URL pattern: {url_pattern}")
            return recordings
            
        except Exception as e:
            logger.warning(f"URL search failed on server: {e}")
            if self.local_storage:
                return await self.local_storage.find_by_url(url_pattern)
            return []
    
    async def find_by_task(self, task: str) -> List[Recording]:
        """Find recordings by task using server's semantic search."""
        try:
            payload = {"task": task}
            response = await self.client.post("/recordings/search", json=payload)
            response.raise_for_status()
            
            data = response.json()
            recordings = [Recording.model_validate(item) for item in data.get("recordings", [])]
            
            logger.debug(f"Found {len(recordings)} recordings for task: {task}")
            return recordings
            
        except Exception as e:
            logger.warning(f"Task search failed on server: {e}")
            if self.local_storage:
                return await self.local_storage.find_by_task(task)
            return []
    
    async def upload_local_recordings(self) -> int:
        """Upload all local recordings to server (sync operation)."""
        if not self.local_storage:
            return 0
        
        local_recordings = await self.local_storage.list_recordings()
        uploaded_count = 0
        
        for recording in local_recordings:
            try:
                await self.save_recording(recording)
                uploaded_count += 1
                logger.debug(f"Uploaded recording: {recording.id}")
            except Exception as e:
                logger.warning(f"Failed to upload recording {recording.id}: {e}")
        
        logger.info(f"Uploaded {uploaded_count}/{len(local_recordings)} recordings to server")
        return uploaded_count
    
    async def sync_recordings(self, direction: str = "both") -> dict:
        """Sync recordings between local and remote storage."""
        if not self.local_storage:
            return {"error": "Local storage not available for sync"}
        
        stats = {"uploaded": 0, "downloaded": 0, "conflicts": 0}
        
        try:
            # Get recordings from both sources
            local_recordings = {r.id: r for r in await self.local_storage.list_recordings()}
            remote_recordings = {r.id: r for r in await self.list_recordings()}
            
            if direction in ["up", "both"]:
                # Upload local recordings not on server
                for local_id, local_recording in local_recordings.items():
                    if local_id not in remote_recordings:
                        try:
                            await self.save_recording(local_recording)
                            stats["uploaded"] += 1
                        except Exception as e:
                            logger.warning(f"Failed to upload {local_id}: {e}")
            
            if direction in ["down", "both"]:
                # Download remote recordings not local
                for remote_id, remote_recording in remote_recordings.items():
                    if remote_id not in local_recordings:
                        try:
                            await self.local_storage.save_recording(remote_recording)
                            stats["downloaded"] += 1
                        except Exception as e:
                            logger.warning(f"Failed to download {remote_id}: {e}")
                    else:
                        # Check for conflicts (different versions)
                        local_version = local_recordings[remote_id]
                        if local_version.model_dump() != remote_recording.model_dump():
                            stats["conflicts"] += 1
                            logger.warning(f"Conflict detected for recording {remote_id}")
            
            logger.info(f"Sync complete: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"Sync failed: {e}")
            return {"error": str(e)}
    
    async def get_server_stats(self) -> dict:
        """Get server statistics."""
        try:
            response = await self.client.get("/stats")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.warning(f"Failed to get server stats: {e}")
            return {"error": str(e)}
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()