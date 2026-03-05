"""Add FTS triggers for workflows and steps, search_tsv on steps

Revision ID: 020
Revises: 019
"""
from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add search_tsv column to process_recording_steps
    op.execute("ALTER TABLE process_recording_steps ADD COLUMN IF NOT EXISTS search_tsv tsvector")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_steps_search_tsv "
        "ON process_recording_steps USING GIN (search_tsv)"
    )

    # 2. Create trigger function for process_recording_sessions
    op.execute("""
        CREATE OR REPLACE FUNCTION sessions_search_tsv_trigger() RETURNS trigger AS $$
        BEGIN
            NEW.search_tsv :=
                setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.generated_title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(
                    CASE
                        WHEN NEW.tags IS NOT NULL THEN array_to_string(
                            ARRAY(SELECT jsonb_array_elements_text(NEW.tags::jsonb)), ' '
                        )
                        ELSE ''
                    END, ''
                )), 'B') ||
                setweight(to_tsvector('english', coalesce(left(NEW.guide_markdown, 4000), '')), 'C');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)

    op.execute("DROP TRIGGER IF EXISTS trg_sessions_search_tsv ON process_recording_sessions")
    op.execute("""
        CREATE TRIGGER trg_sessions_search_tsv
        BEFORE INSERT OR UPDATE ON process_recording_sessions
        FOR EACH ROW EXECUTE FUNCTION sessions_search_tsv_trigger()
    """)

    # 3. Create trigger function for process_recording_steps
    op.execute("""
        CREATE OR REPLACE FUNCTION steps_search_tsv_trigger() RETURNS trigger AS $$
        BEGIN
            NEW.search_tsv :=
                setweight(to_tsvector('english', coalesce(NEW.generated_title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.generated_description, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C') ||
                setweight(to_tsvector('english', coalesce(NEW.window_title, '')), 'C') ||
                setweight(to_tsvector('english', coalesce(NEW.content, '')), 'D');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)

    op.execute("DROP TRIGGER IF EXISTS trg_steps_search_tsv ON process_recording_steps")
    op.execute("""
        CREATE TRIGGER trg_steps_search_tsv
        BEFORE INSERT OR UPDATE ON process_recording_steps
        FOR EACH ROW EXECUTE FUNCTION steps_search_tsv_trigger()
    """)

    # 4. Backfill existing rows by touching each row (trigger will fire)
    op.execute("""
        UPDATE process_recording_sessions SET search_tsv =
            setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(generated_title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(
                CASE
                    WHEN tags IS NOT NULL THEN array_to_string(
                        ARRAY(SELECT jsonb_array_elements_text(tags::jsonb)), ' '
                    )
                    ELSE ''
                END, ''
            )), 'B') ||
            setweight(to_tsvector('english', coalesce(left(guide_markdown, 4000), '')), 'C')
    """)

    op.execute("""
        UPDATE process_recording_steps SET search_tsv =
            setweight(to_tsvector('english', coalesce(generated_title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(generated_description, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
            setweight(to_tsvector('english', coalesce(window_title, '')), 'C') ||
            setweight(to_tsvector('english', coalesce(content, '')), 'D')
    """)


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_steps_search_tsv ON process_recording_steps")
    op.execute("DROP FUNCTION IF EXISTS steps_search_tsv_trigger()")
    op.execute("DROP TRIGGER IF EXISTS trg_sessions_search_tsv ON process_recording_sessions")
    op.execute("DROP FUNCTION IF EXISTS sessions_search_tsv_trigger()")
    op.execute("DROP INDEX IF EXISTS idx_steps_search_tsv")
    op.execute("ALTER TABLE process_recording_steps DROP COLUMN IF EXISTS search_tsv")
