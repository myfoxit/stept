"""Add performance indexes

Revision ID: 004
Revises: 003
Create Date: 2026-02-12
"""
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use IF NOT EXISTS for idempotency. Table names must match actual schema.
    op.execute("CREATE INDEX IF NOT EXISTS idx_steps_session ON process_recording_steps(session_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON process_recording_sessions(user_id)")
    # app_settings already has a PK on key — no extra index needed


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_steps_session")
    op.execute("DROP INDEX IF EXISTS idx_folders_project")
    op.execute("DROP INDEX IF EXISTS idx_folders_parent")
    op.execute("DROP INDEX IF EXISTS idx_documents_folder")
    op.execute("DROP INDEX IF EXISTS idx_sessions_user")
