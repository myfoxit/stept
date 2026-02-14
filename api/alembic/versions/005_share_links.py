"""Add share_token and is_public to sessions and documents

Revision ID: 005
Revises: 004
"""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    # ProcessRecordingSession
    op.add_column('process_recording_sessions', sa.Column('share_token', sa.String(64), nullable=True))
    op.add_column('process_recording_sessions', sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'))
    op.create_index('ix_process_recording_sessions_share_token', 'process_recording_sessions', ['share_token'], unique=True)

    # Documents
    op.add_column('documents', sa.Column('share_token', sa.String(64), nullable=True))
    op.add_column('documents', sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'))
    op.create_index('ix_documents_share_token', 'documents', ['share_token'], unique=True)


def downgrade():
    op.drop_index('ix_documents_share_token', table_name='documents')
    op.drop_column('documents', 'is_public')
    op.drop_column('documents', 'share_token')
    op.drop_index('ix_process_recording_sessions_share_token', table_name='process_recording_sessions')
    op.drop_column('process_recording_sessions', 'is_public')
    op.drop_column('process_recording_sessions', 'share_token')
