from typing import Any

from sqlalchemy import (
    Column, Integer, BigInteger, String, ForeignKey, Text, text, JSON, DateTime, func, Boolean, UniqueConstraint, Index, Float
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import relationship, backref
from .database import Base
from app.utils import gen_suffix
import enum
import secrets  # fix: missing import used by PublicAccessToken
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import Table  # new

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None  # graceful fallback when pgvector package not installed

def enum_values(enum_cls):
    return [member.value for member in enum_cls]

# New: Hierarchical roles for project members
class ProjectRole(enum.Enum):
    """
    Hierarchical roles with increasing permissions.
    Each role includes all permissions of lower roles.
    """
    VIEWER = "viewer"      # Level 0: Can view only
    MEMBER = "member"      # Level 1: Can view and comment
    EDITOR = "editor"      # Level 2: Can view, comment, and edit
    ADMIN = "admin"        # Level 3: Can manage members and settings
    OWNER = "owner"        # Level 4: Full control, can delete project
    
    @property
    def level(self) -> int:
        """Get the permission level of this role"""
        levels = {
            self.VIEWER: 0,
            self.MEMBER: 1,
            self.EDITOR: 2,
            self.ADMIN: 3,
            self.OWNER: 4
        }
        return levels[self]
    
    def has_permission(self, required_role: 'ProjectRole') -> bool:
        """Check if this role has at least the required permission level"""
        return self.level >= required_role.level
    
    @classmethod
    def from_string(cls, role_str: str) -> 'ProjectRole':
        """Convert string to ProjectRole enum"""
        try:
            return cls(role_str)
        except ValueError:
            # Default to viewer for unknown roles
            return cls.VIEWER

# New: Permission levels for resource access
class ColumnType(enum.Enum):
    PHYSICAL = "physical"
    VIRTUAL  = "virtual"

class TableType(enum.Enum):
    USER  = "user"
    JOIN  = "join"
    OTHER = "other"

class PermissionLevel(enum.Enum):
    VIEW = "view"
    COMMENT = "comment"
    EDIT = "edit"
    MANAGE = "manage"  # Can manage permissions for the resource

# NEW: Folder model for hierarchical structure
class Folder(Base):
    __tablename__ = "folders"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    name = Column(String, nullable=False, default="Untitled")
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Hierarchical structure using materialized path
    parent_id = Column(String(16), ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True)
    path = Column(String(500), nullable=False, default="", index=True)  # Materialized path for efficient queries
    depth = Column(Integer, nullable=False, default=0, index=True)  # Depth in tree for efficient queries
    position = Column(Integer, nullable=False, default=0, index=True)  # Position among siblings
    is_expanded = Column(Boolean, nullable=False, default=True)  # UI state for tree expansion
    icon = Column(String(50), nullable=True)  # Optional emoji or icon identifier
    
    # NEW: Privacy settings
    is_private = Column(Boolean, nullable=False, default=False, index=True)  # True = only owner can see
    owner_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)  # Owner for private folders
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", backref="folders")
    parent = relationship("Folder", remote_side=[id], backref=backref("children", cascade="all, delete-orphan"))
    documents = relationship("Document", back_populates="folder", cascade="all, delete-orphan")
    owner = relationship("User", foreign_keys=[owner_id], backref="private_folders")
    
    @property
    def ancestors(self):
        """Get list of ancestor IDs from path"""
        if not self.path:
            return []
        return self.path.rstrip('/').split('/') if self.path else []
    
    def set_path(self, parent_path: str = ""):
        """Set the materialized path based on parent"""
        if parent_path:
            self.path = f"{parent_path}{self.id}/"
        else:
            self.path = f"{self.id}/"
        self.depth = len(self.ancestors)

class User(Base):
    __tablename__ = "users"
    id   = Column(String(16), primary_key=True, default=gen_suffix)
    name = Column(String, index=True)
    email            = Column(String, unique=True, index=True, nullable=False)
    # New: normalized email for case/space-insensitive identity
    normalized_email = Column(String, unique=True, index=True, nullable=True)
    hashed_password  = Column(String, nullable=False)
    is_verified      = Column(Boolean, default=False)
    # OAuth fields
    google_id        = Column(String, nullable=True, unique=True, index=True)
    github_id        = Column(String, nullable=True, unique=True, index=True)
    avatar_url       = Column(String, nullable=True)
    auth_method      = Column(String, nullable=False, default="email", server_default="email")
    verification_tok = Column(String(32), nullable=True, index=True)
    reset_token      = Column(String(32), nullable=True, index=True)
    reset_expires_at = Column(DateTime, nullable=True)
  
    
    # New: Many-to-many relationship with projects
    member_projects = relationship(
        "Project",
        secondary="project_members",
        primaryjoin="User.id == project_members.c.user_id",
        secondaryjoin="Project.id == project_members.c.project_id",
        back_populates="members",
        overlaps="projects"  
    )
    # FIX: Explicitly specify foreign_keys to resolve ambiguity with owner_id
    recording_sessions = relationship(
        "ProcessRecordingSession",
        back_populates="user",
        foreign_keys="ProcessRecordingSession.user_id",  # Explicit foreign key
        cascade="all, delete-orphan",
    )
    


