"""Add view_count and last_viewed_at to process_recording_sessions

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
    op.add_column(
        "process_recording_sessions",
        sa.Column("view_count", sa.Integer, nullable=False, server_default="0"),
    )
    op.add_column(
        "process_recording_sessions",
        sa.Column("last_viewed_at", sa.DateTime, nullable=True),
    )


def downgrade():
    op.drop_column("process_recording_sessions", "last_viewed_at")
    op.drop_column("process_recording_sessions", "view_count")
