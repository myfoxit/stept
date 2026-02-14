"""Add resource_shares table

Revision ID: 006
Revises: 005
"""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'resource_shares',
        sa.Column('id', sa.String(16), primary_key=True),
        sa.Column('resource_type', sa.String(20), nullable=False),
        sa.Column('resource_id', sa.String(16), nullable=False),
        sa.Column('shared_with_email', sa.String(255), nullable=False),
        sa.Column('shared_with_user_id', sa.String(16), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('permission', sa.String(10), nullable=False, server_default='view'),
        sa.Column('shared_by', sa.String(16), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_unique_constraint('_resource_share_unique', 'resource_shares', ['resource_type', 'resource_id', 'shared_with_email'])
    op.create_index('ix_resource_shares_lookup', 'resource_shares', ['resource_type', 'resource_id'])
    op.create_index('ix_resource_shares_user', 'resource_shares', ['shared_with_user_id'])
    op.create_index('ix_resource_shares_email', 'resource_shares', ['shared_with_email'])


def downgrade():
    op.drop_index('ix_resource_shares_email', table_name='resource_shares')
    op.drop_index('ix_resource_shares_user', table_name='resource_shares')
    op.drop_index('ix_resource_shares_lookup', table_name='resource_shares')
    op.drop_constraint('_resource_share_unique', 'resource_shares', type_='unique')
    op.drop_table('resource_shares')
