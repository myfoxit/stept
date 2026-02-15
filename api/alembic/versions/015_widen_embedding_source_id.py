"""Widen embeddings.source_id to VARCHAR(64) for document chunks

Revision ID: 015
Revises: 014
"""
from alembic import op
import sqlalchemy as sa

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("embeddings", "source_id",
                     type_=sa.String(64),
                     existing_type=sa.String(16),
                     existing_nullable=False)


def downgrade():
    op.alter_column("embeddings", "source_id",
                     type_=sa.String(16),
                     existing_type=sa.String(64),
                     existing_nullable=False)
