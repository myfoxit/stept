"""Add AI annotation columns and app_settings table

Revision ID: 002
Revises: 001
Create Date: 2026-02-11

NOTE: Migration 001 already includes these columns/tables in fresh installs.
This migration is kept for existing databases that ran 001 without them.
All operations are idempotent (safe to re-run).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    """Check if a column exists in a table."""
    conn = op.get_bind()
    insp = inspect(conn)
    columns = [c["name"] for c in insp.get_columns(table)]
    return column in columns


def _has_table(table: str) -> bool:
    """Check if a table exists."""
    conn = op.get_bind()
    insp = inspect(conn)
    return table in insp.get_table_names()


def upgrade() -> None:
    # ProcessRecordingSession AI columns
    for col_name, col_type, kwargs in [
        ("generated_title", sa.String(), {}),
        ("summary", sa.Text(), {}),
        ("tags", sa.JSON(), {}),
        ("estimated_time", sa.String(), {}),
        ("difficulty", sa.String(), {}),
        ("is_processed", sa.Boolean(), {"nullable": False, "server_default": "false"}),
        ("guide_markdown", sa.Text(), {}),
    ]:
        if not _has_column("process_recording_sessions", col_name):
            op.add_column("process_recording_sessions", sa.Column(col_name, col_type, nullable=kwargs.get("nullable", True), server_default=kwargs.get("server_default")))

    # ProcessRecordingStep AI columns
    for col_name, col_type, kwargs in [
        ("generated_title", sa.String(), {}),
        ("generated_description", sa.Text(), {}),
        ("ui_element", sa.String(), {}),
        ("step_category", sa.String(), {}),
        ("is_annotated", sa.Boolean(), {"nullable": False, "server_default": "false"}),
    ]:
        if not _has_column("process_recording_steps", col_name):
            op.add_column("process_recording_steps", sa.Column(col_name, col_type, nullable=kwargs.get("nullable", True), server_default=kwargs.get("server_default")))

    # AppSettings table
    if not _has_table("app_settings"):
        op.create_table(
            "app_settings",
            sa.Column("key", sa.String(), primary_key=True),
            sa.Column("value", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )


def downgrade() -> None:
    if _has_table("app_settings"):
        op.drop_table("app_settings")

    for col in ["is_annotated", "step_category", "ui_element", "generated_description", "generated_title"]:
        if _has_column("process_recording_steps", col):
            op.drop_column("process_recording_steps", col)

    for col in ["guide_markdown", "is_processed", "difficulty", "estimated_time", "tags", "summary", "generated_title"]:
        if _has_column("process_recording_sessions", col):
            op.drop_column("process_recording_sessions", col)
