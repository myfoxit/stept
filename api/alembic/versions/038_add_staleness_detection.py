"""add staleness detection tables and health columns

Revision ID: 038
Revises: 037
"""
from alembic import op
import sqlalchemy as sa

revision = "038"
down_revision = "037"


def upgrade() -> None:
    # ── workflow_step_checks ──────────────────────────────────────────────
    op.create_table(
        "workflow_step_checks",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("workflow_id", sa.String(16), sa.ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_number", sa.Integer, nullable=False),
        sa.Column("check_source", sa.String(20), nullable=False),
        sa.Column("element_found", sa.Boolean, nullable=True),
        sa.Column("finder_method", sa.String(20), nullable=True),
        sa.Column("finder_confidence", sa.Float, nullable=True),
        sa.Column("expected_url", sa.String, nullable=True),
        sa.Column("actual_url", sa.String, nullable=True),
        sa.Column("url_matched", sa.Boolean, nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("llm_visible", sa.Boolean, nullable=True),
        sa.Column("llm_explanation", sa.Text, nullable=True),
        sa.Column("checked_by", sa.String(16), nullable=True),
        sa.Column("checked_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_step_check_workflow", "workflow_step_checks", ["workflow_id", "step_number"])
    op.create_index("ix_step_check_time", "workflow_step_checks", ["checked_at"])
    op.create_index("ix_step_check_source", "workflow_step_checks", ["check_source", "checked_at"])

    # ── step_reliability ──────────────────────────────────────────────────
    op.create_table(
        "step_reliability",
        sa.Column("workflow_id", sa.String(16), sa.ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("step_number", sa.Integer, primary_key=True),
        sa.Column("total_checks", sa.Integer, nullable=False, server_default="0"),
        sa.Column("found_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("reliability", sa.Float, nullable=False, server_default="0"),
        sa.Column("is_reliable", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("recent_checks", sa.Integer, nullable=False, server_default="0"),
        sa.Column("recent_found", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_found_at", sa.DateTime, nullable=True),
        sa.Column("last_checked_at", sa.DateTime, nullable=True),
        sa.Column("last_method", sa.String(20), nullable=True),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── verification_configs ──────────────────────────────────────────────
    op.create_table(
        "verification_configs",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("login_url", sa.String, nullable=True),
        sa.Column("encrypted_email", sa.Text, nullable=True),
        sa.Column("encrypted_password", sa.Text, nullable=True),
        sa.Column("email_selector", sa.String, nullable=True),
        sa.Column("password_selector", sa.String, nullable=True),
        sa.Column("submit_selector", sa.String, nullable=True),
        sa.Column("post_login_wait_ms", sa.Integer, server_default="2000"),
        sa.Column("schedule", sa.String(10), server_default="'weekly'"),
        sa.Column("schedule_day", sa.Integer, server_default="0"),
        sa.Column("schedule_hour", sa.Integer, server_default="3"),
        sa.Column("schedule_scope", sa.String(10), server_default="'all'"),
        sa.Column("llm_enabled", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("notify_email", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("notify_in_app", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
        sa.Column("last_run_status", sa.String(10), nullable=True),
        sa.Column("last_run_stats", sa.JSON, nullable=True),
        sa.Column("next_run_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── verification_jobs ─────────────────────────────────────────────────
    op.create_table(
        "verification_jobs",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_ids", sa.JSON, nullable=False),
        sa.Column("trigger", sa.String(10), nullable=False),
        sa.Column("triggered_by", sa.String(16), nullable=True),
        sa.Column("status", sa.String(12), nullable=False, server_default="'queued'"),
        sa.Column("progress", sa.JSON, nullable=True),
        sa.Column("results", sa.JSON, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_job_project", "verification_jobs", ["project_id", "status"])
    op.create_index("ix_job_created", "verification_jobs", ["created_at"])

    # ── staleness_alerts ──────────────────────────────────────────────────
    op.create_table(
        "staleness_alerts",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("project_id", sa.String(16), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_id", sa.String(16), sa.ForeignKey("process_recording_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alert_type", sa.String(20), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("details", sa.JSON, nullable=True),
        sa.Column("resolved", sa.Boolean, server_default=sa.text("false")),
        sa.Column("resolved_by", sa.String(16), nullable=True),
        sa.Column("resolved_at", sa.DateTime, nullable=True),
        sa.Column("dismissed", sa.Boolean, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_alert_project", "staleness_alerts", ["project_id", "resolved", "dismissed"])
    op.create_index("ix_alert_workflow", "staleness_alerts", ["workflow_id"])

    # ── Add health columns to process_recording_sessions ──────────────────
    with op.batch_alter_table("process_recording_sessions") as batch_op:
        batch_op.add_column(sa.Column("health_score", sa.Float, nullable=True))
        batch_op.add_column(sa.Column("health_status", sa.String(10), nullable=True))
        batch_op.add_column(sa.Column("last_verified_at", sa.DateTime, nullable=True))
        batch_op.add_column(sa.Column("last_verified_source", sa.String(20), nullable=True))
        batch_op.add_column(sa.Column("reliable_step_count", sa.Integer, server_default="0"))
        batch_op.add_column(sa.Column("unreliable_step_count", sa.Integer, server_default="0"))
        batch_op.add_column(sa.Column("failed_step_count", sa.Integer, server_default="0"))
        batch_op.add_column(sa.Column("coverage", sa.Float, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("process_recording_sessions") as batch_op:
        batch_op.drop_column("coverage")
        batch_op.drop_column("failed_step_count")
        batch_op.drop_column("unreliable_step_count")
        batch_op.drop_column("reliable_step_count")
        batch_op.drop_column("last_verified_source")
        batch_op.drop_column("last_verified_at")
        batch_op.drop_column("health_status")
        batch_op.drop_column("health_score")

    op.drop_table("staleness_alerts")
    op.drop_table("verification_jobs")
    op.drop_table("verification_configs")
    op.drop_table("step_reliability")
    op.drop_table("workflow_step_checks")
