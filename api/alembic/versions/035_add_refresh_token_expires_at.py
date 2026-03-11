"""add expires_at to refresh_tokens

Revision ID: 035
Revises: 034
"""
from alembic import op
import sqlalchemy as sa

revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "refresh_tokens",
        sa.Column("expires_at", sa.DateTime, nullable=True),
    )


def downgrade():
    op.drop_column("refresh_tokens", "expires_at")
