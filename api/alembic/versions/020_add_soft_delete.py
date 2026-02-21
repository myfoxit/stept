"""Add soft delete (deleted_at) to documents and process_recording_sessions

Revision ID: 020
Revises: 019
"""
from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("documents", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_documents_deleted_at", "documents", ["deleted_at"])
    
    op.add_column("process_recording_sessions", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_process_recording_sessions_deleted_at", "process_recording_sessions", ["deleted_at"])


def downgrade():
    op.drop_index("ix_process_recording_sessions_deleted_at", "process_recording_sessions")
    op.drop_column("process_recording_sessions", "deleted_at")
    
    op.drop_index("ix_documents_deleted_at", "documents")
    op.drop_column("documents", "deleted_at")
