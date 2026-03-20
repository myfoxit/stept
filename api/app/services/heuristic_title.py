"""
Heuristic title and icon generation — no AI needed.

Generates a descriptive workflow title from step metadata (URLs, page titles,
element info) and extracts favicon URLs from the most common domain.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Optional
from urllib.parse import urlparse


def generate_heuristic_title(steps: list) -> Optional[str]:
    """Generate a descriptive title from step metadata without AI.
    
    Strategy:
    1. Find the most common domain/app across steps
    2. Find the most descriptive action (first click with a good label)
    3. Combine: "Action in App" pattern
    """
    if not steps:
        return None

    # Collect domains and app names
    domains: list[str] = []
    app_names: list[str] = []
    actions: list[str] = []
    window_titles: list[str] = []

    for step in steps:
        url = getattr(step, 'url', None) or ''
        if url:
            try:
                parsed = urlparse(url)
                domain = parsed.hostname or ''
                # Clean domain: remove www, common TLDs for display
                domain = re.sub(r'^www\.', '', domain)
                if domain:
                    domains.append(domain)
            except Exception:
                pass

        app = getattr(step, 'owner_app', None)
        if app:
            app_names.append(app)

        wt = getattr(step, 'window_title', None)
        if wt:
            window_titles.append(wt)

        # Collect meaningful action descriptions
        action_type = getattr(step, 'action_type', '') or ''
        ei = getattr(step, 'element_info', None) or {}
        if isinstance(ei, dict):
            label = (ei.get('ariaLabel') or ei.get('title') or 
                     ei.get('associatedLabel') or ei.get('text') or '')
            label = label.strip()[:60]
            if label and action_type.lower() in ('left click', 'click'):
                actions.append(label)

    # Find primary app/domain
    primary_app = None
    if domains:
        # Most common domain
        domain_counts = Counter(domains)
        top_domain = domain_counts.most_common(1)[0][0]
        # Make it pretty
        primary_app = _prettify_domain(top_domain)
    elif app_names:
        app_counts = Counter(app_names)
        primary_app = app_counts.most_common(1)[0][0]

    # Find primary action
    primary_action = None
    if actions:
        # First meaningful action is often the best
        primary_action = actions[0]
    elif window_titles:
        # Use the most common/descriptive window title
        # Filter out generic titles
        good_titles = [t for t in window_titles if not _is_generic_title(t)]
        if good_titles:
            title_counts = Counter(good_titles)
            primary_action = title_counts.most_common(1)[0][0]
            # Truncate long titles
            if len(primary_action) > 50:
                primary_action = primary_action[:47] + '...'

    # Build title
    if primary_action and primary_app:
        return f"{primary_action} in {primary_app}"
    elif primary_action:
        return primary_action
    elif primary_app:
        step_count = len(steps)
        return f"Workflow in {primary_app} ({step_count} steps)"
    
    return None


def extract_favicon_icon(steps: list) -> tuple[Optional[str], Optional[str]]:
    """Extract favicon URL from the most common domain in steps.
    
    Returns (icon_type, icon_value) tuple.
    """
    domains: list[str] = []
    
    for step in steps:
        url = getattr(step, 'url', None) or ''
        if url:
            try:
                parsed = urlparse(url)
                if parsed.hostname:
                    domains.append(parsed.hostname)
            except Exception:
                pass

    if not domains:
        return (None, None)

    domain_counts = Counter(domains)
    top_domain = domain_counts.most_common(1)[0][0]
    
    # Use Google's favicon service (reliable, always works)
    favicon_url = f"https://www.google.com/s2/favicons?domain={top_domain}&sz=64"
    
    return ("favicon", favicon_url)


# ── Helpers ──────────────────────────────────────────────────────────

_DOMAIN_PRETTY = {
    'google.com': 'Google',
    'google.de': 'Google',
    'google.at': 'Google',
    'github.com': 'GitHub',
    'gitlab.com': 'GitLab',
    'stackoverflow.com': 'Stack Overflow',
    'openai.com': 'OpenAI',
    'platform.openai.com': 'OpenAI Platform',
    'chat.openai.com': 'ChatGPT',
    'chatgpt.com': 'ChatGPT',
    'slack.com': 'Slack',
    'notion.so': 'Notion',
    'figma.com': 'Figma',
    'jira.atlassian.net': 'Jira',
    'confluence.atlassian.net': 'Confluence',
    'trello.com': 'Trello',
    'linear.app': 'Linear',
    'vercel.com': 'Vercel',
    'aws.amazon.com': 'AWS',
    'console.aws.amazon.com': 'AWS Console',
    'portal.azure.com': 'Azure Portal',
    'console.cloud.google.com': 'Google Cloud',
    'app.hubspot.com': 'HubSpot',
    'salesforce.com': 'Salesforce',
    'docs.google.com': 'Google Docs',
    'sheets.google.com': 'Google Sheets',
    'drive.google.com': 'Google Drive',
    'mail.google.com': 'Gmail',
    'calendar.google.com': 'Google Calendar',
    'youtube.com': 'YouTube',
    'linkedin.com': 'LinkedIn',
    'twitter.com': 'Twitter',
    'x.com': 'X',
    'facebook.com': 'Facebook',
    'instagram.com': 'Instagram',
    'reddit.com': 'Reddit',
    'wikipedia.org': 'Wikipedia',
    'en.wikipedia.org': 'Wikipedia',
    'de.wikipedia.org': 'Wikipedia',
    'medium.com': 'Medium',
    'airtable.com': 'Airtable',
    'monday.com': 'Monday.com',
    'asana.com': 'Asana',
    'zapier.com': 'Zapier',
    'stripe.com': 'Stripe',
    'dashboard.stripe.com': 'Stripe Dashboard',
}


def _prettify_domain(domain: str) -> str:
    """Convert a domain to a pretty display name."""
    # Check exact match first
    if domain in _DOMAIN_PRETTY:
        return _DOMAIN_PRETTY[domain]
    
    # Check if it's a subdomain of a known domain
    for known, pretty in _DOMAIN_PRETTY.items():
        if domain.endswith('.' + known):
            return pretty
    
    # Fallback: capitalize domain parts
    # e.g. "app.example.com" → "Example"
    parts = domain.replace('www.', '').split('.')
    if len(parts) >= 2:
        return parts[-2].capitalize()
    return domain.capitalize()


def _is_generic_title(title: str) -> bool:
    """Check if a window title is too generic to be useful."""
    generic = {
        'new tab', 'untitled', 'google', 'bing', 'search',
        'home', 'dashboard', 'loading', 'about:blank',
    }
    lower = title.strip().lower()
    return lower in generic or len(lower) < 3
