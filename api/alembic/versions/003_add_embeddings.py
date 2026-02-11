"""Add embeddings table for RAG semantic search

Revision ID: 003
Revises: 002
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Create embeddings table
    op.execute("""
        CREATE TABLE embeddings (
            id VARCHAR(16) PRIMARY KEY,
            source_type VARCHAR(20) NOT NULL,
            source_id VARCHAR(16) NOT NULL,
            content_hash VARCHAR(64) NOT NULL,
            embedding vector(1536) NOT NULL,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT now(),
            CONSTRAINT _embedding_source_unique UNIQUE (source_type, source_id)
        )
    """)

    # Create indexes
    op.execute("CREATE INDEX ix_embeddings_source_type ON embeddings (source_type)")
    op.execute("CREATE INDEX ix_embeddings_source_id ON embeddings (source_id)")

    # IVFFlat index for cosine similarity search
    # Note: IVFFlat requires data to exist for optimal list count.
    # With few rows the index still works but is less efficient.
    op.execute("""
        CREATE INDEX ix_embeddings_cosine ON embeddings 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_embeddings_cosine")
    op.execute("DROP INDEX IF EXISTS ix_embeddings_source_id")
    op.execute("DROP INDEX IF EXISTS ix_embeddings_source_type")
    op.execute("DROP TABLE IF EXISTS embeddings")
