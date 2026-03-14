"""
Playwright Verification Worker — Background task that processes verification jobs.

Polls the verification_jobs table for queued jobs, launches headless Playwright,
runs the 6-level element finder cascade on each workflow step, and records results.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import traceback
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import (
    ProcessRecordingSession,
    ProcessRecordingStep,
    VerificationConfig,
    VerificationJob,
    WorkflowStepCheck,
)
from app.services.crypto import decrypt
from app.services.staleness import (
    update_step_reliability,
    recalculate_health_score,
    maybe_create_alerts,
)
from app.utils import gen_suffix

logger = logging.getLogger(__name__)

# How often to poll for new jobs (seconds)
POLL_INTERVAL = 10

# Whether the worker loop is running
_running = False


# ---------------------------------------------------------------------------
# Element finder cascade (6 levels) — injected into page.evaluate()
# ---------------------------------------------------------------------------

ELEMENT_FINDER_JS = """
(elementInfo) => {
    const result = { found: false, method: null, confidence: 0 };
    if (!elementInfo) return result;

    // 1. CSS selector → confidence 1.0
    if (elementInfo.selector) {
        try {
            const el = document.querySelector(elementInfo.selector);
            if (el) return { found: true, method: 'selector', confidence: 1.0 };
        } catch (e) {}
    }

    // 2. data-testid / data-test / data-cy → confidence 0.95
    if (elementInfo.testId) {
        const el = document.querySelector(
            `[data-testid="${elementInfo.testId}"], [data-test="${elementInfo.testId}"], [data-cy="${elementInfo.testId}"]`
        );
        if (el) return { found: true, method: 'testid', confidence: 0.95 };
    }

    // 3. ARIA role + text → confidence 0.85
    if (elementInfo.role && elementInfo.text) {
        const candidates = document.querySelectorAll(`[role="${elementInfo.role}"]`);
        for (const el of candidates) {
            const elText = (el.textContent || '').trim();
            if (elText && elText.includes(elementInfo.text.trim())) {
                return { found: true, method: 'role+text', confidence: 0.85 };
            }
        }
    }

    // 4. Tag + text (fuzzy) → confidence 0.7
    if (elementInfo.tagName && elementInfo.text) {
        const tag = elementInfo.tagName.toLowerCase();
        const candidates = document.querySelectorAll(tag);
        const searchText = elementInfo.text.trim().toLowerCase();
        for (const el of candidates) {
            const elText = (el.textContent || '').trim().toLowerCase();
            if (elText && (elText.includes(searchText) || searchText.includes(elText))) {
                return { found: true, method: 'tag+text', confidence: 0.7 };
            }
        }
    }

    // 5. XPath → confidence 0.6
    if (elementInfo.xpath) {
        try {
            const xpResult = document.evaluate(
                elementInfo.xpath, document, null,
                XPathResult.FIRST_ORDERED_NODE_TYPE, null
            );
            if (xpResult.singleNodeValue) {
                return { found: true, method: 'xpath', confidence: 0.6 };
            }
        } catch (e) {}
    }

    // 6. Parent chain context → confidence 0.5
    if (elementInfo.parentChain && Array.isArray(elementInfo.parentChain) && elementInfo.parentChain.length > 0) {
        // Walk up from the deepest parent and look for text/tag matches
        const chain = elementInfo.parentChain;
        const deepest = chain[chain.length - 1];
        if (deepest) {
            const tag = (deepest.tagName || deepest.tag || '').toLowerCase();
            const text = (deepest.text || deepest.textContent || '').trim().toLowerCase();
            if (tag) {
                const candidates = document.querySelectorAll(tag);
                for (const el of candidates) {
                    const elText = (el.textContent || '').trim().toLowerCase();
                    if (text && elText.includes(text)) {
                        return { found: true, method: 'parent-context', confidence: 0.5 };
                    }
                }
            }
        }
    }

    return result;
}
"""


# ---------------------------------------------------------------------------
# LLM verification fallback
# ---------------------------------------------------------------------------

async def _llm_verify_screenshot(
    screenshot_bytes: bytes,
    step_description: str,
    element_info: dict,
) -> tuple[Optional[bool], Optional[str]]:
    """
    Use LLM vision to verify if an element is visually present on the page.
    Returns (visible: bool | None, explanation: str | None).
    Returns (None, None) if no API key is configured.
    """
    try:
        from app.services.llm import _api_key, _provider, _base_url, _model
        import httpx

        api_key = _api_key()
        if not api_key:
            return None, None

        provider = _provider()
        b64_image = base64.b64encode(screenshot_bytes).decode()

        prompt = (
            f"Look at this screenshot and determine if the following UI element is visible:\n"
            f"- Element type: {element_info.get('tagName', 'unknown')}\n"
            f"- Text: {element_info.get('text', 'N/A')}\n"
            f"- Role: {element_info.get('role', 'N/A')}\n"
            f"- Description: {step_description or 'N/A'}\n\n"
            f"Reply with a JSON object: {{\"visible\": true/false, \"explanation\": \"brief reason\"}}"
        )

        if provider == "anthropic":
            base_url = _base_url()
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{base_url}/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": _model(),
                        "max_tokens": 256,
                        "messages": [{
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/png",
                                        "data": b64_image,
                                    },
                                },
                                {"type": "text", "text": prompt},
                            ],
                        }],
                    },
                )
                if resp.status_code != 200:
                    logger.warning("LLM verification failed: %s", resp.text[:200])
                    return None, None
                data = resp.json()
                text = data.get("content", [{}])[0].get("text", "")
        else:
            # OpenAI-compatible
            base_url = _base_url()
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{base_url}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": _model(),
                        "max_tokens": 256,
                        "messages": [{
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/png;base64,{b64_image}"},
                                },
                                {"type": "text", "text": prompt},
                            ],
                        }],
                    },
                )
                if resp.status_code != 200:
                    logger.warning("LLM verification failed: %s", resp.text[:200])
                    return None, None
                data = resp.json()
                text = data["choices"][0]["message"]["content"]

        # Parse response
        import json as json_mod
        # Try to extract JSON from the response
        try:
            # Handle markdown code blocks
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
                clean = clean.rsplit("```", 1)[0]
            parsed = json_mod.loads(clean)
            return parsed.get("visible"), parsed.get("explanation")
        except (json_mod.JSONDecodeError, KeyError):
            # Fallback: look for keywords
            lower = text.lower()
            if "visible" in lower and "not" not in lower.split("visible")[0][-10:]:
                return True, text[:200]
            elif "not visible" in lower or "not found" in lower or "cannot see" in lower:
                return False, text[:200]
            return None, text[:200]

    except Exception as e:
        logger.warning("LLM verification error: %s", e)
        return None, None


# ---------------------------------------------------------------------------
# Core verification logic
# ---------------------------------------------------------------------------

async def _login_if_configured(page, vc: VerificationConfig) -> bool:
    """
    Attempt to log in using the verification config credentials.
    Returns True if login was performed (or not needed), False on failure.
    """
    if not vc.login_url or not vc.encrypted_email or not vc.encrypted_password:
        return True  # No login configured — skip

    email = decrypt(vc.encrypted_email)
    password = decrypt(vc.encrypted_password)

    if not email or not password:
        logger.warning("Could not decrypt credentials for config %s", vc.id)
        return False

    try:
        await page.goto(vc.login_url, wait_until="networkidle", timeout=30000)

        # Use configured selectors or auto-detect
        email_sel = vc.email_selector or 'input[type="email"], input[name="email"], input[name="username"], input#email, input#username'
        password_sel = vc.password_selector or 'input[type="password"], input[name="password"], input#password'
        submit_sel = vc.submit_selector or 'button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")'

        # Fill email
        email_field = await page.query_selector(email_sel)
        if not email_field:
            logger.warning("Email field not found with selector: %s", email_sel)
            return False
        await email_field.fill(email)

        # Fill password
        password_field = await page.query_selector(password_sel)
        if not password_field:
            logger.warning("Password field not found with selector: %s", password_sel)
            return False
        await password_field.fill(password)

        # Submit
        submit_btn = await page.query_selector(submit_sel)
        if submit_btn:
            await submit_btn.click()
        else:
            # Try pressing Enter on the password field
            await password_field.press("Enter")

        # Wait for navigation
        wait_ms = vc.post_login_wait_ms or 2000
        await page.wait_for_timeout(wait_ms)

        return True
    except Exception as e:
        logger.error("Login failed: %s", e)
        return False


async def _verify_workflow_steps(
    page,
    workflow_id: str,
    steps: list[ProcessRecordingStep],
    db: AsyncSession,
    llm_enabled: bool = False,
) -> dict:
    """
    Verify each step in a workflow by navigating to its URL and running
    the element finder cascade. Returns a summary dict.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    results = {"total": len(steps), "passed": 0, "failed": 0, "skipped": 0}
    current_url = None

    for step in steps:
        step_url = step.url
        element_info = step.element_info or {}

        # Skip steps without URL or element info
        if not step_url and not element_info:
            results["skipped"] += 1
            check = WorkflowStepCheck(
                id=gen_suffix(16),
                workflow_id=workflow_id,
                step_number=step.step_number,
                check_source="scheduled",
                element_found=None,
                status="skipped",
                checked_at=now,
            )
            db.add(check)
            continue

        # Navigate if URL changed
        if step_url and step_url != current_url:
            try:
                await page.goto(step_url, wait_until="domcontentloaded", timeout=30000)
                current_url = step_url
                # Small wait for dynamic content
                await page.wait_for_timeout(1000)
            except Exception as e:
                logger.warning("URL navigation failed for step %d: %s", step.step_number, e)
                results["failed"] += 1
                check = WorkflowStepCheck(
                    id=gen_suffix(16),
                    workflow_id=workflow_id,
                    step_number=step.step_number,
                    check_source="scheduled",
                    element_found=False,
                    expected_url=step_url,
                    actual_url=None,
                    url_matched=False,
                    status="url_error",
                    checked_at=now,
                )
                db.add(check)
                await update_step_reliability(db, workflow_id, step.step_number, found=False, method=None)
                continue

        # Run element finder cascade
        if element_info:
            try:
                finder_result = await page.evaluate(ELEMENT_FINDER_JS, element_info)
            except Exception as e:
                logger.warning("Element finder failed for step %d: %s", step.step_number, e)
                finder_result = {"found": False, "method": None, "confidence": 0}
        else:
            finder_result = {"found": False, "method": None, "confidence": 0}

        element_found = finder_result.get("found", False)
        finder_method = finder_result.get("method")
        finder_confidence = finder_result.get("confidence", 0)

        # URL check
        actual_url = page.url if step_url else None
        url_matched = None
        if step_url and actual_url:
            # Loose match: same origin + pathname
            from urllib.parse import urlparse
            expected_parsed = urlparse(step_url)
            actual_parsed = urlparse(actual_url)
            url_matched = (
                expected_parsed.netloc == actual_parsed.netloc
                and expected_parsed.path.rstrip("/") == actual_parsed.path.rstrip("/")
            )

        # LLM fallback for failed reliable steps
        llm_visible = None
        llm_explanation = None
        if not element_found and llm_enabled and element_info:
            try:
                screenshot_bytes = await page.screenshot(type="png")
                llm_visible, llm_explanation = await _llm_verify_screenshot(
                    screenshot_bytes,
                    step.description or step.generated_description or "",
                    element_info,
                )
            except Exception as e:
                logger.warning("LLM verification screenshot failed: %s", e)

        status = "passed" if element_found else "failed"
        if element_found:
            results["passed"] += 1
        else:
            results["failed"] += 1

        check = WorkflowStepCheck(
            id=gen_suffix(16),
            workflow_id=workflow_id,
            step_number=step.step_number,
            check_source="scheduled",
            element_found=element_found,
            finder_method=finder_method,
            finder_confidence=finder_confidence,
            expected_url=step_url,
            actual_url=actual_url,
            url_matched=url_matched,
            status=status,
            llm_visible=llm_visible,
            llm_explanation=llm_explanation,
            checked_at=now,
        )
        db.add(check)

        await update_step_reliability(
            db, workflow_id, step.step_number,
            found=element_found,
            method=finder_method,
        )

    return results


