"""Privacy/PII protection settings and status."""
from fastapi import APIRouter, Depends
from app.services import sendcloak
from app.security import get_current_user

router = APIRouter(prefix="/privacy", tags=["privacy"])

@router.get("/status")
async def privacy_status(user=Depends(get_current_user)):
    """Get SendCloak status and stats."""
    return await sendcloak.get_stats()

@router.post("/analyze")
async def analyze_text(body: dict, user=Depends(get_current_user)):
    """Analyze text for PII entities (returns spans for highlighting)."""
    text = body.get("text", "")
    entities = await sendcloak.analyze(text)
    return {"entities": entities}
