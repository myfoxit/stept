"""Add video import fields and media_processing_jobs table

Revision ID: 036
Revises: 035
"""
from alembic import op
import sqlalchemy as sa

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade():
    # Video import columns on process_recording_sessions
    op.add_column("process_recording_sessions", sa.Column("source_type", sa.String(20), server_default="desktop"))
    op.add_column("process_recording_sessions", sa.Column("video_filename", sa.String, nullable=True))
    op.add_column("process_recording_sessions", sa.Column("video_size_bytes", sa.BigInteger, nullable=True))
    op.add_column("process_recording_sessions", sa.Column("video_duration_seconds", sa.Float, nullable=True))
    op.add_column("process_recording_sessions", sa.Column("processing_progress", sa.Integer, server_default="0"))
    op.add_column("process_recording_sessions", sa.Column("processing_stage", sa.String, nullable=True))
    op.add_column("process_recording_sessions", sa.Column("processing_error", sa.String, nullable=True))

    # Media processing jobs table
    op.create_table(
        "media_processing_jobs",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("session_id", sa.String(16), sa.ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("job_type", sa.String(32), nullable=False, server_default="video_import"),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued", index=True),
        sa.Column("progress", sa.Integer, nullable=False, server_default="0"),
        sa.Column("stage", sa.String(64), nullable=True),
        sa.Column("error", sa.String, nullable=True),
        sa.Column("task_id", sa.String(64), nullable=True, unique=True, index=True),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer, nullable=False, server_default="3"),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("finished_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "job_type", name="_media_job_session_type_unique"),
    )


def downgrade():
    op.drop_table("media_processing_jobs")
    op.drop_column("process_recording_sessions", "processing_error")
    op.drop_column("process_recording_sessions", "processing_stage")
    op.drop_column("process_recording_sessions", "processing_progress")
    op.drop_column("process_recording_sessions", "video_duration_seconds")
    op.drop_column("process_recording_sessions", "video_size_bytes")
    op.drop_column("process_recording_sessions", "video_filename")
    op.drop_column("process_recording_sessions", "source_type")
