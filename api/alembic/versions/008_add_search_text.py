"""add search_text tsvector columns

Revision ID: 008
Revises: 007
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade():
    # Add search_text column to documents
    op.add_column("documents", sa.Column("search_text", sa.String, nullable=True))
    
    # Add tsvector column for full-text search
    op.execute("ALTER TABLE documents ADD COLUMN search_tsv tsvector")
    
    # Create GIN index for fast full-text search
    op.execute("CREATE INDEX idx_documents_search_tsv ON documents USING GIN (search_tsv)")
    
    # Add tsvector to process_recording_sessions too
    op.execute("ALTER TABLE process_recording_sessions ADD COLUMN search_tsv tsvector")
    op.execute("CREATE INDEX idx_workflows_search_tsv ON process_recording_sessions USING GIN (search_tsv)")


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_workflows_search_tsv")
    op.execute("ALTER TABLE process_recording_sessions DROP COLUMN IF EXISTS search_tsv")
    op.execute("DROP INDEX IF EXISTS idx_documents_search_tsv")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS search_tsv")
    op.drop_column("documents", "search_text")
