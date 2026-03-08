"""Add SSO config table for enterprise OIDC

Revision ID: 031
Revises: 030
"""

from alembic import op
import sqlalchemy as sa

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sso_configs",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("domain", sa.String(), nullable=False, unique=True),
        sa.Column("provider_name", sa.String(), nullable=False),
        sa.Column("issuer_url", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("client_secret", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("auto_create_users", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sso_configs_domain", "sso_configs", ["domain"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_sso_configs_domain", table_name="sso_configs")
    op.drop_table("sso_configs")
