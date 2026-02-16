"""Add document locking fields

Revision ID: 014
Revises: 013
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    # locked_by and locked_at already added in migration 013
    pass


def downgrade():
    pass