class Project(Base):
    __tablename__ = "projects"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    name = Column(String(255), index=True)
    # Keep owner_id for backward compatibility and to identify the project creator
    owner_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Deprecated: use owner relationship instead
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # AI features toggle — controls auto-processing on finalize + AI toolbar visibility
    ai_enabled = Column(Boolean, nullable=False, default=True, server_default="true")

    # Relationships
    owner = relationship("User", foreign_keys=[owner_id], backref="owned_projects")
    user = relationship("User", foreign_keys=[user_id], backref="projects")  # Keep for backward compatibility
    
    # New: Many-to-many relationship with users
    members = relationship(
        "User",
        secondary="project_members",
        primaryjoin="Project.id == project_members.c.project_id",
        secondaryjoin="User.id == project_members.c.user_id",
        back_populates="member_projects",
        overlaps="projects,user"  # Avoid warning about overlapping relationships
    )
    
    # Helper method to check if a user is a member
    def has_member(self, user_id: str) -> bool:
        return any(member.id == user_id for member in self.members)


class Document(Base):
    __tablename__ = "documents"

    id          = Column(String(16), primary_key=True, default=gen_suffix)
    name        = Column(String, nullable=True)
    content     = Column(JSON, nullable=False, server_default="{}")  
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Page layout: 'full', 'document', 'a4', 'letter'
    page_layout = Column(String(20), nullable=False, server_default="document")
    
    # Link document to a project
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Link to folder (optional - documents can exist at root)
    folder_id = Column(String(16), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True)
    source_file_path = Column(String, nullable=True)
    source_file_mime = Column(String, nullable=True)
    source_file_name = Column(String, nullable=True)
    # NEW: ordering within a folder (or root if folder_id is NULL)
    position   = Column(Integer, nullable=False, default=0, index=True)
    
    # NEW: Privacy settings
    is_private = Column(Boolean, nullable=False, default=False, index=True)  # True = only owner can see
    owner_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)  # Owner for private documents
    
    # Public sharing fields
    share_token = Column(String(64), nullable=True, unique=True, index=True)
    is_public = Column(Boolean, nullable=False, default=False)
    
    # Full-text search
    search_text = Column(String, nullable=True)  # Extracted plain text from TipTap JSON
    search_tsv = Column(TSVECTOR, nullable=True)  # tsvector for full-text search
    
    # Relationships
    project = relationship("Project", backref="documents")
    folder = relationship("Folder", back_populates="documents")
    version = Column(Integer, nullable=False, default=1)
    locked_by = Column(String(16), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    locked_at = Column(DateTime, nullable=True)
    
    # Soft delete
    deleted_at = Column(DateTime, nullable=True, index=True)

    owner = relationship("User", foreign_keys=[owner_id], backref="private_documents")


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    document_id = Column(String(16), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    content = Column(JSON, nullable=False)
    name = Column(String, nullable=True)
    byte_size = Column(Integer, nullable=True)
    created_by = Column(String(16), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())


class TextContainer(Base):
    __tablename__ = "text_container"

    id          = Column(String(16), primary_key=True, default=gen_suffix)
    name        = Column(String, nullable=True)
    content     = Column(JSON, nullable=False, server_default="{}")  
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())

# New: server-side sessions for cookie-based auth
class Session(Base):
    __tablename__ = "sessions"

    id            = Column(String(16), primary_key=True, default=gen_suffix)
    user_id       = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash    = Column(String(128), unique=True, nullable=False, index=True)
    created_at    = Column(DateTime, server_default=func.now(), nullable=False)
    last_used_at  = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    expires_at    = Column(DateTime, nullable=False)
    revoked       = Column(Boolean, default=False, nullable=False)
    user_agent    = Column(String, nullable=True)
    ip_address    = Column(String, nullable=True)

    user = relationship("User", backref="sessions")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(255), nullable=True)
    recording_id = Column(String(16), ForeignKey("process_recording_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    document_id = Column(String(16), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True)
    latest_message_id = Column(String(16), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at = Column(DateTime, nullable=True, index=True)

    user = relationship("User", backref="chat_sessions")
    project = relationship("Project", backref="chat_sessions")
    recording = relationship("ProcessRecordingSession", foreign_keys=[recording_id])
    document = relationship("Document", foreign_keys=[document_id])


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    session_id = Column(String(16), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_message_id = Column(String(16), ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    role = Column(String(20), nullable=False, index=True)
    content = Column(Text, nullable=False, default="")
    tool_calls = Column(JSON, nullable=True)
    tool_results = Column(JSON, nullable=True)
    meta = Column(JSON, nullable=True)
    position = Column(Integer, nullable=False, default=0)
    deleted_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    session = relationship("ChatSession", backref=backref("messages", cascade="all, delete-orphan", order_by="ChatMessage.created_at"))
    parent = relationship("ChatMessage", remote_side=[id], backref=backref("children"))

    __table_args__ = (
        Index('ix_chat_messages_session_position', 'session_id', 'position'),
    )

# Updated: Process Recording Models
class ProcessRecordingSession(Base):
    __tablename__ = "process_recording_sessions"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    client_name = Column(String, nullable=False, default="SteptRecorder")
    status = Column(String, nullable=False, default="uploading")  # uploading, completed, failed
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    finalized_at = Column(DateTime, nullable=True)
    total_steps = Column(Integer, nullable=True)
    total_files = Column(Integer, nullable=True)
    storage_type = Column(String, nullable=False, default="local")  # local, s3
    storage_path = Column(String, nullable=True)  # Base path for session files
    
    # NEW: Add project and folder relationships like documents
    name = Column(String, nullable=True, default="Untitled Workflow")
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    folder_id = Column(String(16), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True)
    position = Column(Integer, nullable=False, default=0, index=True)
    is_expanded = Column(Boolean, nullable=False, default=False)  # For tree UI state
    
    # NEW: Icon customization fields
    icon_type = Column(String(20), nullable=True, default="tabler")  # 'tabler' or 'favicon'
    icon_value = Column(String(255), nullable=True)  # Icon name for tabler, URL for favicon
    icon_color = Column(String(7), nullable=True, default="#6366f1")  # Hex color for tabler icons
    
    # NEW: Privacy settings
    is_private = Column(Boolean, nullable=False, default=False, index=True)  # True = only owner can see
    owner_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)  # Owner for private workflows
    
    # Public sharing fields
    share_token = Column(String(64), nullable=True, unique=True, index=True)
    is_public = Column(Boolean, nullable=False, default=False)
    
    # AI auto-processing fields
    generated_title = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)  # list of strings
    estimated_time = Column(String, nullable=True)
    difficulty = Column(String, nullable=True)  # easy, medium, advanced
    is_processed = Column(Boolean, nullable=False, default=False)
    guide_markdown = Column(Text, nullable=True)

    # Video import fields
    source_type = Column(String(20), nullable=False, default="desktop", server_default="desktop")  # desktop, cli, video
    video_filename = Column(String, nullable=True)
    video_size_bytes = Column(BigInteger, nullable=True)
    video_duration_seconds = Column(Float, nullable=True)
    processing_progress = Column(Integer, nullable=False, default=0, server_default="0")  # 0-100
    processing_stage = Column(String, nullable=True)  # uploading, extracting_audio, transcribing, extracting_frames, analyzing, generating, done, failed
    processing_error = Column(String, nullable=True)

    search_tsv = Column(TSVECTOR, nullable=True)  # tsvector for full-text search

    # Ranking signals
    view_count = Column(Integer, nullable=False, default=0, server_default="0")
    last_viewed_at = Column(DateTime, nullable=True)

    # Soft delete
    deleted_at = Column(DateTime, nullable=True, index=True)

    # Version history
    version = Column(Integer, nullable=False, default=1, server_default="1")

    # Staleness detection health columns
    health_score = Column(Float, nullable=True)
    health_status = Column(String(10), nullable=True)  # healthy | aging | stale | unknown
    last_verified_at = Column(DateTime, nullable=True)
    last_verified_source = Column(String(20), nullable=True)
    reliable_step_count = Column(Integer, default=0)
    unreliable_step_count = Column(Integer, default=0)
    failed_step_count = Column(Integer, default=0)
    coverage = Column(Float, nullable=True)

    # Relationships
    user = relationship("User", back_populates="recording_sessions", foreign_keys=[user_id])
    files = relationship("ProcessRecordingFile", back_populates="session", cascade="all, delete-orphan")
    steps = relationship("ProcessRecordingStep", back_populates="session", cascade="all, delete-orphan", order_by="ProcessRecordingStep.step_number")
    project = relationship("Project", backref="recording_sessions")
    folder = relationship("Folder", backref="recording_sessions")
    owner = relationship("User", foreign_keys=[owner_id], backref="private_workflows")

class WorkflowVersion(Base):
    __tablename__ = "workflow_versions"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    session_id = Column(String(16), ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    steps_snapshot = Column(JSON, nullable=False)
    name = Column(String, nullable=True)
    total_steps = Column(Integer, nullable=True)
    created_by = Column(String(16), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    change_summary = Column(String, nullable=True)

    session = relationship("ProcessRecordingSession", backref="versions")


class MediaProcessingJob(Base):
    __tablename__ = "media_processing_jobs"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    session_id = Column(String(16), ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    job_type = Column(String(32), nullable=False, default="video_import", server_default="video_import")
    status = Column(String(16), nullable=False, default="queued", server_default="queued")  # queued, running, succeeded, failed
    progress = Column(Integer, nullable=False, default=0, server_default="0")
    stage = Column(String(64), nullable=True)
    error = Column(String, nullable=True)
    task_id = Column(String(64), nullable=True, unique=True)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    max_attempts = Column(Integer, nullable=False, default=3, server_default="3")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    session = relationship("ProcessRecordingSession", backref="media_jobs")

    __table_args__ = (
        UniqueConstraint('session_id', 'job_type', name='uq_media_job_session_type'),
    )


class ProcessRecordingStep(Base):
    __tablename__ = "process_recording_steps"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    session_id = Column(String(16), ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    step_number = Column(Integer, nullable=False)
    step_type = Column(String, nullable=True)
    timestamp = Column(DateTime, nullable=False)
    action_type = Column(String, nullable=True)  # Make nullable for non-screenshot steps
    window_title = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    
    # Content field for text-based steps (tips, alerts, headers)
    content = Column(Text, nullable=True)
    
    # Position data as JSON columns for flexibility
    global_position = Column(JSON, nullable=True)  # {x, y}
    relative_position = Column(JSON, nullable=True)  # {x, y}
    window_size = Column(JSON, nullable=True)  # {width, height}
    screenshot_size = Column(JSON, nullable=True)  # {width, height}
    screenshot_relative_position = Column(JSON, nullable=True)  # {x, y}
    
    # Action-specific data
    key_pressed = Column(String, nullable=True)
    text_typed = Column(Text, nullable=True)
    scroll_delta = Column(Integer, nullable=True)
    
    # Rich context — flexible JSON blobs for evolving client data
    url = Column(String, nullable=True)          # Page URL (web workflows)
    owner_app = Column(String, nullable=True)    # Application name (e.g. "Google Chrome")
    element_info = Column(JSON, nullable=True)   # Raw element data from any client
    # Desktop: {role, title, value, description, subrole, domId, confidence}
    # Chrome:  {tagName, id, className, text, href, type, name, placeholder,
    #           ariaLabel, role, title, alt, associatedLabel, parentText,
    #           testId, elementRect}
    # Future clients can add arbitrary keys — schema is intentionally open
    
    # Spoken narration text (from desktop audio transcription)
    spoken_text = Column(Text, nullable=True)

    # Storage key for DOM snapshot (rrweb-snapshot serialized tree)
    dom_snapshot_key = Column(String, nullable=True)

    # AI annotation fields
    generated_title = Column(String, nullable=True)
    generated_description = Column(Text, nullable=True)
    ui_element = Column(String, nullable=True)
    step_category = Column(String, nullable=True)  # navigation, data_entry, confirmation, etc.
    is_annotated = Column(Boolean, nullable=False, default=False)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    search_tsv = Column(TSVECTOR, nullable=True)  # tsvector for full-text search

    # Relationships
    session = relationship("ProcessRecordingSession", back_populates="steps")

    # Unique constraint: one step per (session, step_number)
    __table_args__ = (
        UniqueConstraint('session_id', 'step_number', name='_session_step_number_unique'),
    )

class ProcessRecordingFile(Base):
    __tablename__ = "process_recording_files"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    session_id = Column(String(16), ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    step_number = Column(Integer, nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True, default="image/png")
    uploaded_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    session = relationship("ProcessRecordingSession", back_populates="files")

    # Unique constraint: one file per (session, step)
    __table_args__ = (
        UniqueConstraint('session_id', 'step_number', name='_session_step_unique'),
    )

# New: OAuth 2.0 Authorization Code for PKCE flow
class AuthCode(Base):
    __tablename__ = "auth_codes"
    
    code = Column(String(64), primary_key=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    code_challenge = Column(String(128), nullable=False)
    code_challenge_method = Column(String(10), nullable=False, default="S256")
    redirect_uri = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    
    user = relationship("User", backref="auth_codes")

# New: Long-lived refresh tokens for desktop apps
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(128), unique=True, nullable=False, index=True)
    client_name = Column(String, nullable=True, default="desktop")
    created_at = Column(DateTime, server_default=func.now())
    last_used_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    expires_at = Column(DateTime, nullable=True)  # NULL = legacy tokens; new tokens get 30-day expiry
    revoked = Column(Boolean, default=False, nullable=False)
    
    user = relationship("User", backref="refresh_tokens")

class AppSettings(Base):
    """Key-value store for application-level settings (e.g. LLM config)."""
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


project_members = Table(
    'project_members',
    Base.metadata,
    Column('user_id', String(16), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('project_id', String(16), ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True),
    Column('role', SQLEnum(ProjectRole, name="project_role_enum", values_callable=enum_values, native_enum=False), 
           nullable=False, server_default=text("'member'")),
    Column('joined_at', DateTime, server_default=func.now()),
    Column('invited_by', String(16), ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    UniqueConstraint('user_id', 'project_id', name='_project_member_unique'),
)


class ResourceShare(Base):
    __tablename__ = "resource_shares"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    resource_type = Column(String(20), nullable=False)  # "workflow" or "document"
    resource_id = Column(String(16), nullable=False)
    shared_with_email = Column(String(255), nullable=False)
    shared_with_user_id = Column(String(16), ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    permission = Column(String(10), nullable=False, default="view")  # "view" or "edit"
    shared_by = Column(String(16), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    shared_by_user = relationship("User", foreign_keys=[shared_by], backref="shared_resources")
    shared_with_user = relationship("User", foreign_keys=[shared_with_user_id], backref="received_shares")

    __table_args__ = (
        UniqueConstraint('resource_type', 'resource_id', 'shared_with_email', name='_resource_share_unique'),
    )


class Embedding(Base):
    """Vector embeddings for semantic search (RAG)."""
    __tablename__ = "embeddings"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    source_type = Column(String(20), nullable=False, index=True)  # workflow | step | document | document_chunk
    source_id = Column(String(64), nullable=False, index=True)
    content_hash = Column(String(64), nullable=False)  # SHA-256 to skip re-embedding
    embedding = Column(Vector(1536), nullable=False) if Vector else Column(Text, nullable=False)
    metadata_ = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint('source_type', 'source_id', name='_embedding_source_unique'),
    )


class LLMUsage(Base):
    __tablename__ = "llm_usage"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    model = Column(String(100), nullable=True)
    provider = Column(String(50), nullable=True)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0)
    estimated_cost_usd = Column(Float, nullable=True)
    endpoint = Column(String(50), nullable=True)  # chat, inline, annotation, guide
    created_at = Column(DateTime, server_default=func.now(), index=True)


class GitSyncConfig(Base):
    __tablename__ = "git_sync_configs"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True)
    provider = Column(String(20), nullable=False)  # github, gitlab, bitbucket
    repo_url = Column(String(500), nullable=False)
    branch = Column(String(100), nullable=False, default="main")
    directory = Column(String(500), nullable=False, default="/")
    access_token = Column(String(500), nullable=False)  # encrypted via crypto.encrypt
    last_sync_at = Column(DateTime, nullable=True)
    last_sync_status = Column(String(20), nullable=True)  # success, error, in_progress
    last_sync_error = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", backref="git_sync_config")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    resource_type = Column(String(20), nullable=False)  # 'document' or 'workflow'
    resource_id = Column(String(16), nullable=False)
    parent_id = Column(String(16), ForeignKey("comments.id", ondelete="SET NULL"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    resolved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project", backref="comments")
    user = relationship("User", foreign_keys=[user_id], backref="comments")
    parent = relationship("Comment", remote_side=[id], backref=backref("replies", cascade="all, delete-orphan"))

    __table_args__ = (
        Index('ix_comments_resource', 'resource_type', 'resource_id'),
    )


class ContextLink(Base):
    """Links a URL pattern or app name to a workflow or document."""
    __tablename__ = "context_links"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # What to match
    match_type = Column(String(20), nullable=False)  # 'url_pattern', 'url_exact', 'url_regex', 'app_name', 'app_exact', 'app_regex', 'window_title', 'window_regex'
    match_value = Column(String(500), nullable=False)

    # What to surface
    resource_type = Column(String(20), nullable=False)  # 'workflow', 'document'
    resource_id = Column(String(16), nullable=False)

    # User-added context
    note = Column(Text, nullable=True)

    # ── Scoring fields ────────────────────────────────────────────────────
    # source: who created this link.
    #   "user" = explicitly added by a human (base_weight default 1000)
    #   "auto" = derived automatically from recording URL / document URL (base_weight default 100)
    #   Auto links are always ranked below user links unless click signals override.
    source = Column(String(10), nullable=False, server_default="user")

    # weight: base score used by BaseWeightScorer.
    #   User-defined:  1000.0  (set at creation; editable)
    #   Auto-added:     100.0  (fixed; not user-editable)
    weight = Column(Float, nullable=False, server_default="1000.0")

    # click_count: incremented each time the user clicks this link in context.
    # Used by ClickCountScorer to boost frequently-chosen resources.
    click_count = Column(Integer, nullable=False, server_default="0", default=0)

    # priority kept for backward-compat with AND/OR group logic (not scoring)
    priority = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project", backref="context_links")
    creator = relationship("User", backref="context_links")

    __table_args__ = (
        Index('idx_context_links_match', 'project_id', 'match_type', 'match_value'),
        UniqueConstraint('project_id', 'match_type', 'match_value', 'resource_id',
                         name='uq_context_link_dedup'),
    )


class SsoConfig(Base):
    """Enterprise SSO (OIDC) configuration per email domain."""
    __tablename__ = "sso_configs"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    domain = Column(String, unique=True, nullable=False, index=True)
    provider_name = Column(String, nullable=False)
    issuer_url = Column(String, nullable=False)
    client_id = Column(String, nullable=False)
    client_secret = Column(String, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    auto_create_users = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class McpApiKey(Base):
    """API keys for MCP (Model Context Protocol) access."""
    __tablename__ = "mcp_api_keys"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    key_hash = Column(String(64), nullable=False, unique=True, index=True)  # SHA-256
    key_prefix = Column(String(12), nullable=False)  # first 8 chars for display
    created_by = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())
    last_used_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    project = relationship("Project", backref="mcp_api_keys")
    creator = relationship("User", backref="mcp_api_keys")


class SourceType(enum.Enum):
    UPLOAD = "upload"
    WEB_CLIP = "web_clip"
    SLACK = "slack"
    MEETING = "meeting"
    GIT_PR = "git_pr"

class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(SQLEnum(SourceType, name="source_type_enum", values_callable=enum_values, native_enum=False), nullable=False)
    name = Column(String(500), nullable=False)
    external_id = Column(String(512), nullable=True)
    external_url = Column(String(1024), nullable=True)
    raw_content = Column(Text, nullable=True)
    processed_content = Column(Text, nullable=True)
    file_path = Column(String(1024), nullable=True)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    metadata_ = Column("metadata", JSON, nullable=True)
    created_by = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    last_indexed_at = Column(DateTime, nullable=True)

    project = relationship("Project", backref="knowledge_sources")
    creator = relationship("User", backref="knowledge_sources")


class ContentTranslation(Base):
    """Cache for LLM-translated content."""
    __tablename__ = "content_translations"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    content_hash = Column(String(64), nullable=False)
    source_text = Column(Text, nullable=False)
    target_language = Column(String(10), nullable=False)
    translated_text = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('content_hash', 'target_language', name='uq_content_hash_target_lang'),
        Index('ix_content_translations_hash_lang', 'content_hash', 'target_language'),
    )


class AuditAction(enum.Enum):
    VIEW = "view"
    CREATE = "create"
    EDIT = "edit"
    DELETE = "delete"
    SHARE = "share"
    EXPORT = "export"
    LOGIN = "login"
    MCP_ACCESS = "mcp_access"
    RAG_QUERY = "rag_query"
    UPLOAD = "upload"


class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    api_key_id = Column(String(16), nullable=True, index=True)
    action = Column(SQLEnum(AuditAction, name="audit_action_enum", values_callable=enum_values, native_enum=False), nullable=False, index=True)
    resource_type = Column(String(30), nullable=True)
    resource_id = Column(String(64), nullable=True)
    resource_name = Column(String(500), nullable=True)
    detail = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    project = relationship("Project", backref="audit_logs")
    user = relationship("User", backref="audit_logs")


# ── Staleness Detection Models ───────────────────────────────────────────────

class WorkflowStepCheck(Base):
    """Per-step verification results from any trigger (replay, scheduled, manual)."""
    __tablename__ = "workflow_step_checks"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    workflow_id = Column(String(16), ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False)
    step_number = Column(Integer, nullable=False)

    # Source of this check
    check_source = Column(String(20), nullable=False)  # guide_replay | scheduled | manual | age_decay

    # Element finder result
    element_found = Column(Boolean, nullable=True)
    finder_method = Column(String(20), nullable=True)  # selector | testid | role+text | tag+text | xpath | parent-context
    finder_confidence = Column(Float, nullable=True)

    # URL check
    expected_url = Column(String, nullable=True)
    actual_url = Column(String, nullable=True)
    url_matched = Column(Boolean, nullable=True)

    # Step status
    status = Column(String(20), nullable=False)  # passed | failed | needs_auth | url_error | skipped

    # LLM verification (nullable)
    llm_visible = Column(Boolean, nullable=True)
    llm_explanation = Column(Text, nullable=True)

    # Who/when
    checked_by = Column(String(16), nullable=True)  # user_id for replay, NULL for scheduled
    checked_at = Column(DateTime, server_default=func.now(), nullable=False)

    workflow = relationship("ProcessRecordingSession", backref="step_checks")

    __table_args__ = (
        Index("ix_step_check_workflow", "workflow_id", "step_number"),
        Index("ix_step_check_time", "checked_at"),
        Index("ix_step_check_source", "check_source", "checked_at"),
    )


class StepReliability(Base):
    """Per-step reliability tracking (materialized, updated after each check)."""
    __tablename__ = "step_reliability"

    workflow_id = Column(String(16), ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), primary_key=True)
    step_number = Column(Integer, primary_key=True)

    total_checks = Column(Integer, nullable=False, default=0)
    found_count = Column(Integer, nullable=False, default=0)
    reliability = Column(Float, nullable=False, default=0.0)
    is_reliable = Column(Boolean, nullable=False, default=False)

    # Recent window (last 5 checks)
    recent_checks = Column(Integer, nullable=False, default=0)
    recent_found = Column(Integer, nullable=False, default=0)

    last_found_at = Column(DateTime, nullable=True)
    last_checked_at = Column(DateTime, nullable=True)
    last_method = Column(String(20), nullable=True)

    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    workflow = relationship("ProcessRecordingSession", backref="step_reliabilities")


class VerificationConfig(Base):
    """Project-level verification configuration (auth, schedule, options)."""
    __tablename__ = "verification_configs"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True)

    enabled = Column(Boolean, nullable=False, default=False)

    # Auth (one login per project)
    login_url = Column(String, nullable=True)
    encrypted_email = Column(Text, nullable=True)
    encrypted_password = Column(Text, nullable=True)
    email_selector = Column(String, nullable=True)
    password_selector = Column(String, nullable=True)
    submit_selector = Column(String, nullable=True)
    post_login_wait_ms = Column(Integer, default=2000)

    # Schedule
    schedule = Column(String(10), default="weekly")  # daily | weekly | monthly | manual
    schedule_day = Column(Integer, default=0)
    schedule_hour = Column(Integer, default=3)
    schedule_scope = Column(String(10), default="all")  # all | stale | selected

    # LLM
    llm_enabled = Column(Boolean, nullable=False, default=False)

    # Notifications
    notify_email = Column(Boolean, nullable=False, default=True)
    notify_in_app = Column(Boolean, nullable=False, default=True)

    # Run tracking
    last_run_at = Column(DateTime, nullable=True)
    last_run_status = Column(String(10), nullable=True)
    last_run_stats = Column(JSON, nullable=True)
    next_run_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", backref="verification_config")


class VerificationJob(Base):
    """Job queue for manual and scheduled verification runs."""
    __tablename__ = "verification_jobs"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)

    workflow_ids = Column(JSON, nullable=False)  # ["abc", "def"] or ["*"]
    trigger = Column(String(10), nullable=False)  # scheduled | manual
    triggered_by = Column(String(16), nullable=True)

    status = Column(String(12), nullable=False, default="queued")  # queued | running | completed | failed | cancelled
    progress = Column(JSON, nullable=True)
    results = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)

    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    project = relationship("Project", backref="verification_jobs")

    __table_args__ = (
        Index("ix_job_project", "project_id", "status"),
        Index("ix_job_created", "created_at"),
    )


class StalenessAlert(Base):
    """Actionable alerts when reliable steps start failing."""
    __tablename__ = "staleness_alerts"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    workflow_id = Column(String(16), ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False)

    alert_type = Column(String(20), nullable=False)  # element_missing | url_changed | age_decay | auth_failed
    severity = Column(String(10), nullable=False)  # warning | critical
    title = Column(String(255), nullable=False)
    details = Column(JSON, nullable=True)

    resolved = Column(Boolean, default=False)
    resolved_by = Column(String(16), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    dismissed = Column(Boolean, default=False)

    created_at = Column(DateTime, server_default=func.now())

    project = relationship("Project", backref="staleness_alerts")
    workflow = relationship("ProcessRecordingSession", backref="staleness_alerts")

    __table_args__ = (
        Index("ix_alert_project", "project_id", "resolved", "dismissed"),
        Index("ix_alert_workflow", "workflow_id"),
    )


# ── Datatable Models (ported from SnapRow) ─────────────────────────────────

class TableMeta(Base):
    __tablename__ = "table_meta"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    name = Column(String, index=True)
    physical_name = Column(String, unique=True)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"))
    project = relationship("Project", backref="tables")
    table_type = Column(
        SQLEnum(TableType, name="table_type_enum", values_callable=enum_values,
                validate_strings=True, create_constraint=True, native_enum=False),
        nullable=False, server_default=text("'user'"),
    )
    has_order_column = Column(Boolean, nullable=False, default=False, server_default=text("false"))


class ColumnMeta(Base):
    __tablename__ = "column_meta"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"))
    display_name = Column(String)
    name = Column(String)
    ui_type = Column(String)
    fk_type = Column(String)
    relations_table_id = Column(String(16), nullable=True, default=None)
    column_type = Column(
        SQLEnum(ColumnType, name="column_type_enum", values_callable=enum_values,
                validate_strings=True, create_constraint=True, native_enum=False),
        nullable=False, server_default=text("'physical'"),
    )
    sr__order = Column(Integer, nullable=False, default=1000, server_default=text("1000"))
    default_value = Column(JSON, nullable=True, default=None)
    settings = Column(JSON, nullable=True, default=None)
    table = relationship("TableMeta", backref="columns")


class FieldMeta(Base):
    __tablename__ = "field_meta"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"))
    row_id = Integer()
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"))
    value = Column(Text)


class RelationMeta(Base):
    __tablename__ = "relation_meta"
    id = Column(String, primary_key=True, index=True)
    left_table_id = Column(String, ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False)
    right_table_id = Column(String, ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False)
    relation_type = Column(String, nullable=False)
    fk_name = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    join_table_id = Column(String, ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=True)
    left_column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=True)
    right_column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=True)
    left_table = relationship("TableMeta", foreign_keys=[left_table_id], backref="outgoing_relations")
    right_table = relationship("TableMeta", foreign_keys=[right_table_id], backref="incoming_relations")
    join_table = relationship("TableMeta", foreign_keys=[join_table_id], backref="relation_join_table")
    left_column = relationship("ColumnMeta", foreign_keys=[left_column_id], backref="outgoing_column_relations")
    right_column = relationship("ColumnMeta", foreign_keys=[right_column_id], backref="incoming_column_relations")


class SelectOption(Base):
    __tablename__ = "select_options"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    column = relationship("ColumnMeta", backref="select_options")
    name = Column(String, nullable=False)
    color = Column(String, nullable=True)
    order = Column(Integer, default=0)


class LookUpColumn(Base):
    __tablename__ = "lookup_columns"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    relation_column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    lookup_column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)


class Formulas(Base):
    __tablename__ = "formulas"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"))
    formula = Column(Text, nullable=False)
    formula_raw = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    column = relationship("ColumnMeta", backref="formulas")


class Rollup(Base):
    __tablename__ = "rollups"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False, unique=True)
    relation_column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    rollup_column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="SET NULL"), nullable=True)
    aggregate_func = Column(String, nullable=False, server_default=text("'count'"))
    precision = Column(Integer, nullable=True)
    show_thousands_sep = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    column = relationship("ColumnMeta", backref="rollup", foreign_keys=[column_id], uselist=False)


class Filter(Base):
    __tablename__ = "filters"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    name = Column(String, nullable=False)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    operation = Column(String, nullable=False)
    value = Column(Text, nullable=True)
    is_reusable = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    table = relationship("TableMeta", backref="filters")
    user = relationship("User", backref="filters")
    column = relationship("ColumnMeta", backref="filters")
    __table_args__ = (
        UniqueConstraint('table_id', 'user_id', 'column_id', 'operation', 'value', name='_filter_unique'),
    )


class Sort(Base):
    __tablename__ = "sorts"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    direction = Column(String, nullable=False, server_default=text("'asc'"))
    priority = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    table = relationship("TableMeta", backref="sorts")
    user = relationship("User", backref="sorts")
    column = relationship("ColumnMeta", backref="sorts")
    __table_args__ = (
        UniqueConstraint('table_id', 'user_id', 'column_id', name='_sort_unique'),
    )


class ColumnVisibility(Base):
    __tablename__ = "column_visibility"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    is_visible = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    table = relationship("TableMeta", backref="column_visibility")
    user = relationship("User", backref="column_visibility")
    column = relationship("ColumnMeta", backref="column_visibility")
    __table_args__ = (
        UniqueConstraint('table_id', 'user_id', 'column_id', name='_column_visibility_unique'),
    )
