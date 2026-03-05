"""Widen project.name from String(16) to String(255)

Revision ID: 019
Revises: 018
"""
from alembic import op
import sqlalchemy as sa


revision = "019"
down_revision = "018"
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
