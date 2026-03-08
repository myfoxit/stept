"""Add OAuth fields to users table

Revision ID: 030
Revises: 029
"""

from alembic import op
import sqlalchemy as sa

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("google_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("github_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(), nullable=True))
    op.add_column(
        "users",
        sa.Column("auth_method", sa.String(), nullable=False, server_default="email"),
    )
    op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)
    op.create_index("ix_users_github_id", "users", ["github_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_github_id", table_name="users")
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_column("users", "auth_method")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "github_id")
    op.drop_column("users", "google_id")
