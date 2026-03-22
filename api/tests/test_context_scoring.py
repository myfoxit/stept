"""
Unit tests for the context link scoring service (app/services/context_scoring.py).
"""

import pytest
from app.services.context_scoring import (
    ScoringContext,
    BaseWeightScorer,
    ClickCountScorer,
    ResourcePopularityScorer,
    AlreadyViewedPenalty,
    OnboardingBooster,
    compute_final_score,
)


def _ctx(**overrides) -> ScoringContext:
    """Create a ScoringContext with sensible defaults."""
    defaults = {
        "base_weight": 100.0,
        "source": "auto",
        "context_click_count": 0,
        "resource_total_views": 0,
        "user_has_viewed": False,
        "user_onboarding_complete": False,
    }
    defaults.update(overrides)
    return ScoringContext(**defaults)


# ─────────────────── BaseWeightScorer ───────────────────────────


def test_base_weight_scorer_returns_base_weight():
    scorer = BaseWeightScorer()
    assert scorer.score(_ctx(base_weight=1000.0)) == 1000.0
    assert scorer.score(_ctx(base_weight=100.0)) == 100.0
    assert scorer.score(_ctx(base_weight=0.0)) == 0.0


# ─────────────────── ClickCountScorer ───────────────────────────


def test_click_count_scorer_formula():
    scorer = ClickCountScorer()
    assert scorer.score(_ctx(context_click_count=0)) == 0
    assert scorer.score(_ctx(context_click_count=1)) == 20
    assert scorer.score(_ctx(context_click_count=5)) == 100
    assert scorer.score(_ctx(context_click_count=10)) == 200


def test_click_count_scorer_capped_at_200():
    scorer = ClickCountScorer()
    assert scorer.score(_ctx(context_click_count=15)) == 200
    assert scorer.score(_ctx(context_click_count=100)) == 200


# ─────────────────── ResourcePopularityScorer ───────────────────────────


def test_resource_popularity_scorer_formula():
    scorer = ResourcePopularityScorer()
    assert scorer.score(_ctx(resource_total_views=0)) == 0
    assert scorer.score(_ctx(resource_total_views=10)) == 20
    assert scorer.score(_ctx(resource_total_views=25)) == 50


def test_resource_popularity_scorer_capped_at_50():
    scorer = ResourcePopularityScorer()
    assert scorer.score(_ctx(resource_total_views=30)) == 50
    assert scorer.score(_ctx(resource_total_views=1000)) == 50


# ─────────────────── AlreadyViewedPenalty ───────────────────────────


def test_already_viewed_penalty_when_viewed():
    scorer = AlreadyViewedPenalty()
    assert scorer.score(_ctx(user_has_viewed=True)) == -15


def test_already_viewed_penalty_when_not_viewed():
    scorer = AlreadyViewedPenalty()
    assert scorer.score(_ctx(user_has_viewed=False)) == 0


# ─────────────────── OnboardingBooster ───────────────────────────


def test_onboarding_booster_placeholder():
    scorer = OnboardingBooster()
    assert scorer.score(_ctx()) == 0


# ─────────────────── compute_final_score ───────────────────────────


def test_compute_final_score_sums_all_scorers():
    ctx = _ctx(base_weight=1000.0, context_click_count=5, resource_total_views=10)
    score = compute_final_score(ctx)
    # BaseWeight=1000 + ClickCount=100 + Popularity=20 + ViewedPenalty=0 + Onboarding=0
    assert score == 1120.0


def test_compute_final_score_with_viewed_penalty():
    ctx = _ctx(base_weight=100.0, context_click_count=0, resource_total_views=0, user_has_viewed=True)
    score = compute_final_score(ctx)
    # BaseWeight=100 + ClickCount=0 + Popularity=0 + ViewedPenalty=-15 + Onboarding=0
    assert score == 85.0


def test_user_links_outscore_auto_links():
    """User links (weight=1000) should outscore auto links (weight=100) by default."""
    user_ctx = _ctx(base_weight=1000.0, source="user")
    auto_ctx = _ctx(base_weight=100.0, source="auto")
    assert compute_final_score(user_ctx) > compute_final_score(auto_ctx)


def test_auto_link_with_clicks_still_below_user_link():
    """Even with max clicks, an auto link shouldn't outscore a fresh user link."""
    user_ctx = _ctx(base_weight=1000.0, source="user", context_click_count=0)
    auto_ctx = _ctx(base_weight=100.0, source="auto", context_click_count=100)
    # User: 1000 + 0 = 1000, Auto: 100 + 200 = 300
    assert compute_final_score(user_ctx) > compute_final_score(auto_ctx)
