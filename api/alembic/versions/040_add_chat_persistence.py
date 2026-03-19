"""add chat persistence tables

Revision ID: 040
Revises: 039
"""
from alembic import op
import sqlalchemy as sa

revision = "040"
down_revision = "039"


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("recording_id", sa.String(16), sa.ForeignKey("process_recording_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("document_id", sa.String(16), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("latest_message_id", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])
    op.create_index("ix_chat_sessions_project_id", "chat_sessions", ["project_id"])
    op.create_index("ix_chat_sessions_recording_id", "chat_sessions", ["recording_id"])
    op.create_index("ix_chat_sessions_document_id", "chat_sessions", ["document_id"])
    op.create_index("ix_chat_sessions_latest_message_id", "chat_sessions", ["latest_message_id"])
    op.create_index("ix_chat_sessions_deleted_at", "chat_sessions", ["deleted_at"])

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("session_id", sa.String(16), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_message_id", sa.String(16), sa.ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("tool_calls", sa.JSON, nullable=True),
        sa.Column("tool_results", sa.JSON, nullable=True),
        sa.Column("meta", sa.JSON, nullable=True),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])
    op.create_index("ix_chat_messages_parent_message_id", "chat_messages", ["parent_message_id"])
    op.create_index("ix_chat_messages_role", "chat_messages", ["role"])
    op.create_index("ix_chat_messages_deleted_at", "chat_messages", ["deleted_at"])
    op.create_index("ix_chat_messages_session_position", "chat_messages", ["session_id", "position"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_session_position", table_name="chat_messages")
    op.drop_index("ix_chat_messages_deleted_at", table_name="chat_messages")
    op.drop_index("ix_chat_messages_role", table_name="chat_messages")
    op.drop_index("ix_chat_messages_parent_message_id", table_name="chat_messages")
    op.drop_index("ix_chat_messages_session_id", table_name="chat_messages")
    op.drop_table("chat_messages")

    op.drop_index("ix_chat_sessions_deleted_at", table_name="chat_sessions")
    op.drop_index("ix_chat_sessions_latest_message_id", table_name="chat_sessions")
    op.drop_index("ix_chat_sessions_document_id", table_name="chat_sessions")
    op.drop_index("ix_chat_sessions_recording_id", table_name="chat_sessions")
    op.drop_index("ix_chat_sessions_project_id", table_name="chat_sessions")
    op.drop_index("ix_chat_sessions_user_id", table_name="chat_sessions")
    op.drop_table("chat_sessions")
