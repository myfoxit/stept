"""Add guide analytics events table

Revision ID: 041
Revises: 040
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '041'
down_revision = '040'
branch_labels = None
depends_on = None


def upgrade():
    # Create guide_analytics_events table
    op.create_table(
        'guide_analytics_events',
        sa.Column('id', sa.String(16), nullable=False),
        sa.Column('project_id', sa.String(16), nullable=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('guide_id', sa.String(16), nullable=True),
        sa.Column('step_index', sa.Integer(), nullable=True),
        sa.Column('widget_id', sa.String(50), nullable=True),
        sa.Column('user_external_id', sa.String(255), nullable=True),
        sa.Column('session_id', sa.String(64), nullable=True),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('page_url', sa.String(1024), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for performance
    op.create_index('ix_guide_analytics_events_project_id', 'guide_analytics_events', ['project_id'])
    op.create_index('ix_guide_analytics_events_event_type', 'guide_analytics_events', ['event_type'])
    op.create_index('ix_guide_analytics_events_guide_id', 'guide_analytics_events', ['guide_id'])
    op.create_index('ix_guide_analytics_events_user_external_id', 'guide_analytics_events', ['user_external_id'])
    op.create_index('ix_guide_analytics_events_created_at', 'guide_analytics_events', ['created_at'])


def downgrade():
    op.drop_table('guide_analytics_events')