# ---------------------------------------------------------------------------
# Process a single verification job
# ---------------------------------------------------------------------------

async def _process_job(job_id: str) -> None:
    """Process a single verification job end-to-end."""
    async with AsyncSessionLocal() as db:
        job = await db.get(VerificationJob, job_id)
        if not job or job.status != "queued":
            return

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        job.status = "running"
        job.started_at = now
        await db.commit()

        try:
            # Load verification config
            vc_result = await db.execute(
                select(VerificationConfig).where(
                    VerificationConfig.project_id == job.project_id
                )
            )
            vc = vc_result.scalar_one_or_none()

            # Determine workflow IDs
            workflow_ids = job.workflow_ids or []
            if workflow_ids == ["*"]:
                wf_result = await db.execute(
                    select(ProcessRecordingSession.id).where(
                        ProcessRecordingSession.project_id == job.project_id,
                        ProcessRecordingSession.deleted_at.is_(None),
                    )
                )
                workflow_ids = [row[0] for row in wf_result.all()]

            total_workflows = len(workflow_ids)
            all_results = {}
            completed = 0

            # Launch Playwright
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 720},
                    ignore_https_errors=True,
                )
                page = await context.new_page()

                # Login if configured
                login_ok = True
                if vc:
                    login_ok = await _login_if_configured(page, vc)

                if not login_ok:
                    job.status = "failed"
                    job.error = "Login failed — check credentials and selectors"
                    job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    await db.commit()
                    await browser.close()
                    return

                llm_enabled = vc.llm_enabled if vc else False

                for wf_id in workflow_ids:
                    # Re-check job status (might be cancelled)
                    await db.refresh(job)
                    if job.status == "cancelled":
                        await browser.close()
                        return

                    # Load workflow steps
                    steps_result = await db.execute(
                        select(ProcessRecordingStep)
                        .where(ProcessRecordingStep.session_id == wf_id)
                        .order_by(ProcessRecordingStep.step_number)
                    )
                    steps = steps_result.scalars().all()

                    if not steps:
                        completed += 1
                        continue

                    wf_results = await _verify_workflow_steps(
                        page, wf_id, steps, db, llm_enabled=llm_enabled
                    )
                    all_results[wf_id] = wf_results

                    # Update workflow verification timestamp
                    wf = await db.get(ProcessRecordingSession, wf_id)
                    if wf:
                        wf.last_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
                        wf.last_verified_source = "scheduled"

                    # Recalculate health score
                    await recalculate_health_score(db, wf_id)

                    # Maybe create alerts
                    if wf and wf.project_id:
                        await maybe_create_alerts(db, wf_id, wf.project_id)

                    completed += 1
                    job.progress = {"total": total_workflows, "completed": completed}
                    await db.commit()

                await browser.close()

            # Summarize results
            total_passed = sum(r.get("passed", 0) for r in all_results.values())
            total_failed = sum(r.get("failed", 0) for r in all_results.values())
            total_skipped = sum(r.get("skipped", 0) for r in all_results.values())

            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            job.results = {
                "workflows_verified": len(all_results),
                "total_steps": total_passed + total_failed + total_skipped,
                "passed": total_passed,
                "failed": total_failed,
                "skipped": total_skipped,
                "per_workflow": all_results,
            }
            job.progress = {"total": total_workflows, "completed": total_workflows}

            # Update verification config
            if vc:
                vc.last_run_at = job.completed_at
                vc.last_run_status = "completed"
                vc.last_run_stats = {
                    "workflows": len(all_results),
                    "passed": total_passed,
                    "failed": total_failed,
                    "skipped": total_skipped,
                }

            await db.commit()

        except Exception as e:
            logger.error("Verification job %s failed: %s", job_id, traceback.format_exc())
            job.status = "failed"
            job.error = str(e)[:1000]
            job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)

            # Update verification config with failure
            try:
                vc_result = await db.execute(
                    select(VerificationConfig).where(
                        VerificationConfig.project_id == job.project_id
                    )
                )
                vc = vc_result.scalar_one_or_none()
                if vc:
                    vc.last_run_at = job.completed_at
                    vc.last_run_status = "failed"
            except Exception:
                pass

            await db.commit()


# ---------------------------------------------------------------------------
# Worker loop
# ---------------------------------------------------------------------------

async def verification_worker_loop() -> None:
    """
    Background worker loop that polls for queued verification jobs.
    Runs as an asyncio task started during app lifespan.
    """
    global _running
    _running = True
    logger.info("Verification worker started")

    while _running:
        try:
            async with AsyncSessionLocal() as db:
                # Pick up the oldest queued job
                result = await db.execute(
                    select(VerificationJob)
                    .where(VerificationJob.status == "queued")
                    .order_by(VerificationJob.created_at.asc())
                    .limit(1)
                )
                job = result.scalar_one_or_none()

            if job:
                logger.info("Processing verification job %s", job.id)
                await _process_job(job.id)
            else:
                await asyncio.sleep(POLL_INTERVAL)

        except asyncio.CancelledError:
            logger.info("Verification worker cancelled")
            break
        except Exception as e:
            logger.error("Verification worker error: %s", e)
            await asyncio.sleep(POLL_INTERVAL)

    _running = False
    logger.info("Verification worker stopped")


def stop_worker() -> None:
    """Signal the worker loop to stop."""
    global _running
    _running = False
