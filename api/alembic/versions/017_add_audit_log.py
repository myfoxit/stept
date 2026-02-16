"""Add audit_log table

Revision ID: 017
Revises: 016
"""
from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "audit_log",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("api_key_id", sa.String(16), nullable=True, index=True),
        sa.Column("action", sa.String(20), nullable=False, index=True),
        sa.Column("resource_type", sa.String(30), nullable=True),
        sa.Column("resource_id", sa.String(64), nullable=True),
        sa.Column("resource_name", sa.String(500), nullable=True),
        sa.Column("detail", sa.JSON, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), index=True),
    )
    op.create_index("ix_audit_log_project_created", "audit_log", ["project_id", "created_at"])
    op.create_index("ix_audit_log_user_created", "audit_log", ["user_id", "created_at"])


def downgrade():
    op.drop_index("ix_audit_log_user_created", table_name="audit_log")
    op.drop_index("ix_audit_log_project_created", table_name="audit_log")
    op.drop_table("audit_log")
