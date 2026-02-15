"""Add git export configuration

Revision ID: 010
Revises: 009
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "git_sync_configs",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("repo_url", sa.String(500), nullable=False),
        sa.Column("branch", sa.String(100), nullable=False, server_default="main"),
        sa.Column("directory", sa.String(500), nullable=False, server_default="/"),
        sa.Column("access_token", sa.String(500), nullable=False),
        sa.Column("last_sync_at", sa.DateTime, nullable=True),
        sa.Column("last_sync_status", sa.String(20), nullable=True),
        sa.Column("last_sync_error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("git_sync_configs")
