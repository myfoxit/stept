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
    # Use raw SQL with IF NOT EXISTS for idempotency
    op.execute("CREATE INDEX IF NOT EXISTS idx_steps_session ON process_recording_step(session_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_folders_project ON folder(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folder(parent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_folder ON document(folder_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_embeddings_type_id ON embedding(content_type, content_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON process_recording_session(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_steps_session")
    op.execute("DROP INDEX IF EXISTS idx_folders_project")
    op.execute("DROP INDEX IF EXISTS idx_folders_parent")
    op.execute("DROP INDEX IF EXISTS idx_documents_folder")
    op.execute("DROP INDEX IF EXISTS idx_embeddings_type_id")
    op.execute("DROP INDEX IF EXISTS idx_sessions_user")
    op.execute("DROP INDEX IF EXISTS idx_app_settings_key")
