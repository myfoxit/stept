"""Widen project.name from String(16) to String(255)

Revision ID: 022
Revises: 021
"""
from alembic import op
import sqlalchemy as sa


revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "projects",
        "name",
        existing_type=sa.String(length=16),
        type_=sa.String(length=255),
        existing_nullable=True,
    )


def downgrade():
    op.alter_column(
        "projects",
        "name",
        existing_type=sa.String(length=255),
        type_=sa.String(length=16),
        existing_nullable=True,
    )
