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
    op.add_column("documents", sa.Column("locked_by", sa.String(16), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("documents", sa.Column("locked_at", sa.DateTime, nullable=True))


def downgrade():
    op.drop_column("documents", "locked_at")
    op.drop_column("documents", "locked_by")
