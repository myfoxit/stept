"""add workflow version history

Revision ID: 037
Revises: 036
"""
from alembic import op
import sqlalchemy as sa

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade():
    # Add version column to process_recording_sessions
    op.add_column(
        "process_recording_sessions",
        sa.Column("version", sa.Integer, server_default="1", nullable=False),
    )

    # Create workflow_versions table
    op.create_table(
        "workflow_versions",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(16),
            sa.ForeignKey("process_recording_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("steps_snapshot", sa.JSON, nullable=False),
        sa.Column("name", sa.String, nullable=True),
        sa.Column("total_steps", sa.Integer, nullable=True),
        sa.Column(
            "created_by",
            sa.String(16),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.func.now(),
        ),
        sa.Column("change_summary", sa.String, nullable=True),
    )
    op.create_index("ix_workflow_versions_session_id", "workflow_versions", ["session_id"])
    op.create_index("ix_workflow_versions_created_by", "workflow_versions", ["created_by"])
    op.create_index(
        "ix_workflow_versions_session_version",
        "workflow_versions",
        ["session_id", sa.text("version_number DESC")],
    )


def downgrade():
    op.drop_index("ix_workflow_versions_session_version", table_name="workflow_versions")
    op.drop_index("ix_workflow_versions_created_by", table_name="workflow_versions")
    op.drop_index("ix_workflow_versions_session_id", table_name="workflow_versions")
    op.drop_table("workflow_versions")
    op.drop_column("process_recording_sessions", "version")
