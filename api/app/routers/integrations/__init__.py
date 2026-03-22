"""
Integrations router package.
Each integration (Slack, Teams, etc.) has its own sub-module.
"""
from fastapi import APIRouter

from .slack import router as slack_router
from .teams import router as teams_router

router = APIRouter(prefix="/integrations", tags=["integrations"])
router.include_router(slack_router)
router.include_router(teams_router)
