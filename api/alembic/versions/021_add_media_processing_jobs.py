"""Add media_processing_jobs table for queued async media work

Revision ID: 021
Revises: 020
"""
from alembic import op
import sqlalchemy as sa


revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "media_processing_jobs",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("session_id", sa.String(length=16), nullable=False),
        sa.Column("job_type", sa.String(length=32), nullable=False, server_default="video_import"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stage", sa.String(length=64), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("task_id", sa.String(length=64), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["process_recording_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "job_type", name="_media_job_session_type_unique"),
        sa.UniqueConstraint("task_id"),
    )
    op.create_index("ix_media_processing_jobs_session_id", "media_processing_jobs", ["session_id"])
    op.create_index("ix_media_processing_jobs_status", "media_processing_jobs", ["status"])
    op.create_index("ix_media_processing_jobs_task_id", "media_processing_jobs", ["task_id"])


def downgrade():
    op.drop_index("ix_media_processing_jobs_task_id", table_name="media_processing_jobs")
    op.drop_index("ix_media_processing_jobs_status", table_name="media_processing_jobs")
    op.drop_index("ix_media_processing_jobs_session_id", table_name="media_processing_jobs")
    op.drop_table("media_processing_jobs")
