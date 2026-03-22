# Intercom Integration for Stept

This document describes the comprehensive Intercom integration for stept, which brings AI-powered customer support capabilities by connecting process documentation directly to Intercom's platform.

## Overview

The Intercom integration provides three powerful capabilities:

1. **Content Sync** - Push stept workflows/documents as "External Pages" into Intercom's Fin AI content library
2. **Conversation Webhook** - Auto-surface relevant workflows in agent conversations  
3. **Agent Search** - Direct search endpoint for custom Intercom apps

## Why Intercom Integration?

Intercom has two killer APIs perfect for stept:

### 1. AI Content API (Fin AI)
- Push stept workflows/documents as "External Pages" 
- Fin AI automatically answers customer questions using your process docs
- Powers "AI Copilot" sidebar suggestions for agents
- Keeps content synchronized automatically

### 2. Conversations Webhook  
- Get notified when conversations happen
- Surface relevant stept content to agents in real-time
- Add internal notes with workflow links
- Context-aware content suggestions

## Architecture

### Backend Implementation (`api/app/routers/integrations/intercom.py`)

#### Core Components

**IntercomAPIClient**
- Async HTTP client with proper rate limiting
- Multi-region support (US, EU, Australia)  
- Comprehensive error handling (401, 403, 429)
- Automatic retry logic with exponential backoff

**Content Rendering**
- `render_workflow_html()` - Converts workflow steps to clean HTML
- `render_document_html()` - Converts TipTap JSON to HTML
- `tiptap_to_html()` - Complete TipTap→HTML converter
- Supports all TipTap node types (headings, lists, tables, code blocks, etc.)

**Sync Engine**
- Incremental sync - only pushes updated content
- Tracks `last_synced_at` per resource
- Background sync tasks with proper error handling
- Manual "Sync Now" and "Force Resync" options

#### API Endpoints

**Configuration**
- `GET /integrations/intercom/config` - Get current config
- `PUT /integrations/intercom/config` - Update config (encrypted storage)
- `DELETE /integrations/intercom/config` - Disconnect integration
- `POST /integrations/intercom/test` - Test connection & content sync

**Content Sync** 
- `POST /integrations/intercom/sync` - Trigger full sync
- `POST /integrations/intercom/sync/{type}/{id}` - Sync single resource
- `GET /integrations/intercom/sync/status` - Get sync status & stats

**Webhooks & Search**
- `POST /integrations/intercom/webhook` - Receive Intercom events
- `GET /integrations/intercom/search` - Public search endpoint for Canvas Kit

#### Configuration Model

```python
class IntercomConfig(BaseModel):
    access_token: str              # Encrypted
    client_secret: str             # Encrypted (for webhook verification)
    project_id: str               # stept project to sync
    region: str = "us"            # "us" | "eu" | "au"
    content_source_id: str        # Created on first sync
    sync_enabled: bool = True     # Auto-sync on content changes
    webhook_enabled: bool = False # Conversation webhook active
    last_synced_at: datetime      # Last successful sync
    sync_stats: dict              # {workflows_synced, documents_synced, errors}
```

### Frontend Implementation

#### IntercomSettingsCard Component (`app/src/components/Settings/IntercomSettingsCard.tsx`)

**Features**
- Access token & client secret inputs (password fields with show/hide)
- Region selector (US/EU/Australia) 
- Feature toggles (Content Sync, Conversation Webhook)
- Real-time sync status with progress indicators
- Sync statistics display (workflows synced, documents synced)
- Error reporting with detailed error messages
- Test connection buttons (API test, Fin AI test)
- Webhook URL generator with copy-to-clipboard
- Comprehensive setup instructions with step-by-step guide

**API Integration** (`app/src/api/intercom.ts`)
- Full TypeScript API client
- Reactive queries with TanStack Query
- Proper error handling and user feedback
- Real-time sync status polling

## Content Sync Process

### 1. Content Import Source Creation
```javascript
// Create source on first sync
const source_data = {
    "name": "Stept - stept.example.com",
    "url": "https://stept.example.com", 
    "sync_behavior": "api",
    "description": "Process documentation and workflows"
}
// POST /ai/content_import_sources
```

### 2. External Page Creation
```javascript
// For each workflow/document
const external_page = {
    "title": "Deploy Production Application",
    "html": "<h1>Deploy Production Application</h1><ol><li>...",
    "url": "https://stept.example.com/projects/123/workflows/456",
    "external_id": "stept_workflow_456",
    "source_id": source_id,
    "ai_agent_availability": true,    // Fin can use it
    "ai_copilot_availability": true   // Show in AI Copilot
}
// POST /ai/content/external_pages
```

### 3. Incremental Sync Logic
- Track `last_synced_at` timestamp
- Only sync resources modified since last sync
- Force resync option bypasses timestamp check
- Error tracking and reporting per resource

## Webhook Processing

### 1. Signature Verification
```python
# Intercom signs webhooks with HMAC-SHA1
def verify_intercom_signature(client_secret, timestamp, body, signature):
    computed = hmac.new(
        client_secret.encode(), 
        body.decode().encode(), 
        hashlib.sha1
    ).hexdigest()
    return hmac.compare_digest(computed, signature)
```

### 2. Event Processing
- Listen for `conversation.user.created` and `conversation.user.replied`
- Extract customer message text
- Search stept using `search_unified()` function
- Format results as internal conversation note
- Post note via `/conversations/{id}/reply` with `message_type: "note"`

## Setup Guide

### 1. Create Intercom App

