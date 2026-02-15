"""Add document_versions table and version/lock columns to documents

Revision ID: 013
Revises: 012
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "document_versions",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("document_id", sa.String(16), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("content", sa.JSON, nullable=False),
        sa.Column("name", sa.String, nullable=True),
        sa.Column("byte_size", sa.Integer, nullable=True),
        sa.Column("created_by", sa.String(16), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("idx_doc_versions_doc", "document_versions", ["document_id", sa.text("version_number DESC")])

    op.add_column("documents", sa.Column("version", sa.Integer, nullable=False, server_default=sa.text("1")))
    op.add_column("documents", sa.Column("locked_by", sa.String(16), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("documents", sa.Column("locked_at", sa.DateTime, nullable=True))


def downgrade():
    op.drop_column("documents", "locked_at")
    op.drop_column("documents", "locked_by")
    op.drop_column("documents", "version")
    op.drop_table("document_versions")
