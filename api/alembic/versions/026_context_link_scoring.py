"""context link scoring: add source, weight, click_count + dedup constraint

Revision ID: 026
Revises: 025
Create Date: 2026-03-05

Changes
-------
- context_links.source     VARCHAR(10)  DEFAULT 'user'   — "user" | "auto"
- context_links.weight     FLOAT        DEFAULT 1000.0   — base score for ranking
- context_links.click_count INTEGER     DEFAULT 0        — explicit click signal
- Unique constraint uq_context_link_dedup (project_id, match_type, match_value, resource_id)
  Prevents duplicate entries for the same pattern→resource mapping.
  NOTE: If your DB already has duplicates, run the dedup query in the docstring
  of the upgrade() function before applying this migration.
"""
from alembic import op
import sqlalchemy as sa

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New columns ───────────────────────────────────────────────────────
    op.add_column(
        "context_links",
        sa.Column("source", sa.String(10), nullable=False, server_default="user"),
    )
    op.add_column(
        "context_links",
        sa.Column("weight", sa.Float(), nullable=False, server_default="1000.0"),
    )
    op.add_column(
        "context_links",
        sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"),
    )

    # ── Dedup unique constraint ───────────────────────────────────────────
    # If you have existing duplicate rows, run this first to keep only the
    # highest-priority one per tuple:
    #
    #   DELETE FROM context_links cl
    #   USING (
    #     SELECT MIN(id) AS keep_id, project_id, match_type, match_value, resource_id
    #     FROM context_links
    #     GROUP BY project_id, match_type, match_value, resource_id
    #     HAVING COUNT(*) > 1
    #   ) dups
    #   WHERE cl.project_id = dups.project_id
    #     AND cl.match_type = dups.match_type
    #     AND cl.match_value = dups.match_value
    #     AND cl.resource_id = dups.resource_id
    #     AND cl.id <> dups.keep_id;
    #
    op.create_unique_constraint(
        "uq_context_link_dedup",
        "context_links",
        ["project_id", "match_type", "match_value", "resource_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_context_link_dedup", "context_links", type_="unique")
    op.drop_column("context_links", "click_count")
    op.drop_column("context_links", "weight")
    op.drop_column("context_links", "source")
