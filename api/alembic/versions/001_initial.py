"""Initial migration — create all tables from scratch.

Revision ID: 001
Revises: (none)
Create Date: 2025-02-11
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. users
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String, unique=True, index=True),
        sa.Column("email", sa.String, unique=True, index=True, nullable=False),
        sa.Column("normalized_email", sa.String, unique=True, index=True, nullable=True),
        sa.Column("hashed_password", sa.String, nullable=False),
        sa.Column("is_verified", sa.Boolean, default=False),
        sa.Column("verification_tok", sa.String(32), nullable=True, index=True),
        sa.Column("reset_token", sa.String(32), nullable=True, index=True),
        sa.Column("reset_expires_at", sa.DateTime, nullable=True),
    )

    # ------------------------------------------------------------------
    # 2. projects
    # ------------------------------------------------------------------
    op.create_table(
        "projects",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(16), index=True),
        sa.Column("owner_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ------------------------------------------------------------------
    # 3. project_members (association table)
    # ------------------------------------------------------------------
    op.create_table(
        "project_members",
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "role",
            sa.Enum("viewer", "member", "editor", "admin", "owner", name="project_role_enum", native_enum=False),
            nullable=False,
            server_default=sa.text("'member'"),
        ),
        sa.Column("joined_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("invited_by", sa.String(16), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("user_id", "project_id", name="_project_member_unique"),
    )

    # ------------------------------------------------------------------
    # 4. folders
    # ------------------------------------------------------------------
    op.create_table(
        "folders",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String, nullable=False, server_default="Untitled"),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("parent_id", sa.String(16), sa.ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("path", sa.String(500), nullable=False, server_default="", index=True),
        sa.Column("depth", sa.Integer, nullable=False, server_default=sa.text("0"), index=True),
        sa.Column("position", sa.Integer, nullable=False, server_default=sa.text("0"), index=True),
        sa.Column("is_expanded", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("is_private", sa.Boolean, nullable=False, server_default=sa.text("false"), index=True),
        sa.Column("owner_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ------------------------------------------------------------------
    # 5. documents
    # ------------------------------------------------------------------
    op.create_table(
        "documents",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String, nullable=True),
        sa.Column("content", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("page_layout", sa.String(20), nullable=False, server_default="'full'"),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("folder_id", sa.String(16), sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("position", sa.Integer, nullable=False, server_default=sa.text("0"), index=True),
        sa.Column("is_private", sa.Boolean, nullable=False, server_default=sa.text("false"), index=True),
        sa.Column("owner_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
    )

    # ------------------------------------------------------------------
    # 6. text_container
    # ------------------------------------------------------------------
    op.create_table(
        "text_container",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String, nullable=True),
        sa.Column("content", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ------------------------------------------------------------------
    # 7. sessions (auth sessions)
    # ------------------------------------------------------------------
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False),
        sa.Column("token_hash", sa.String(128), unique=True, nullable=False, index=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("revoked", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("user_agent", sa.String, nullable=True),
        sa.Column("ip_address", sa.String, nullable=True),
    )

    # ------------------------------------------------------------------
    # 8. process_recording_sessions
    # ------------------------------------------------------------------
    op.create_table(
        "process_recording_sessions",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("client_name", sa.String, nullable=False, server_default="ProcessRecorder"),
        sa.Column("status", sa.String, nullable=False, server_default="uploading"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("finalized_at", sa.DateTime, nullable=True),
        sa.Column("total_steps", sa.Integer, nullable=True),
        sa.Column("total_files", sa.Integer, nullable=True),
        sa.Column("storage_type", sa.String, nullable=False, server_default="local"),
        sa.Column("storage_path", sa.String, nullable=True),
        sa.Column("name", sa.String, nullable=True, server_default="Untitled Workflow"),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("folder_id", sa.String(16), sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("position", sa.Integer, nullable=False, server_default=sa.text("0"), index=True),
        sa.Column("is_expanded", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("icon_type", sa.String(20), nullable=True, server_default="tabler"),
        sa.Column("icon_value", sa.String(255), nullable=True),
        sa.Column("icon_color", sa.String(7), nullable=True, server_default="#6366f1"),
        sa.Column("is_private", sa.Boolean, nullable=False, server_default=sa.text("false"), index=True),
        sa.Column("owner_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        # AI auto-processing fields
        sa.Column("generated_title", sa.String, nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("tags", sa.JSON, nullable=True),
        sa.Column("estimated_time", sa.String, nullable=True),
        sa.Column("difficulty", sa.String, nullable=True),
        sa.Column("is_processed", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("guide_markdown", sa.Text, nullable=True),
    )

    # ------------------------------------------------------------------
    # 9. process_recording_steps
    # ------------------------------------------------------------------
    op.create_table(
        "process_recording_steps",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("session_id", sa.String(16), sa.ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("step_number", sa.Integer, nullable=False),
        sa.Column("step_type", sa.String, nullable=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("action_type", sa.String, nullable=True),
        sa.Column("window_title", sa.String, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("global_position", sa.JSON, nullable=True),
        sa.Column("relative_position", sa.JSON, nullable=True),
        sa.Column("window_size", sa.JSON, nullable=True),
        sa.Column("screenshot_size", sa.JSON, nullable=True),
        sa.Column("screenshot_relative_position", sa.JSON, nullable=True),
        sa.Column("key_pressed", sa.String, nullable=True),
        sa.Column("text_typed", sa.Text, nullable=True),
        sa.Column("scroll_delta", sa.Integer, nullable=True),
        # AI annotation fields
        sa.Column("generated_title", sa.String, nullable=True),
        sa.Column("generated_description", sa.Text, nullable=True),
        sa.Column("ui_element", sa.String, nullable=True),
        sa.Column("step_category", sa.String, nullable=True),
        sa.Column("is_annotated", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "step_number", name="_session_step_number_unique"),
    )

    # ------------------------------------------------------------------
    # 10. process_recording_files
    # ------------------------------------------------------------------
    op.create_table(
        "process_recording_files",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("session_id", sa.String(16), sa.ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("step_number", sa.Integer, nullable=False),
        sa.Column("filename", sa.String, nullable=False),
        sa.Column("file_path", sa.String, nullable=False),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column("mime_type", sa.String, nullable=True, server_default="image/png"),
        sa.Column("uploaded_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "step_number", name="_session_step_unique"),
    )

    # ------------------------------------------------------------------
    # 11. auth_codes (PKCE)
    # ------------------------------------------------------------------
    op.create_table(
        "auth_codes",
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("code_challenge", sa.String(128), nullable=False),
        sa.Column("code_challenge_method", sa.String(10), nullable=False, server_default="S256"),
        sa.Column("redirect_uri", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime, nullable=False),
    )

    # ------------------------------------------------------------------
    # 12. refresh_tokens
    # ------------------------------------------------------------------
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(128), unique=True, nullable=False, index=True),
        sa.Column("client_name", sa.String, nullable=True, server_default="desktop"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("revoked", sa.Boolean, server_default=sa.text("false"), nullable=False),
    )

    # ------------------------------------------------------------------
    # 13. app_settings (key-value)
    # ------------------------------------------------------------------
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String, primary_key=True),
        sa.Column("value", sa.JSON, nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_table("app_settings")
    op.drop_table("refresh_tokens")
    op.drop_table("auth_codes")
    op.drop_table("process_recording_files")
    op.drop_table("process_recording_steps")
    op.drop_table("process_recording_sessions")
    op.drop_table("sessions")
    op.drop_table("text_container")
    op.drop_table("documents")
    op.drop_table("folders")
    op.drop_table("project_members")
    op.drop_table("projects")
    op.drop_table("users")
