"""
Context link scoring service.

Architecture
------------
Each Scorer is a small class implementing .score(ScoringContext) -> float.
SCORER_REGISTRY lists all active scorers.
compute_final_score() sums their contributions to produce a final ranking score.

Weight conventions
------------------
- User-defined links:  base_weight = 1000.0
- Auto-added links:    base_weight =  100.0
- Scorer bonuses are additive and typically in the 0–200 range.
- Only relative ordering matters — absolute values are never exposed to users.

Extending
---------
To add a new heuristic:
  1. Create a class with scorer_weight: float and score(ctx) -> float.
  2. Append an instance to SCORER_REGISTRY below.
  3. Populate the relevant ScoringContext field in the match endpoint.

ScoringContext fields that are not yet populated default to neutral values
(0 / False) so new scorers can be wired up incrementally without breaking
existing behaviour.
"""
from __future__ import annotations

from dataclasses import dataclass


# ── Scoring context ───────────────────────────────────────────────────────────

@dataclass
class ScoringContext:
    """
    All data a scorer could need for a single (link, user, request) combination.
    Populated by the match endpoint before scoring; missing data stays at the
    safe defaults below.
    """

    # ── From the ContextLink row ──
    base_weight: float          # ContextLink.weight (1000 user / 100 auto)
    source: str                 # "user" | "auto"
    context_click_count: int    # How often this specific link was clicked in context

    # ── Resource signals ─────────────────────────────────────────────────────
    # Total views of this resource across all users in the project.
    resource_total_views: int = 0

    # Has THIS user ever opened this resource?
    user_has_viewed: bool = False

    # ── User state signals ────────────────────────────────────────────────────
    # Has the requesting user completed onboarding?
    # When False, onboarding-tagged resources receive an extra boost (future).
    user_onboarding_complete: bool = False


# ── Scorer implementations ────────────────────────────────────────────────────

class BaseWeightScorer:
    """
    Identity scorer — returns the link's configured base weight unchanged.
    This is the primary driver of user-vs-auto ordering.
    """
    scorer_weight: float = 1.0

    def score(self, ctx: ScoringContext) -> float:
        return ctx.base_weight


class ClickCountScorer:
    """
    Boost based on how often THIS specific context link was clicked.
    Strong revealed-preference signal: the user chose this resource in this
    context before.  Capped at +200 to avoid runaway dominance over base weight.
    """
    scorer_weight: float = 0.8

    def score(self, ctx: ScoringContext) -> float:
        return min(ctx.context_click_count * 20, 200)


class ResourcePopularityScorer:
    """
    Weak boost based on total resource views across the project.
    Popular resources are more likely to be the canonical answer.
    Capped at +50 so it can't override user-defined ordering.
    """
    scorer_weight: float = 0.2

    def score(self, ctx: ScoringContext) -> float:
        return min(ctx.resource_total_views * 2, 50)


class AlreadyViewedPenalty:
    """
    Slight penalty if the user has already viewed this resource.
    Rationale: if they've read it, surfacing it again is slightly less useful.
    Set scorer_weight = 0 to disable if you prefer neutral behaviour.
    """
    scorer_weight: float = 0.1

    def score(self, ctx: ScoringContext) -> float:
        return -15 if ctx.user_has_viewed else 0


class OnboardingBooster:
    """
    Placeholder: boost onboarding resources for users who haven't finished
    onboarding.  Currently returns 0 — wire up when resource tagging lands.

    To activate:
      1. Add an 'onboarding' tag to resources.
      2. Populate ScoringContext.user_onboarding_complete.
      3. Replace `return 0` with the boost logic below.
    """
    scorer_weight: float = 0.3

    def score(self, ctx: ScoringContext) -> float:
        # TODO: check resource tags once tagging feature ships.
        # return 100 if not ctx.user_onboarding_complete and resource_is_onboarding else 0
        return 0


# ── Registry ──────────────────────────────────────────────────────────────────
# Add new scorer instances here.  Order doesn't matter — all are summed.

SCORER_REGISTRY: list = [
    BaseWeightScorer(),
    ClickCountScorer(),
    ResourcePopularityScorer(),
    AlreadyViewedPenalty(),
    OnboardingBooster(),
]


def compute_final_score(ctx: ScoringContext) -> float:
    """Return the summed score for a single context link match."""
    return sum(s.score(ctx) for s in SCORER_REGISTRY)
