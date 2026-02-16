"""Add knowledge_sources table

Revision ID: 016
Revises: 015
"""
from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "knowledge_sources",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("external_id", sa.String(512), nullable=True),
        sa.Column("external_url", sa.String(1024), nullable=True),
        sa.Column("raw_content", sa.Text, nullable=True),
        sa.Column("processed_content", sa.Text, nullable=True),
        sa.Column("file_path", sa.String(1024), nullable=True),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("metadata", sa.JSON, nullable=True),
        sa.Column("created_by", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("last_indexed_at", sa.DateTime, nullable=True),
    )


def downgrade():
    op.drop_table("knowledge_sources")
