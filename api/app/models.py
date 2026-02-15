from typing import Any

from sqlalchemy import (
    Column, Integer, String, ForeignKey, Text, text, JSON, DateTime, func, Boolean, UniqueConstraint, Index, Float
)
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
    name = Column(String, unique=True, index=True)
    email            = Column(String, unique=True, index=True, nullable=False)
    # New: normalized email for case/space-insensitive identity
    normalized_email = Column(String, unique=True, index=True, nullable=True)
    hashed_password  = Column(String, nullable=False)
    is_verified      = Column(Boolean, default=False)
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
    name = Column(String(16), index=True)
    # Keep owner_id for backward compatibility and to identify the project creator
    owner_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Deprecated: use owner relationship instead
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
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
    page_layout = Column(String(20), nullable=False, server_default="'full'")
    
    # Link document to a project
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Link to folder (optional - documents can exist at root)
    folder_id = Column(String(16), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True)
    # NEW: ordering within a folder (or root if folder_id is NULL)
    position   = Column(Integer, nullable=False, default=0, index=True)
    
    # NEW: Privacy settings
    is_private = Column(Boolean, nullable=False, default=False, index=True)  # True = only owner can see
    owner_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)  # Owner for private documents
    
    # Public sharing fields
    share_token = Column(String(64), nullable=True, unique=True, index=True)
    is_public = Column(Boolean, nullable=False, default=False)
    
    # Relationships
    project = relationship("Project", backref="documents")
    folder = relationship("Folder", back_populates="documents")
    owner = relationship("User", foreign_keys=[owner_id], backref="private_documents")

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

# Updated: Process Recording Models
class ProcessRecordingSession(Base):
    __tablename__ = "process_recording_sessions"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    client_name = Column(String, nullable=False, default="ProcessRecorder")
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
    
    # Relationships
    user = relationship("User", back_populates="recording_sessions", foreign_keys=[user_id])
    files = relationship("ProcessRecordingFile", back_populates="session", cascade="all, delete-orphan")
    steps = relationship("ProcessRecordingStep", back_populates="session", cascade="all, delete-orphan", order_by="ProcessRecordingStep.step_number")
    project = relationship("Project", backref="recording_sessions")
    folder = relationship("Folder", backref="recording_sessions")
    owner = relationship("User", foreign_keys=[owner_id], backref="private_workflows")

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
    
    # AI annotation fields
    generated_title = Column(String, nullable=True)
    generated_description = Column(Text, nullable=True)
    ui_element = Column(String, nullable=True)
    step_category = Column(String, nullable=True)  # navigation, data_entry, confirmation, etc.
    is_annotated = Column(Boolean, nullable=False, default=False)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
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
    shared_with_user_id = Column(String(16), ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    permission = Column(String(10), nullable=False, default="view")  # "view" or "edit"
    shared_by = Column(String(16), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
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
    source_type = Column(String(20), nullable=False, index=True)  # workflow | step | document
    source_id = Column(String(16), nullable=False, index=True)
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
