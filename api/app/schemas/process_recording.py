from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum

class StepTypeEnum(str, Enum):
    screenshot = "screenshot"
    tip = "tip"
    alert = "alert"
    header = "header"
    text = "text"
    gif = "gif"
    video = "video"

class StepType(str, Enum):
    screenshot = "screenshot"
    text = "text"
    header = "header"
    tip = "tip"
    alert = "alert"
    capture = "capture"
    gif = "gif"
    video = "video"

class SessionCreate(BaseModel):
    timestamp: datetime
    client: Optional[str] = "SteptRecorder"
    project_id: Optional[str] = None
    user_id: Optional[str] = None
    folder_id: Optional[str] = None  # NEW: Support folder_id
    name: Optional[str] = None  # NEW: Support name
    is_private: Optional[bool] = True  # NEW: Default to private

class SessionResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    
    class Config:
        populate_by_name = True

class StepMetadata(BaseModel):
    step_number: int = Field(alias="stepNumber")
    timestamp: datetime
    action_type: str = Field(alias="actionType")
    window_title: Optional[str] = Field(None, alias="windowTitle")
    description: Optional[str] = None
    global_position: Optional[dict] = Field(None, alias="globalPosition")
    relative_position: Optional[dict] = Field(None, alias="relativePosition")
    window_size: Optional[dict] = Field(None, alias="windowSize")
    key_pressed: Optional[str] = Field(None, alias="keyPressed")
    text_typed: Optional[str] = Field(None, alias="textTyped")
    scroll_delta: Optional[int] = Field(None, alias="scrollDelta")
    screenshot_size: Optional[dict] = Field(None, alias="screenshotSize")
    screenshot_relative_position: Optional[dict] = Field(None, alias="screenshotRelativePosition")
    step_type: Optional[str] = Field(None, alias="stepType")
    content: Optional[str] = None
    file_uploaded: Optional[bool] = Field(None, alias="fileUploaded")
    # Rich context — flexible JSON for evolving element data from any client
    url: Optional[str] = None
    owner_app: Optional[str] = Field(None, alias="ownerApp")
    element_info: Optional[dict] = Field(None, alias="elementInfo")
    
    # Spoken narration text (from desktop audio transcription)
    spoken_text: Optional[str] = Field(None, alias="spokenText")

    # AI-generated fields from desktop app
    generated_title: Optional[str] = Field(None, alias="generatedTitle")
    generated_description: Optional[str] = Field(None, alias="generatedDescription")
    
    class Config:
        populate_by_name = True

class SessionStatusResponse(BaseModel):
    session_id: str
    status: str
    created_at: datetime
    total_steps: Optional[int] = 0
    total_files: Optional[int] = 0
    files_uploaded: int
    metadata: Optional[List[Dict[str, Any]]] = []  # Make it optional with default empty list
    storage_type: str
    storage_path: Optional[str] = None
    
    class Config:
        from_attributes = True
        # Add this to help with serialization
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class FileUploadResponse(BaseModel):
    success: bool
    step_number: int
    filename: Optional[str] = None
    file_path: Optional[str] = None
    message: Optional[str] = None

class StepCreate(BaseModel):
    step_type: StepType
    description: Optional[str] = None
    content: Optional[str] = None
    window_title: Optional[str] = None

class StepUpdate(BaseModel):
    description: Optional[str] = None
    content: Optional[str] = None
    window_title: Optional[str] = None

class StepReorder(BaseModel):
    step_number: int
    new_position: int

class BulkStepReorder(BaseModel):
    reorders: List[StepReorder]

class StepResponse(BaseModel):
    id: str
    session_id: str
    step_number: int
    step_type: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    timestamp: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class WorkflowMove(BaseModel):
    """Schema for moving a workflow to a different folder/position"""
    folder_id: Optional[str] = Field(None, description="Target folder ID (null for root)")
    position: Optional[int] = Field(None, description="Position within the folder")
    is_private: Optional[bool] = None  # NEW: Allow changing privacy when moving

class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    folder_id: Optional[str] = None
    icon_type: Optional[str] = None
    icon_value: Optional[str] = None
    icon_color: Optional[str] = None
    is_private: Optional[bool] = None  # NEW


# ── AI Processing Schemas ────────────────────────────────────────────────────

class ProcessingStatus(BaseModel):
    recording_id: str
    steps_annotated: int
    total_steps: int
    has_summary: bool
    is_processed: bool = False

class GuideResponse(BaseModel):
    recording_id: str
    guide_markdown: Optional[str] = None
    generated_title: Optional[str] = None

class StepAnnotation(BaseModel):
    step_id: str
    step_number: int
    generated_title: Optional[str] = None
    generated_description: Optional[str] = None
    ui_element: Optional[str] = None
    step_category: Optional[str] = None
    is_annotated: bool = False

    class Config:
        from_attributes = True

class RecordingAISummary(BaseModel):
    recording_id: str
    generated_title: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[List[str]] = None
    estimated_time: Optional[str] = None
    difficulty: Optional[str] = None
    is_processed: bool = False

    class Config:
        from_attributes = True
