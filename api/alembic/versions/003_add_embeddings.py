"""Add embeddings table for RAG semantic search

Revision ID: 003
Revises: 002
Create Date: 2026-02-11

NOTE: On fresh installs, 001 may already have created the embeddings table
(without the vector column). This migration is idempotent.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)

    # Try to enable pgvector extension (non-fatal if not available)
    try:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    except Exception:
        pass

    if "embeddings" not in insp.get_table_names():
        # Check if pgvector is available for the vector column type
        try:
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
        except Exception:
            # pgvector not available — create with TEXT fallback
            op.execute("""
                CREATE TABLE embeddings (
                    id VARCHAR(16) PRIMARY KEY,
                    source_type VARCHAR(20) NOT NULL,
                    source_id VARCHAR(16) NOT NULL,
                    content_hash VARCHAR(64) NOT NULL,
                    embedding TEXT,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT now(),
                    CONSTRAINT _embedding_source_unique UNIQUE (source_type, source_id)
                )
            """)

        # Create indexes
        op.execute("CREATE INDEX IF NOT EXISTS ix_embeddings_source_type ON embeddings (source_type)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_embeddings_source_id ON embeddings (source_id)")

        # IVFFlat index only if pgvector is available
        try:
            op.execute("""
                CREATE INDEX ix_embeddings_cosine ON embeddings 
                USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100)
            """)
        except Exception:
            pass  # pgvector not available


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_embeddings_cosine")
    op.execute("DROP INDEX IF EXISTS ix_embeddings_source_id")
    op.execute("DROP INDEX IF EXISTS ix_embeddings_source_type")
    op.execute("DROP TABLE IF EXISTS embeddings")
