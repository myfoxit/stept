"""Add mcp_api_keys table

Revision ID: 012
Revises: 011
"""
from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "mcp_api_keys",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("key_prefix", sa.String(12), nullable=False),
        sa.Column("created_by", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_mcp_api_keys_project_id", "mcp_api_keys", ["project_id"])
    op.create_index("ix_mcp_api_keys_key_hash", "mcp_api_keys", ["key_hash"], unique=True)


def downgrade():
    op.drop_table("mcp_api_keys")
