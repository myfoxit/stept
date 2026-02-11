"""Add AI annotation columns and app_settings table

Revision ID: 002
Revises: 001
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ProcessRecordingSession AI columns
    op.add_column("process_recording_sessions", sa.Column("generated_title", sa.String(), nullable=True))
    op.add_column("process_recording_sessions", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("process_recording_sessions", sa.Column("tags", sa.JSON(), nullable=True))
    op.add_column("process_recording_sessions", sa.Column("estimated_time", sa.String(), nullable=True))
    op.add_column("process_recording_sessions", sa.Column("difficulty", sa.String(), nullable=True))
    op.add_column("process_recording_sessions", sa.Column("is_processed", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("process_recording_sessions", sa.Column("guide_markdown", sa.Text(), nullable=True))

    # ProcessRecordingStep AI columns
    op.add_column("process_recording_steps", sa.Column("generated_title", sa.String(), nullable=True))
    op.add_column("process_recording_steps", sa.Column("generated_description", sa.Text(), nullable=True))
    op.add_column("process_recording_steps", sa.Column("ui_element", sa.String(), nullable=True))
    op.add_column("process_recording_steps", sa.Column("step_category", sa.String(), nullable=True))
    op.add_column("process_recording_steps", sa.Column("is_annotated", sa.Boolean(), nullable=False, server_default="false"))

    # AppSettings table
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("app_settings")

    op.drop_column("process_recording_steps", "is_annotated")
    op.drop_column("process_recording_steps", "step_category")
    op.drop_column("process_recording_steps", "ui_element")
    op.drop_column("process_recording_steps", "generated_description")
    op.drop_column("process_recording_steps", "generated_title")

    op.drop_column("process_recording_sessions", "guide_markdown")
    op.drop_column("process_recording_sessions", "is_processed")
    op.drop_column("process_recording_sessions", "difficulty")
    op.drop_column("process_recording_sessions", "estimated_time")
    op.drop_column("process_recording_sessions", "tags")
    op.drop_column("process_recording_sessions", "summary")
    op.drop_column("process_recording_sessions", "generated_title")
