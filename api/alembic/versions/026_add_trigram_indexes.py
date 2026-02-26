"""Enable pg_trgm and add trigram GIN indexes

Revision ID: 026
Revises: 025
"""
from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_name_trgm "
        "ON process_recording_sessions USING GIN (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_steps_gen_title_trgm "
        "ON process_recording_steps USING GIN (generated_title gin_trgm_ops)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_steps_gen_title_trgm")
    op.execute("DROP INDEX IF EXISTS idx_sessions_name_trgm")
    # Don't drop the extension — other things may depend on it
