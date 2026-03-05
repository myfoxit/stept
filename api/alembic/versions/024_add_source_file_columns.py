"""Add source_file columns to documents

Revision ID: 024
Revises: 023
"""
from alembic import op
import sqlalchemy as sa

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("source_file_path", sa.String(), nullable=True))
    op.add_column("documents", sa.Column("source_file_mime", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "source_file_mime")
    op.drop_column("documents", "source_file_path")
