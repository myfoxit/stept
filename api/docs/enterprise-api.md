# Ondoki Enterprise Search API

Search your team's workflows and documents programmatically. Unlike other tools that only return titles, Ondoki returns **actual step-by-step content** — descriptions, actions, text typed, and keyboard shortcuts.

## Quick Start

### 1. Get an API Key

Generate an API key from your project's settings page (requires admin role). Keys are scoped to a single project.

### 2. Make Your First Search

```bash
curl -X POST https://app.ondoki.com/api/v1/enterprise/search \
  -H "X-API-Key: ondoki_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"query": "reset password"}'
```

## Authentication

All endpoints require an `X-API-Key` header. Keys are created in the Ondoki dashboard under **Project Settings > API Keys**.

```
X-API-Key: ondoki_abc123...
```

Each key is scoped to one project. All search results are restricted to that project's workflows and documents.

## Base URL

```
https://app.ondoki.com/api/v1/enterprise
```

## Endpoints

---

### POST /search

Search workflows and documents within your project.

**Rate limit:** 60 requests per 60 seconds.

#### Request Body

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | *required* | Search query (1-500 chars) |
| `type` | string | `null` | Filter by `"workflow"` or `"document"`. Null searches both. |
| `sort_by` | string | `"relevance"` | One of: `relevance`, `created_at`, `-created_at`, `updated_at`, `-updated_at` |
| `created_after` | datetime | `null` | ISO 8601 datetime filter |
| `created_before` | datetime | `null` | ISO 8601 datetime filter |
| `updated_after` | datetime | `null` | ISO 8601 datetime filter |
| `updated_before` | datetime | `null` | ISO 8601 datetime filter |
| `include_steps` | boolean | `true` | Include step details in workflow results |
| `limit` | integer | `15` | Max results (1-50) |

#### Example Request

```bash
curl -X POST https://app.ondoki.com/api/v1/enterprise/search \
  -H "X-API-Key: ondoki_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "how to reset password",
    "type": "workflow",
    "include_steps": true,
    "limit": 5
  }'
```

#### Example Response

```json
{
  "results": [
    {
      "id": "abc123",
      "name": "Password Reset Guide",
      "description": "How to reset your password in the admin panel",
      "type": "workflow",
      "url": "https://app.ondoki.com/public/workflow/share_token_here",
      "embed_url": "https://app.ondoki.com/public/workflow/share_token_here/embed",
      "author": {
        "id": "user123",
        "name": "John Doe",
        "email": "john@company.com"
      },
      "tags": ["admin", "security"],
      "estimated_time": "2 minutes",
      "total_steps": 5,
      "steps": [
        {
          "step_number": 1,
          "description": "Navigate to the admin panel",
          "action_type": "click",
          "text_typed": null,
          "key_pressed": null
        },
        {
          "step_number": 2,
          "description": "Click Settings",
          "action_type": "click",
          "text_typed": null,
          "key_pressed": null
        }
      ],
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-02-20T14:45:00Z"
    }
  ],
  "total": 1,
  "query": "how to reset password"
}
```

When `include_steps` is `false`, the `steps` field is omitted (metadata-only, like Scribe).

For documents, `description` contains a plain-text preview (first 500 characters).

---

### GET /projects

List projects accessible by this API key.

**Rate limit:** 30 requests per 60 seconds.

#### Example Request

```bash
curl https://app.ondoki.com/api/v1/enterprise/projects \
  -H "X-API-Key: ondoki_your_key_here"
```

#### Example Response

```json
{
  "projects": [
    {
      "id": "proj123",
      "name": "Engineering",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### GET /stats

Basic stats for your project.

**Rate limit:** 30 requests per 60 seconds.

#### Example Request

```bash
curl https://app.ondoki.com/api/v1/enterprise/stats \
  -H "X-API-Key: ondoki_your_key_here"
```

#### Example Response

```json
{
  "total_workflows": 42,
  "total_documents": 15,
  "total_steps": 380
}
```

---

## Code Examples

### Python

```python
import requests

API_KEY = "ondoki_your_key_here"
BASE_URL = "https://app.ondoki.com/api/v1/enterprise"

# Search workflows
response = requests.post(
    f"{BASE_URL}/search",
    headers={"X-API-Key": API_KEY},
    json={
        "query": "deploy to production",
        "type": "workflow",
        "include_steps": True,
        "limit": 10,
    },
)
data = response.json()

for result in data["results"]:
    print(f"{result['name']} ({result['total_steps']} steps)")
    if result.get("steps"):
        for step in result["steps"]:
            print(f"  {step['step_number']}. {step['description']}")
```

### JavaScript / Node.js

```javascript
const API_KEY = "ondoki_your_key_here";
const BASE_URL = "https://app.ondoki.com/api/v1/enterprise";

// Search
const res = await fetch(`${BASE_URL}/search`, {
  method: "POST",
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: "deploy to production",
    type: "workflow",
    include_steps: true,
    limit: 10,
  }),
});

const data = await res.json();

data.results.forEach((result) => {
  console.log(`${result.name} (${result.total_steps} steps)`);
  result.steps?.forEach((step) => {
    console.log(`  ${step.step_number}. ${step.description}`);
  });
});
```

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| POST /search | 60 requests / 60 seconds |
| GET /projects | 30 requests / 60 seconds |
| GET /stats | 30 requests / 60 seconds |

When rate limited, the API returns HTTP 429 with a `Retry-After` header.

## Error Codes

| Status | Meaning |
|--------|---------|
| 400 | Bad request — invalid query or parameters |
| 401 | Unauthorized — missing or invalid API key |
| 422 | Validation error — check request body format |
| 429 | Rate limit exceeded — wait and retry |
| 500 | Internal server error |

Error response format:

```json
{
  "detail": "Missing X-API-Key header"
}
```

## Security Notes

- API keys are project-scoped — no cross-project access
- Screenshot URLs and file paths are never exposed
- Step descriptions and actions are returned, but not raw screenshot data
- Keys can be revoked instantly from the dashboard
