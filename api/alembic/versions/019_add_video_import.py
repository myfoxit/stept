"""Add video import fields to process_recording_sessions

Revision ID: 019
Revises: 018
"""
from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("process_recording_sessions", sa.Column("source_type", sa.String(20), server_default="desktop"))
    op.add_column("process_recording_sessions", sa.Column("video_filename", sa.String(), nullable=True))
    op.add_column("process_recording_sessions", sa.Column("video_size_bytes", sa.BigInteger(), nullable=True))
    op.add_column("process_recording_sessions", sa.Column("video_duration_seconds", sa.Float(), nullable=True))
    op.add_column("process_recording_sessions", sa.Column("processing_progress", sa.Integer(), server_default="0"))
    op.add_column("process_recording_sessions", sa.Column("processing_stage", sa.String(), nullable=True))
    op.add_column("process_recording_sessions", sa.Column("processing_error", sa.String(), nullable=True))


def downgrade():
    op.drop_column("process_recording_sessions", "processing_error")
    op.drop_column("process_recording_sessions", "processing_stage")
    op.drop_column("process_recording_sessions", "processing_progress")
    op.drop_column("process_recording_sessions", "video_duration_seconds")
    op.drop_column("process_recording_sessions", "video_size_bytes")
    op.drop_column("process_recording_sessions", "video_filename")
    op.drop_column("process_recording_sessions", "source_type")
