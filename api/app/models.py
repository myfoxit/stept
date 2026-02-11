from typing import Any

from sqlalchemy import (
    Column, Integer, String, ForeignKey, Text, text, JSON, DateTime, func, Boolean, UniqueConstraint
)
from sqlalchemy.orm import relationship, backref
from .database import Base
from app.utils import gen_suffix
import enum
import secrets  # fix: missing import used by PublicAccessToken
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import Table  # new

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

class ColumnType(enum.Enum):
    PHYSICAL = "physical"
    VIRTUAL  = "virtual"

class TableType(enum.Enum):
    USER  = "user"
    JOIN  = "join"
    OTHER = "other"

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


class TableMeta(Base):
    __tablename__ = "table_meta"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    name = Column(String, index=True)
    physical_name = Column(String, unique=True)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"))
    project = relationship("Project", backref="tables")
    table_type = Column(
        SQLEnum(
            TableType,
            name="table_type_enum",
            values_callable=enum_values,
            validate_strings=True,
            create_constraint=True,
            native_enum=False,
        ),
        nullable=False,
        server_default=text("'user'")
    )
    # NEW: Track if order column has been added (for migration)
    has_order_column = Column(Boolean, nullable=False, default=False, server_default=text("false"))


class ColumnMeta(Base):
    __tablename__ = "column_meta"
    id = Column(String(16), primary_key=True, default=gen_suffix)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"))
    display_name=Column(String)
    name = Column(String)
    ui_type = Column(String)
    fk_type = Column(String)
    relations_table_id = Column(
        String(16),
        nullable=True,
        default=None
    )
    column_type = Column(
        SQLEnum(
            ColumnType,
            name="column_type_enum",
            values_callable=enum_values,
            validate_strings=True,
            create_constraint=True,
            native_enum=False,
        ),
        nullable=False,
        server_default=text("'physical'"),
    )
    # Simple INTEGER ordering with rebalancing when needed
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
    left_table_id = Column(String, ForeignKey(TableMeta.id, ondelete="CASCADE"), nullable=False)
    right_table_id = Column(String, ForeignKey(TableMeta.id, ondelete="CASCADE"), nullable=False)
    relation_type = Column(String, nullable=False)  # one_to_one, many_to_one, many_to_many
    fk_name = Column(String, nullable=True)  # For one_to_one and many_to_one
    display_name = Column(String, nullable=True)
    join_table_id = Column(String, ForeignKey(TableMeta.id, ondelete="CASCADE"), nullable=True)
    left_column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=True)
    right_column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=True)

    left_table = relationship(
        TableMeta,
        foreign_keys=[left_table_id],
        backref="outgoing_relations",
    )
    right_table = relationship(
        TableMeta,
        foreign_keys=[right_table_id],
        backref="incoming_relations",
    )
    join_table = relationship(
        TableMeta,
        foreign_keys=[join_table_id],
        backref="relation_join_table",
    )
    left_column = relationship(
        "ColumnMeta",
        foreign_keys=[left_column_id],
        backref="outgoing_column_relations",
    )
    right_column = relationship(
        "ColumnMeta",
        foreign_keys=[right_column_id],
        backref="incoming_column_relations",
    )


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
    
    # Direct link to a single table and row
    linked_table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="SET NULL"), nullable=True, index=True)
    linked_row_id = Column(Integer, nullable=True, index=True)
    
    # NEW: Privacy settings
    is_private = Column(Boolean, nullable=False, default=False, index=True)  # True = only owner can see
    owner_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)  # Owner for private documents
    
    # Relationships
    project = relationship("Project", backref="documents")
    folder = relationship("Folder", back_populates="documents")
    linked_table = relationship("TableMeta", backref="linked_documents")
    owner = relationship("User", foreign_keys=[owner_id], backref="private_documents")

class TextContainer(Base):
    __tablename__ = "text_container"

    id          = Column(String(16), primary_key=True, default=gen_suffix)
    name        = Column(String, nullable=True)
    content     = Column(JSON, nullable=False, server_default="{}")  
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())

class Formulas(Base):
    __tablename__ = "formulas"

    id          = Column(String(16), primary_key=True, default=gen_suffix)
    column_id   = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"))
    formula     = Column(Text, nullable=False)
    formula_raw = Column(Text, nullable=False)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())
    column = relationship("ColumnMeta", backref="formulas")

