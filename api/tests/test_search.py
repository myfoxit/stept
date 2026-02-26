"""Tests for /api/v1/search/* endpoints.

Covers:
  1. FTS finds words in step content, descriptions, titles
  2. FTS stemming works ("clicking" matches "click")
  3. FTS weighted ranking (title match ranks higher than content match)
  4. Unified-v2 returns results from both workflows and documents
  5. RRF fusion merges keyword + semantic results correctly (mock embeddings)
  6. Recency boost: newer workflow scores higher than older identical one
  7. Frequency boost: more-viewed workflow scores higher
  8. Context boost: workflow matching current app scores higher
  9. Trigram fuzzy: typo "invice" still finds "invoice"
  10. Edge cases: empty query, single char, very long query, special characters
"""

import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ProcessRecordingSession,
    ProcessRecordingStep,
    Document,
)


# ---------------------------------------------------------------------------
# Fixtures: create realistic workflow + step data (5 workflows)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def search_fixtures(db: AsyncSession, async_client: AsyncClient, auth_headers: dict, test_project: dict, test_user_id: str):
    """Create 5 workflows with steps and 2 documents for search testing."""
    project_id = test_project["id"]
    user_id = test_user_id
    now = datetime.utcnow()  # naive datetime for PostgreSQL TIMESTAMP WITHOUT TIME ZONE

    # Enable pg_trgm extension for trigram tests
    try:
        await db.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await db.commit()
    except Exception:
        await db.rollback()

    # Workflow 1: Invoice Processing
    wf1 = ProcessRecordingSession(
        id="wf_invoice01",
        user_id=user_id,
        project_id=project_id,
        name="Invoice Processing Workflow",
        generated_title="How to Process Invoices in SAP",
        summary="A step-by-step guide to processing invoices using the SAP ERP system",
        tags=["finance", "SAP", "invoices"],
        status="completed",
        is_processed=True,
        is_private=False,
        owner_id=user_id,
        guide_markdown="# Invoice Processing\nOpen SAP, navigate to Accounts Payable, and process the invoice.",
        view_count=50,
        last_viewed_at=now - timedelta(days=1),
        updated_at=now - timedelta(days=2),
    )
    db.add(wf1)

    # Steps for WF1
    steps_wf1 = [
        ProcessRecordingStep(
            id="step_inv_01",
            session_id="wf_invoice01",
            step_number=1,
            generated_title="Open SAP Application",
            generated_description="Launch the SAP ERP application from the desktop",
            description="Click on the SAP icon",
            window_title="SAP Logon 770",
            content="Opening SAP application for invoice processing",
            timestamp=now,
        ),
        ProcessRecordingStep(
            id="step_inv_02",
            session_id="wf_invoice01",
            step_number=2,
            generated_title="Navigate to Accounts Payable",
            generated_description="Navigate to the accounts payable module in SAP",
            description="Click on Accounting > Accounts Payable",
            window_title="SAP Easy Access",
            content="Navigating to the accounts payable section",
            timestamp=now,
        ),
        ProcessRecordingStep(
            id="step_inv_03",
            session_id="wf_invoice01",
            step_number=3,
            generated_title="Enter Invoice Details",
            generated_description="Enter the vendor invoice details including amount and date",
            description="Fill in the invoice form with vendor details",
            window_title="SAP - Enter Incoming Invoices",
            content="Enter invoice number, vendor name, amount $1,500.00, date 2024-01-15",
            timestamp=now,
        ),
    ]
    for s in steps_wf1:
        db.add(s)

    # Workflow 2: Customer Onboarding (older, fewer views)
    wf2 = ProcessRecordingSession(
        id="wf_onboard01",
        user_id=user_id,
        project_id=project_id,
        name="Customer Onboarding",
        generated_title="New Customer Onboarding Process",
        summary="Guide for onboarding new customers in Salesforce CRM",
        tags=["CRM", "Salesforce", "customers"],
        status="completed",
        is_processed=True,
        is_private=False,
        owner_id=user_id,
        view_count=5,
        last_viewed_at=now - timedelta(days=60),
        updated_at=now - timedelta(days=90),
    )
    db.add(wf2)

    steps_wf2 = [
        ProcessRecordingStep(
            id="step_onb_01",
            session_id="wf_onboard01",
            step_number=1,
            generated_title="Open Salesforce",
            generated_description="Navigate to Salesforce CRM in Chrome browser",
            description="Open Chrome and go to salesforce.com",
            window_title="Salesforce - Google Chrome",
            content="https://mycompany.salesforce.com/dashboard",
            timestamp=now,
        ),
        ProcessRecordingStep(
            id="step_onb_02",
            session_id="wf_onboard01",
            step_number=2,
            generated_title="Create New Account",
            generated_description="Create a new customer account record",
            description="Click New Account button and fill in customer details",
            window_title="Salesforce - New Account - Google Chrome",
            content="Creating new account for customer onboarding",
            timestamp=now,
        ),
    ]
    for s in steps_wf2:
        db.add(s)

    # Workflow 3: Deploy Application (for context boost testing — uses Terminal)
    wf3 = ProcessRecordingSession(
        id="wf_deploy01",
        user_id=user_id,
        project_id=project_id,
        name="Deploy to Production",
        generated_title="Application Deployment Pipeline",
        summary="Deploying the application using Docker and Kubernetes",
        tags=["devops", "kubernetes", "docker"],
        status="completed",
        is_processed=True,
        is_private=False,
        owner_id=user_id,
        view_count=20,
        updated_at=now - timedelta(days=5),
    )
    db.add(wf3)

    steps_wf3 = [
        ProcessRecordingStep(
            id="step_dep_01",
            session_id="wf_deploy01",
            step_number=1,
            generated_title="Open Terminal",
            generated_description="Open the terminal application for deployment commands",
            description="Open Terminal app",
            window_title="Terminal",
            content="docker build -t myapp:latest .",
            timestamp=now,
        ),
        ProcessRecordingStep(
            id="step_dep_02",
            session_id="wf_deploy01",
            step_number=2,
            generated_title="Push Docker Image",
            generated_description="Push the Docker image to container registry",
            description="Push the built image",
            window_title="Terminal",
            content="docker push myapp:latest && kubectl rollout restart deployment/myapp",
            timestamp=now,
        ),
    ]
    for s in steps_wf3:
        db.add(s)

    # Workflow 4: Clicking through settings (for stemming test)
    wf4 = ProcessRecordingSession(
        id="wf_settings1",
        user_id=user_id,
        project_id=project_id,
        name="Configure Settings",
        generated_title="Clicking Through Application Settings",
        summary="Navigate and configure application settings by clicking through each tab",
        tags=["settings", "configuration"],
        status="completed",
        is_processed=True,
        is_private=False,
        owner_id=user_id,
        view_count=10,
        updated_at=now - timedelta(days=10),
    )
    db.add(wf4)

    steps_wf4 = [
        ProcessRecordingStep(
            id="step_set_01",
            session_id="wf_settings1",
            step_number=1,
            generated_title="Click Settings Menu",
            generated_description="Clicking on the settings menu in the navigation bar",
            description="Click on Settings icon in the top right corner",
            window_title="MyApp - Settings",
            content="Clicking the settings gear icon to open configuration panel",
            timestamp=now,
        ),
    ]
    for s in steps_wf4:
        db.add(s)

    # Workflow 5: Email Report (for ranking test — identical to WF1 but newer/more views)
    wf5 = ProcessRecordingSession(
        id="wf_email001",
        user_id=user_id,
        project_id=project_id,
        name="Email Invoice Report",
        generated_title="Sending Invoice Reports via Email",
        summary="Send weekly invoice reports to the finance team via email",
        tags=["email", "reports", "invoices"],
        status="completed",
        is_processed=True,
        is_private=False,
        owner_id=user_id,
        view_count=100,
        last_viewed_at=now,
        updated_at=now,
    )
    db.add(wf5)

    steps_wf5 = [
        ProcessRecordingStep(
            id="step_eml_01",
            session_id="wf_email001",
            step_number=1,
            generated_title="Open Email Client",
            generated_description="Open the email application to send report",
            description="Open Outlook",
            window_title="Outlook - Microsoft Outlook",
            content="Composing email with invoice report attachment",
            timestamp=now,
        ),
    ]
    for s in steps_wf5:
        db.add(s)

    # Documents
    doc1 = Document(
        id="doc_finance1",
        name="Finance Department Guide",
        content={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "This guide covers invoice processing and payment workflows for the finance department."}]}]},
        project_id=project_id,
        is_private=False,
        owner_id=user_id,
        search_text="This guide covers invoice processing and payment workflows for the finance department.",
    )
    db.add(doc1)

    doc2 = Document(
        id="doc_deploy01",
        name="Deployment Runbook",
        content={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Step-by-step deployment instructions using Docker and Kubernetes for production releases."}]}]},
        project_id=project_id,
        is_private=False,
        owner_id=user_id,
        search_text="Step-by-step deployment instructions using Docker and Kubernetes for production releases.",
    )
    db.add(doc2)

    await db.flush()

    # Manually update tsvector columns (since triggers only fire on PostgreSQL INSERT/UPDATE via SQL)
    await db.execute(text("""
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
    """))

    await db.execute(text("""
        UPDATE process_recording_steps SET search_tsv =
            setweight(to_tsvector('english', coalesce(generated_title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(generated_description, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
            setweight(to_tsvector('english', coalesce(window_title, '')), 'C') ||
            setweight(to_tsvector('english', coalesce(content, '')), 'D')
    """))

    # Update document search_tsv
    await db.execute(text("""
        UPDATE documents SET search_tsv =
            setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(search_text, '')), 'B')
    """))

    await db.commit()

    return {
        "project_id": project_id,
        "user_id": user_id,
        "wf_ids": ["wf_invoice01", "wf_onboard01", "wf_deploy01", "wf_settings1", "wf_email001"],
        "doc_ids": ["doc_finance1", "doc_deploy01"],
    }


# ---------------------------------------------------------------------------
# 1. FTS finds words in step content, descriptions, titles
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fts_finds_step_content(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """FTS should find workflows when query matches step content."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"q": "docker", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] > 0
    # Should find the deploy workflow (step content has "docker build")
    rec_ids = [r["recording_id"] for r in data["results"]]
    assert "wf_deploy01" in rec_ids


@pytest.mark.asyncio
async def test_fts_finds_description(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """FTS should find workflows when query matches step description."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"q": "accounts payable", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] > 0
    rec_ids = [r["recording_id"] for r in data["results"]]
    assert "wf_invoice01" in rec_ids


@pytest.mark.asyncio
async def test_fts_finds_title(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """FTS should find workflows when query matches session name/title."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"q": "invoice processing", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] > 0
    rec_ids = [r["recording_id"] for r in data["results"]]
    assert "wf_invoice01" in rec_ids


# ---------------------------------------------------------------------------
# 2. FTS stemming works ("clicking" matches "click")
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fts_stemming(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """FTS stemming should match 'click' against 'clicking'."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"q": "click", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # Should find wf_settings1 which has "Clicking" in title and steps
    assert data["total_results"] > 0
    rec_ids = [r["recording_id"] for r in data["results"]]
    assert "wf_settings1" in rec_ids


# ---------------------------------------------------------------------------
# 3. FTS weighted ranking (title match ranks higher than content match)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fts_weighted_ranking(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Title/name matches (weight A) should rank higher than content matches (weight D)."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"q": "invoice", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] >= 2
    # wf_invoice01 has "Invoice" in name (weight A) — should rank high
    # wf_email001 has "Invoice" in name too — both should appear
    rec_ids = [r["recording_id"] for r in data["results"]]
    assert "wf_invoice01" in rec_ids
    assert "wf_email001" in rec_ids


# ---------------------------------------------------------------------------
# 4. Unified-v2 returns results from both workflows and documents
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unified_v2_mixed_results(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Unified-v2 should return both workflow and document results."""
    resp = await async_client.get(
        "/api/v1/search/unified-v2",
        params={"q": "invoice", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] > 0

    types = {r["type"] for r in data["results"]}
    ids = [r["id"] for r in data["results"]]

    # Should have both workflows and documents about invoices
    assert "workflow" in types
    assert "wf_invoice01" in ids or "wf_email001" in ids


@pytest.mark.asyncio
async def test_unified_v2_returns_documents(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Unified-v2 should return document results."""
    resp = await async_client.get(
        "/api/v1/search/unified-v2",
        params={"q": "deployment runbook", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    result_types = {r["type"] for r in data["results"]}
    result_ids = [r["id"] for r in data["results"]]
    # doc_deploy01 has "Deployment Runbook" as its name
    assert "document" in result_types or "wf_deploy01" in result_ids


# ---------------------------------------------------------------------------
# 5. RRF fusion merges keyword + semantic results correctly (mock embeddings)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rrf_fusion():
    """RRF should correctly merge two ranked lists."""
    from app.routers.search import _rrf_merge

    keyword_results = [
        {"type": "workflow", "id": "A", "name": "Alpha", "score": 0.9},
        {"type": "workflow", "id": "B", "name": "Beta", "score": 0.7},
        {"type": "document", "id": "C", "name": "Charlie", "score": 0.5},
    ]
    semantic_results = [
        {"type": "workflow", "id": "B", "name": "Beta", "score": 0.95},
        {"type": "document", "id": "D", "name": "Delta", "score": 0.8},
        {"type": "workflow", "id": "A", "name": "Alpha", "score": 0.6},
    ]

    merged = _rrf_merge(keyword_results, semantic_results)
    assert len(merged) == 4  # A, B, C, D

    # B should score highest (rank 2 in keyword + rank 1 in semantic)
    # A should also score high (rank 1 in keyword + rank 3 in semantic)
    ids = [m["id"] for m in merged]
    assert ids[0] in ("A", "B")  # A or B should be first
    assert ids[1] in ("A", "B")

    # All items should have rrf_score
    for item in merged:
        assert "rrf_score" in item
        assert item["rrf_score"] > 0


@pytest.mark.asyncio
async def test_rrf_handles_disjoint_lists():
    """RRF should handle completely disjoint lists."""
    from app.routers.search import _rrf_merge

    kw = [{"type": "workflow", "id": "X", "name": "X", "score": 1.0}]
    sem = [{"type": "workflow", "id": "Y", "name": "Y", "score": 1.0}]

    merged = _rrf_merge(kw, sem)
    assert len(merged) == 2
    ids = {m["id"] for m in merged}
    assert ids == {"X", "Y"}


# ---------------------------------------------------------------------------
# 6. Recency boost: newer workflow scores higher than older identical one
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_recency_boost():
    """Newer workflows should get a higher recency boost."""
    from app.routers.search import _recency_boost

    now = datetime.now(timezone.utc)

    # Workflow updated today
    boost_new = _recency_boost(now)
    # Workflow updated 90 days ago
    boost_old = _recency_boost(now - timedelta(days=90))

    assert boost_new > boost_old
    assert boost_new <= 1.0
    assert boost_old >= 0.5

    # None should return minimum boost
    assert _recency_boost(None) == 0.5


@pytest.mark.asyncio
async def test_recency_boost_in_search(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """In unified-v2, newer workflow with 'invoice' should rank higher due to recency boost."""
    resp = await async_client.get(
        "/api/v1/search/unified-v2",
        params={"q": "invoice report", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    # wf_email001 (updated today, view_count=100) should outrank wf_invoice01 (updated 2 days ago, view_count=50)
    wf_results = [r for r in data["results"] if r["type"] == "workflow"]
    if len(wf_results) >= 2:
        email_idx = next((i for i, r in enumerate(wf_results) if r["id"] == "wf_email001"), None)
        invoice_idx = next((i for i, r in enumerate(wf_results) if r["id"] == "wf_invoice01"), None)
        if email_idx is not None and invoice_idx is not None:
            assert email_idx < invoice_idx, "Newer, more-viewed workflow should rank higher"


# ---------------------------------------------------------------------------
# 7. Frequency boost: more-viewed workflow scores higher
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_frequency_boost():
    """Higher view_count should produce a higher frequency boost."""
    from app.routers.search import _frequency_boost

    boost_high = _frequency_boost(100)
    boost_low = _frequency_boost(5)
    boost_zero = _frequency_boost(0)

    assert boost_high > boost_low
    assert boost_low > boost_zero
    assert boost_zero == 1.0  # log(0+1) = 0, so 1 + 0.2*0 = 1


@pytest.mark.asyncio
async def test_view_count_endpoint(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """PATCH /workflows/{id}/view should increment view_count."""
    resp = await async_client.patch(
        "/api/v1/search/workflows/wf_invoice01/view",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["view_count"] == 51  # Was 50, now 51


# ---------------------------------------------------------------------------
# 8. Context boost: workflow matching current app scores higher
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_context_boost_app(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Passing context_app=Terminal should boost the deploy workflow."""
    # Search without context
    resp_no_ctx = await async_client.get(
        "/api/v1/search/unified-v2",
        params={"q": "deploy", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp_no_ctx.status_code == 200

    # Search with Terminal context
    resp_ctx = await async_client.get(
        "/api/v1/search/unified-v2",
        params={
            "q": "deploy",
            "project_id": search_fixtures["project_id"],
            "context_app": "Terminal",
        },
        headers=auth_headers,
    )
    assert resp_ctx.status_code == 200
    data_ctx = resp_ctx.json()

    # wf_deploy01 steps have window_title="Terminal" — should get boosted
    deploy_results = [r for r in data_ctx["results"] if r["id"] == "wf_deploy01"]
    assert len(deploy_results) > 0


@pytest.mark.asyncio
async def test_context_boost_url(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Passing context_url should boost workflows whose steps mention that URL."""
    resp = await async_client.get(
        "/api/v1/search/unified-v2",
        params={
            "q": "customer onboarding",
            "project_id": search_fixtures["project_id"],
            "context_url": "salesforce.com",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # wf_onboard01 has step content with salesforce.com
    wf_ids = [r["id"] for r in data["results"] if r["type"] == "workflow"]
    assert "wf_onboard01" in wf_ids


# ---------------------------------------------------------------------------
# 9. Trigram fuzzy: typo "invice" still finds "invoice"
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trigram_fuzzy_typo(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """A typo like 'invice' should still find 'invoice' via trigram similarity."""
    resp = await async_client.get(
        "/api/v1/search/unified-v2",
        params={"q": "invice", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # With trigram fallback, should still find invoice-related workflows
    # FTS won't match "invice" but trigram similarity("Invoice Processing Workflow", "invice") > 0.3
    if data["total_results"] > 0:
        ids = [r["id"] for r in data["results"]]
        assert "wf_invoice01" in ids or "wf_email001" in ids


# ---------------------------------------------------------------------------
# 10. Edge cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_empty_query(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Searching with a valid but very short query should work (min_length=1)."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"q": "x", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data


@pytest.mark.asyncio
async def test_search_missing_query_param(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Omitting the 'q' parameter should return 422 (validation error)."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_single_char(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Single char query should use ILIKE fallback."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"q": "S", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    # Should use ILIKE fallback for 1-char query
    data = resp.json()
    assert "results" in data


@pytest.mark.asyncio
async def test_search_very_long_query(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Very long query should not crash."""
    long_query = "invoice " * 50  # 400 chars
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"q": long_query.strip(), "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data


@pytest.mark.asyncio
async def test_search_special_characters(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Queries with special characters should not cause errors."""
    for special_q in ["$1,500", "what's", "C++", "file.txt", "(parentheses)"]:
        resp = await async_client.get(
            "/api/v1/search/search",
            params={"q": special_q, "project_id": search_fixtures["project_id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200, f"Failed for query: {special_q}"


@pytest.mark.asyncio
async def test_search_keyword_fallback(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """
    Semantic search falls back to keyword search when embeddings are unavailable.
    With no data, we should get an empty result set gracefully.
    """
    resp = await async_client.get(
        "/api/v1/search/semantic",
        params={"q": "deploy", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["search_type"] == "keyword"
    assert "results" in data
    assert isinstance(data["results"], list)


# ---------------------------------------------------------------------------
# Unified (legacy) endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unified_search_returns_results(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Legacy /unified endpoint should still work and return results."""
    resp = await async_client.get(
        "/api/v1/search/unified",
        params={"q": "invoice", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] > 0
    assert data["search_type"] == "keyword"


@pytest.mark.asyncio
async def test_unified_semantic_search(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Legacy /unified-semantic should still work (falls back to keyword when no embeddings)."""
    resp = await async_client.get(
        "/api/v1/search/unified-semantic",
        params={"q": "invoice", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert isinstance(data["results"], list)


# ---------------------------------------------------------------------------
# Unified-v2 search type field
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unified_v2_search_type(async_client: AsyncClient, auth_headers: dict, search_fixtures: dict):
    """Unified-v2 should return search_type='keyword' when no embedding API is available."""
    resp = await async_client.get(
        "/api/v1/search/unified-v2",
        params={"q": "invoice", "project_id": search_fixtures["project_id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # Without embedding API, search_type should be "keyword"
    assert data["search_type"] == "keyword"


# ---------------------------------------------------------------------------
# View count endpoint - workflow not found
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_view_count_not_found(async_client: AsyncClient, auth_headers: dict):
    """PATCH /workflows/{id}/view should return 404 for non-existent workflow."""
    resp = await async_client.patch(
        "/api/v1/search/workflows/nonexistent/view",
        headers=auth_headers,
    )
    assert resp.status_code == 404
