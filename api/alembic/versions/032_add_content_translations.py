"""Add content_translations table for caching AI translations.

Revision ID: 032
Revises: 031
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_translations",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("target_language", sa.String(10), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index(
        "ix_content_translations_lookup",
        "content_translations",
        ["content_hash", "target_language"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_content_translations_lookup", table_name="content_translations")
    op.drop_table("content_translations")
