"""Add group_id to context_links for compound AND rules

Revision ID: 023
Revises: 022
"""
from alembic import op
import sqlalchemy as sa

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "context_links",
        sa.Column("group_id", sa.String(16), nullable=True),
    )
    op.create_index("idx_context_links_group", "context_links", ["group_id"])


def downgrade():
    op.drop_index("idx_context_links_group")
    op.drop_column("context_links", "group_id")
