"""Add element_info, url, owner_app to process_recording_steps

Rich element context from clients (Chrome DOM data, desktop accessibility data).
Stored as a flexible JSON blob so the schema can evolve without migrations.

Revision ID: 027
Revises: 026_context_link_scoring
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "process_recording_steps",
        sa.Column("url", sa.String(), nullable=True),
    )
    op.add_column(
        "process_recording_steps",
        sa.Column("owner_app", sa.String(), nullable=True),
    )
    op.add_column(
        "process_recording_steps",
        sa.Column("element_info", JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("process_recording_steps", "element_info")
    op.drop_column("process_recording_steps", "owner_app")
    op.drop_column("process_recording_steps", "url")
