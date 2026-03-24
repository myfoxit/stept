"""
Guide recovery endpoints - LLM-assisted element finding when selectors fail.
"""

import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import User
from app.security import get_current_user
from app.services.element_recovery import recover_element_with_llm, extract_new_selectors

logger = logging.getLogger(__name__)

router = APIRouter()


class ElementData(BaseModel):
    """Page element data for LLM analysis."""
    tagName: str
    text: Optional[str] = None
    role: Optional[str] = None
    ariaLabel: Optional[str] = None
    placeholder: Optional[str] = None
    type: Optional[str] = None
    href: Optional[str] = None
    value: Optional[str] = None
    disabled: Optional[bool] = None
    checked: Optional[bool] = None
    focused: Optional[bool] = None
    parentText: Optional[str] = None
    testId: Optional[str] = None
    id: Optional[str] = None
    name: Optional[str] = None


class TargetElementInfo(BaseModel):
    """Information about the element we're trying to find."""
    content: Optional[str] = None  # element.innerText for verification
    text: Optional[str] = None  # legacy field
    tagName: Optional[str] = None
    role: Optional[str] = None
    ariaLabel: Optional[str] = None
    placeholder: Optional[str] = None
    type: Optional[str] = None
    title: Optional[str] = None
    step_title: Optional[str] = None  # Step title for context
    step_description: Optional[str] = None  # Step description for context
    action_type: Optional[str] = None  # Expected action (click, type, etc.)


class RecoverRequest(BaseModel):
    """Request for element recovery."""
    target: TargetElementInfo
    page_elements: List[ElementData]
    workflow_id: Optional[str] = None  # For self-healing updates
    step_index: Optional[int] = None  # For self-healing updates


class RecoverResponse(BaseModel):
    """Response for element recovery."""
    found: bool
    element_index: Optional[int] = None
    confidence: float = 0.0
    reasoning: Optional[str] = None
    new_selectors: Optional[List[str]] = None
    self_healed: bool = False
    error: Optional[str] = None


@router.post("/recover-element", response_model=RecoverResponse)
async def recover_element(
    request: RecoverRequest,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)
) -> RecoverResponse:
    """
    LLM-assisted element recovery when guide selectors fail.
    
    This implements Layer 2 of the three-layer architecture:
    1. Layer 1 (Deterministic): SelectorTree with vote counting - handled in frontend
    2. Layer 2 (LLM Recovery): This endpoint - when Layer 1 fails
    3. Layer 3 (Fallback): Screenshot guidance - handled in frontend
    """
    try:
        logger.info(f"Element recovery request from user {user.id} for {len(request.page_elements)} elements")
        
        # Convert Pydantic models to dicts for the service
        target_dict = request.target.dict(exclude_none=True)
        elements_list = [elem.dict(exclude_none=True) for elem in request.page_elements]
        
        # Call LLM service to find the best matching element
        recovery_result = await recover_element_with_llm(target_dict, elements_list)
        
        response = RecoverResponse(
            found=recovery_result.get("found", False),
            element_index=recovery_result.get("element_index"),
            confidence=recovery_result.get("confidence", 0.0),
            reasoning=recovery_result.get("reasoning"),
            error=recovery_result.get("error")
        )
        
        # If element was found, generate new selectors for self-healing
        if response.found and response.element_index is not None:
            try:
                found_element = elements_list[response.element_index]
                new_selectors = await extract_new_selectors(found_element, elements_list)
                response.new_selectors = new_selectors
                
                # TODO: Implement self-healing workflow update
                # This would update the workflow's step selectorTree with new selectors
                # if request.workflow_id and request.step_index is not None:
                #     await update_workflow_step_selectors(
                #         db, request.workflow_id, request.step_index, 
                #         new_selectors, user.id
                #     )
                #     response.self_healed = True
                
                logger.info(f"Element recovery successful: index {response.element_index}, confidence {response.confidence}")
                
            except Exception as e:
                logger.warning(f"Failed to extract new selectors: {e}")
                # Don't fail the whole request for this
        
        return response
        
    except Exception as e:
        logger.error(f"Element recovery failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Element recovery failed: {str(e)}"
        )


@router.get("/recovery-status")
async def get_recovery_status(
    user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get status of the element recovery system."""
    try:
        # Check if LLM service is available
        from app.services.llm import _circuit_is_open
        
        llm_available = not _circuit_is_open()
        
        return {
            "llm_available": llm_available,
            "recovery_enabled": llm_available,
            "user_id": user.id
        }
        
    except Exception as e:
        logger.error(f"Failed to get recovery status: {e}")
        return {
            "llm_available": False,
            "recovery_enabled": False,
            "error": str(e)
        }


# TODO: Implement self-healing workflow update function
# async def update_workflow_step_selectors(
#     db: AsyncSession,
#     workflow_id: str,
#     step_index: int,
#     new_selectors: List[str],
#     user_id: str
# ) -> bool:
#     """
#     Update a workflow step's selectorTree with new selectors for self-healing.
#     This would be called when the LLM successfully recovers an element.
#     """
#     # Implementation would:
#     # 1. Load the workflow and check permissions
#     # 2. Update the step's element_info.selectorTree.selectors
#     # 3. Log the self-healing event
#     # 4. Save the updated workflow
#     pass