"""Add indexes on frequently-queried FK columns

Revision ID: 027
Revises: 026
"""
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade():
    # Project FK indexes
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])
    op.create_index("ix_projects_user_id", "projects", ["user_id"])

    # Document.locked_by
    op.create_index("ix_documents_locked_by", "documents", ["locked_by"])

    # DocumentVersion.created_by
    op.create_index("ix_document_versions_created_by", "document_versions", ["created_by"])

    # ResourceShare FK indexes
    op.create_index("ix_resource_shares_shared_with_user_id", "resource_shares", ["shared_with_user_id"])
    op.create_index("ix_resource_shares_shared_by", "resource_shares", ["shared_by"])

    # Comment.parent_id
    op.create_index("ix_comments_parent_id", "comments", ["parent_id"])

    # ContextLink.created_by
    op.create_index("ix_context_links_created_by", "context_links", ["created_by"])

    # McpApiKey.created_by
    op.create_index("ix_mcp_api_keys_created_by", "mcp_api_keys", ["created_by"])

    # KnowledgeSource.created_by
    op.create_index("ix_knowledge_sources_created_by", "knowledge_sources", ["created_by"])

    # KnowledgeLink.created_by
    op.create_index("ix_knowledge_links_created_by", "knowledge_links", ["created_by"])


def downgrade():
    op.drop_index("ix_knowledge_links_created_by", "knowledge_links")
    op.drop_index("ix_knowledge_sources_created_by", "knowledge_sources")
    op.drop_index("ix_mcp_api_keys_created_by", "mcp_api_keys")
    op.drop_index("ix_context_links_created_by", "context_links")
    op.drop_index("ix_comments_parent_id", "comments")
    op.drop_index("ix_resource_shares_shared_by", "resource_shares")
    op.drop_index("ix_resource_shares_shared_with_user_id", "resource_shares")
    op.drop_index("ix_document_versions_created_by", "document_versions")
    op.drop_index("ix_documents_locked_by", "documents")
    op.drop_index("ix_projects_user_id", "projects")
    op.drop_index("ix_projects_owner_id", "projects")
