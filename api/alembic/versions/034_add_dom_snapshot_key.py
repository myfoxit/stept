"""Add dom_snapshot_key column to process_recording_steps.

Revision ID: 034
Revises: 033
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "process_recording_steps",
        sa.Column("dom_snapshot_key", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("process_recording_steps", "dom_snapshot_key")
