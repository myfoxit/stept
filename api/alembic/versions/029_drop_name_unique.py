"""Drop unique constraint on users.name, keep regular index

Revision ID: 029
Revises: 028
"""

from alembic import op

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the unique index on users.name
    # SQLAlchemy creates ix_users_name as a unique index when unique=True, index=True
    op.drop_index("ix_users_name", table_name="users")
    # Re-create as a non-unique index
    op.create_index("ix_users_name", "users", ["name"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_name", table_name="users")
    op.create_index("ix_users_name", "users", ["name"], unique=True)
