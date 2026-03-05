"""add source_file_name column

Revision ID: 025
Revises: 024
Create Date: 2026-03-05
"""
from alembic import op
import sqlalchemy as sa

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("documents", sa.Column("source_file_name", sa.String(), nullable=True))


def downgrade():
    op.drop_column("documents", "source_file_name")