# New: Rollups configuration (virtual column config; aggregation is computed in frontend)
class Rollup(Base):
    __tablename__ = "rollups"

    id                   = Column(String(16), primary_key=True, default=gen_suffix)
    column_id            = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False, unique=True)
    # Which relation field on the same table to traverse
    relation_column_id   = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    # Which field on the related table to aggregate (nullable for Count)
    rollup_column_id     = Column(String(16), ForeignKey("column_meta.id", ondelete="SET NULL"), nullable=True)
    # Aggregate function: 'count', 'sum', 'avg', 'min', 'max' (frontend computes)
    aggregate_func       = Column(String, nullable=False, server_default=text("'count'"))
    # Optional formatting
    precision            = Column(Integer, nullable=True)
    show_thousands_sep   = Column(Boolean, nullable=False, server_default=text("false"))
    created_at           = Column(DateTime, server_default=func.now())
    updated_at           = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # One rollup per virtual column
    column               = relationship("ColumnMeta", backref="rollup", foreign_keys=[column_id], uselist=False)

# New: Filter model for table filtering
class Filter(Base):
    __tablename__ = "filters"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    name = Column(String, nullable=False)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    operation = Column(String, nullable=False)  # equals, contains, not_contains, gt, lt, gte, lte, is_empty, is_not_empty
    value = Column(Text, nullable=True)  # JSON string for complex values
    is_reusable = Column(Boolean, default=False, nullable=False)  # Can be used on other tables
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    table = relationship("TableMeta", backref="filters")
    user = relationship("User", backref="filters")
    column = relationship("ColumnMeta", backref="filters")
    
    # Unique constraint to prevent duplicate filters
    __table_args__ = (
        UniqueConstraint('table_id', 'user_id', 'column_id', 'operation', 'value', name='_filter_unique'),
    )

# New: Sort model for table sorting
class Sort(Base):
    __tablename__ = "sorts"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    direction = Column(String, nullable=False, server_default=text("'asc'"))  # 'asc' or 'desc'
    priority = Column(Integer, nullable=False, default=0)  # Sort order priority (0 = highest)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    table = relationship("TableMeta", backref="sorts")
    user = relationship("User", backref="sorts")
    column = relationship("ColumnMeta", backref="sorts")
    
    # Unique constraint to prevent duplicate sorts on same column
    __table_args__ = (
        UniqueConstraint('table_id', 'user_id', 'column_id', name='_sort_unique'),
    )

# New: Column visibility preferences for users
class ColumnVisibility(Base):
    __tablename__ = "column_visibility"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    column_id = Column(String(16), ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False)
    is_visible = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    table = relationship("TableMeta", backref="column_visibility")
    user = relationship("User", backref="column_visibility")
    column = relationship("ColumnMeta", backref="column_visibility")
    
    # Unique constraint to prevent duplicate visibility settings
    __table_args__ = (
        UniqueConstraint('table_id', 'user_id', 'column_id', name='_column_visibility_unique'),
    )

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

class Dashboard(Base):
    __tablename__ = "dashboards"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    name = Column(String, nullable=False)
    project_id = Column(String(16), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(16), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    layout = Column(JSON, nullable=False, default=list)  # Grid layout configuration
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", backref="dashboards")
    user = relationship("User", backref="dashboards")
    widgets = relationship("DashboardWidget", back_populates="dashboard", cascade="all, delete-orphan")

class DashboardWidget(Base):
    __tablename__ = "dashboard_widgets"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    dashboard_id = Column(String(16), ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    chart_type = Column(String, nullable=False)  # bar, line, pie, area, etc.
    table_id = Column(String(16), ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False)
    
    # Chart configuration
    x_axis_column = Column(String, nullable=True)  # Column name for x-axis
    y_axis_column = Column(String, nullable=True)  # Column name for y-axis
    group_by_column = Column(String, nullable=True)  # Column for grouping/categorizing
    aggregation = Column(String, nullable=True, default="count")  # count, sum, avg, min, max
    filters = Column(JSON, nullable=True, default=list)  # Applied filters
    
    # Widget position and size in grid
    x = Column(Integer, nullable=False, default=0)
    y = Column(Integer, nullable=False, default=0)
    w = Column(Integer, nullable=False, default=6)  # Width in grid units
    h = Column(Integer, nullable=False, default=4)  # Height in grid units
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    dashboard = relationship("Dashboard", back_populates="widgets")
    table = relationship("TableMeta", backref="widget_references")
    y = Column(Integer, nullable=False, default=0)
    w = Column(Integer, nullable=False, default=6)  # Width in grid units
    h = Column(Integer, nullable=False, default=4)  # Height in grid units
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    dashboard = relationship("Dashboard", back_populates="widgets")
    table = relationship("TableMeta", backref="widget_references")