1. Go to [Intercom Developer Hub](https://developers.intercom.com)
2. Click "New app" → Choose workspace
3. Select "Internal integration" 

### 2. Configure Permissions

Enable OAuth scopes:
- `Read conversations`
- `Manage conversations` 
- `Read and write AI content`

### 3. Get Credentials

- Copy Access Token from Authentication section
- Copy Client Secret for webhook verification
- Note your workspace region (US/EU/AU)

### 4. Configure in Stept

1. Go to Project Settings → Integrations
2. Find "Intercom Integration" card
3. Enter Access Token and Client Secret
4. Select correct region
5. Enable Content Sync
6. Click "Test Fin AI" to verify

### 5. Enable Webhooks (Optional)

1. In Intercom app settings → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/v1/integrations/intercom/webhook`
3. Subscribe to:
   - `conversation.user.created`
   - `conversation.user.replied`
4. Enable "Conversation Webhook" in stept settings

## API Reference

### Intercom API Endpoints Used

**Content Import Sources**
- `POST /ai/content_import_sources` - Create content source
- `GET /ai/content_import_sources` - List sources

**External Pages**  
- `POST /ai/content/external_pages` - Create/update page
- `DELETE /ai/content/external_pages/{id}` - Remove page

**Conversations**
- `POST /conversations/{id}/reply` - Add note to conversation
- `GET /conversations/{id}` - Get conversation details

### Rate Limits

Intercom has generous rate limits:
- 1000 requests per minute for most endpoints
- 100 requests per minute for AI Content API
- Automatic retry with exponential backoff implemented

## Security

### Credential Storage
- All secrets encrypted using Fernet (AES-128-CBC + HMAC-SHA256)
- Keys stored in `STEPT_ENCRYPTION_KEY` environment variable
- Backward-compatible decryption with fallback handling

### Webhook Verification
- HMAC-SHA1 signature verification for all webhook requests
- Timestamp validation prevents replay attacks (5 min window)
- Client secret required for webhook functionality

### Access Control
- Project-level configuration isolation
- Admin/owner permissions required for configuration
- No cross-project data leakage

## Monitoring & Observability

### Sync Statistics
```python
sync_stats = {
    "workflows_synced": 42,
    "documents_synced": 18,
    "errors": ["Workflow 'Deploy': Invalid HTML content"],
    "last_sync": "2024-03-22T16:30:00Z"
}
```

### Logging
- Structured logging with request IDs
- Error aggregation with context
- Performance metrics for sync operations
- Webhook event processing logs

### Health Checks
- Connection test endpoint
- Content sync test endpoint  
- Sync status monitoring
- Error rate alerting

## Performance Considerations

### Batching
- External pages created individually (no bulk API available)
- Rate limiting prevents overwhelming Intercom API
- Background sync prevents blocking user requests
- Incremental sync minimizes API calls

### Caching
- Config cached in memory after decryption
- Sync status cached with 5-second refresh
- Search results leverage existing stept search cache

### Error Handling
- Graceful degradation on API failures
- Retry logic with exponential backoff
- Error aggregation and user-friendly messages
- Fallback to basic functionality on rate limits

## Benefits for Support Teams

### For Customers
- **Faster Resolution**: Fin AI answers questions instantly using your SOPs
- **Consistent Answers**: Same process documentation across all interactions
- **24/7 Availability**: AI-powered support even outside business hours
- **Self-Service**: Customers find answers without creating tickets

### For Agents  
- **AI Copilot**: Relevant workflow suggestions in conversation sidebar
- **Context Awareness**: Workflows auto-suggested based on customer messages
- **Interactive Guides**: Agents can click through to full stept workflows
- **Knowledge Sharing**: Easy "Share to channel" workflow distribution

### For Teams
- **Centralized Knowledge**: Single source of truth in stept, automatically synced
- **Process Compliance**: Agents follow documented procedures consistently
- **Continuous Improvement**: Update processes in stept, automatically sync to Intercom
- **Analytics**: Track which workflows are most used in support conversations

## Troubleshooting

### Common Issues

**"Invalid access token"**
- Verify token is copied correctly (starts with `dG9r`)
- Check token hasn't expired
- Ensure workspace region matches selected region

**"Content sync test failed"**
- Verify AI Content API scope is enabled
- Check if workspace has Fin AI feature enabled
- Ensure sufficient permissions for content creation

**"Webhook events not received"** 
- Verify webhook URL is accessible from internet
- Check webhook endpoint returns 200 status
- Ensure client secret is correct
- Verify subscribed events match configuration

**"No workflows synced"**
- Check if workflows are completed (not draft)
- Verify workflows aren't set to private visibility
- Ensure project has workflows with content
- Check sync error messages for details

### Debug Steps

1. Test connection with "Test API" button
2. Check sync status for error messages  
3. Review browser console for frontend errors
4. Check server logs for webhook processing
5. Verify Intercom app configuration

## Future Enhancements

### Planned Features
- **Bulk Operations**: Batch External Page creation when API supports it
- **Advanced Search**: Contextual search based on conversation history
- **Analytics**: Track Fin AI usage and workflow engagement
- **Custom Apps**: Intercom Messenger app for embedded workflow search
- **Smart Routing**: Route conversations based on workflow matches

### API Improvements
- **GraphQL Support**: When Intercom releases GraphQL API
- **Real-time Sync**: WebSocket-based sync for instant updates
- **Content Versioning**: Track and sync content version history
- **Advanced Filtering**: Sync only specific workflow categories

## Conclusion

The Intercom integration transforms stept from a documentation tool into a powerful AI-driven support platform. By automatically syncing process knowledge to Intercom's Fin AI and providing real-time workflow suggestions, it ensures that support teams have instant access to the most current operational procedures.

This integration represents a significant value proposition for organizations using both stept and Intercom, making it a compelling reason for customers to choose stept for their process documentation needs.

The implementation follows best practices for security, performance, and user experience, providing a robust foundation for enterprise-grade customer support operations.