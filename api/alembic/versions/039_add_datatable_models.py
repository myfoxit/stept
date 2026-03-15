"""add datatable models (table_meta, column_meta, relations, etc.)

These tables already exist in models.py (ported from SnapRow).
This migration ensures they are created in the database.

Revision ID: 039
Revises: 038
"""
from alembic import op
import sqlalchemy as sa

revision = "039"
down_revision = "038"


def upgrade() -> None:
    # ── table_meta ────────────────────────────────────────────────────────
    op.create_table(
        "table_meta",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String, nullable=True),
        sa.Column("physical_name", sa.String, nullable=True, unique=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        sa.Column("table_type", sa.String, nullable=False, server_default="user"),
        sa.Column("has_order_column", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_table_meta_name", "table_meta", ["name"])
    op.create_index("ix_table_meta_project", "table_meta", ["project_id"])

    # ── column_meta ───────────────────────────────────────────────────────
    op.create_table(
        "column_meta",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("table_id", sa.String(16), sa.ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=True),
        sa.Column("display_name", sa.String, nullable=True),
        sa.Column("name", sa.String, nullable=True),
        sa.Column("ui_type", sa.String, nullable=True),
        sa.Column("fk_type", sa.String, nullable=True),
        sa.Column("relations_table_id", sa.String(16), nullable=True),
        sa.Column("column_type", sa.String, nullable=False, server_default="physical"),
        sa.Column("sr__order", sa.Integer, nullable=False, server_default=sa.text("1000")),
        sa.Column("default_value", sa.JSON, nullable=True),
        sa.Column("settings", sa.JSON, nullable=True),
    )
    op.create_index("ix_column_meta_table", "column_meta", ["table_id"])

    # ── field_meta ────────────────────────────────────────────────────────
    op.create_table(
        "field_meta",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("table_id", sa.String(16), sa.ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=True),
        sa.Column("row_id", sa.Integer, nullable=True),
        sa.Column("column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=True),
        sa.Column("value", sa.Text, nullable=True),
    )

    # ── relation_meta ─────────────────────────────────────────────────────
    op.create_table(
        "relation_meta",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("left_table_id", sa.String, sa.ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("right_table_id", sa.String, sa.ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relation_type", sa.String, nullable=False),
        sa.Column("fk_name", sa.String, nullable=True),
        sa.Column("display_name", sa.String, nullable=True),
        sa.Column("join_table_id", sa.String, sa.ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=True),
        sa.Column("left_column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=True),
        sa.Column("right_column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=True),
    )

    # ── select_options ────────────────────────────────────────────────────
    op.create_table(
        "select_options",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("color", sa.String, nullable=True),
        sa.Column("order", sa.Integer, nullable=True, server_default="0"),
    )

    # ── lookup_columns ────────────────────────────────────────────────────
    op.create_table(
        "lookup_columns",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relation_column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lookup_column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False),
    )

    # ── formulas ──────────────────────────────────────────────────────────
    op.create_table(
        "formulas",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=True),
        sa.Column("formula", sa.Text, nullable=False),
        sa.Column("formula_raw", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── rollups ───────────────────────────────────────────────────────────
    op.create_table(
        "rollups",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("relation_column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rollup_column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="SET NULL"), nullable=True),
        sa.Column("aggregate_func", sa.String, nullable=False, server_default=sa.text("'count'")),
        sa.Column("precision", sa.Integer, nullable=True),
        sa.Column("show_thousands_sep", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── filters ───────────────────────────────────────────────────────────
    op.create_table(
        "filters",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("table_id", sa.String(16), sa.ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("operation", sa.String, nullable=False),
        sa.Column("value", sa.Text, nullable=True),
        sa.Column("is_reusable", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_filters_table", "filters", ["table_id"])
    op.create_index("ix_filters_user", "filters", ["user_id"])
    op.create_unique_constraint("_filter_unique", "filters", ["table_id", "user_id", "column_id", "operation", "value"])

    # ── sorts ─────────────────────────────────────────────────────────────
    op.create_table(
        "sorts",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("table_id", sa.String(16), sa.ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", sa.String, nullable=False, server_default=sa.text("'asc'")),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_sorts_table", "sorts", ["table_id"])
    op.create_index("ix_sorts_user", "sorts", ["user_id"])
    op.create_unique_constraint("_sort_unique", "sorts", ["table_id", "user_id", "column_id"])

    # ── column_visibility ─────────────────────────────────────────────────
    op.create_table(
        "column_visibility",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("table_id", sa.String(16), sa.ForeignKey("table_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("column_id", sa.String(16), sa.ForeignKey("column_meta.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_visible", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_col_vis_table", "column_visibility", ["table_id"])
    op.create_index("ix_col_vis_user", "column_visibility", ["user_id"])
    op.create_unique_constraint("_column_visibility_unique", "column_visibility", ["table_id", "user_id", "column_id"])


def downgrade() -> None:
    op.drop_table("column_visibility")
    op.drop_table("sorts")
    op.drop_table("filters")
    op.drop_table("rollups")
    op.drop_table("formulas")
    op.drop_table("lookup_columns")
    op.drop_table("select_options")
    op.drop_table("relation_meta")
    op.drop_table("field_meta")
    op.drop_table("column_meta")
    op.drop_table("table_meta")
