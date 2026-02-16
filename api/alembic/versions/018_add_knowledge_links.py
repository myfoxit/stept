"""Add knowledge_links table

Revision ID: 018
Revises: 017
"""
from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "knowledge_links",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.String(30), nullable=False),
        sa.Column("source_id", sa.String(16), nullable=False),
        sa.Column("target_type", sa.String(30), nullable=False),
        sa.Column("target_id", sa.String(16), nullable=False),
        sa.Column("link_type", sa.String(20), nullable=False),
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("auto_detected", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.String(16), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("source_type", "source_id", "target_type", "target_id", "link_type", name="_knowledge_link_unique"),
    )
    op.create_index("idx_kl_project", "knowledge_links", ["project_id"])
    op.create_index("idx_kl_source", "knowledge_links", ["source_type", "source_id"])
    op.create_index("idx_kl_target", "knowledge_links", ["target_type", "target_id"])


def downgrade():
    op.drop_table("knowledge_links")
