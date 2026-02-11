from fastapi import APIRouter, Depends, HTTPException, status, Header, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from typing import Optional, List
import os
from datetime import datetime
import io

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, ProcessRecordingFile, ProjectRole, User
from app.schemas.process_recording import (
    SessionCreate, SessionResponse, StepMetadata, 
    SessionStatusResponse, FileUploadResponse,
    StepCreate, StepUpdate, StepResponse, BulkStepReorder,
    WorkflowMove  # Add this schema
)
from app.crud.process_recording import (
    create_session, upload_metadata, save_uploaded_file,
    finalize_session, get_session_status, get_file_access,
    update_workflow, move_workflow, delete_workflow, duplicate_workflow,
    create_step, update_step, delete_step, reorder_steps,
    get_filtered_workflows  # NEW import
)
from app.security import get_current_user, ProjectPermissionChecker, check_project_permission
from fastapi import Body  # NEW: accept JSON body in update endpoint

router = APIRouter()

@router.get("/workflows/filtered")
async def get_filtered_workflows_endpoint(
    project_id: str = Query(...),
    folder_id: Optional[str] = Query(None),
    sort_by: str = Query("created_at", description="Sort by: created_at, updated_at, name"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get filtered workflows with sorting for a project"""
    try:
        workflows = await get_filtered_workflows(
            db,
            project_id=project_id,
            folder_id=folder_id,
            sort_by=sort_by,
            sort_order=sort_order,
            skip=skip,
            limit=limit,
            user_id=current_user.id,  # NEW: Pass user_id for privacy filtering
        )
        return workflows
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@router.post("/session/create", response_model=SessionResponse)
async def create_upload_session(
    session_data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new upload session"""
    # Validate user_id and project_id
    if session_data.user_id and session_data.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_id in payload does not match authenticated user",
        )

    if session_data.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session_data.project_id,
            required_role=ProjectRole.MEMBER,  
        )

    # Default is_private to True if not specified
    is_private = session_data.is_private if session_data.is_private is not None else True

    session = await create_session(
        db=db,
        user_id=current_user.id,
        client_name=session_data.client or "ProcessRecorder",
        project_id=session_data.project_id,
        folder_id=session_data.folder_id,
        name=session_data.name,
        is_private=is_private,  # CHANGED: Use computed value
    )

    return SessionResponse(session_id=session.id)


@router.post("/session/{session_id}/metadata", status_code=status.HTTP_200_OK)
async def upload_session_metadata(
    session_id: str,
    metadata: List[StepMetadata],
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Upload metadata for all steps in a session"""
    try:
        await upload_metadata(db, session_id, metadata)
        return {"status": "success", "steps_uploaded": len(metadata)}
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@router.post("/session/{session_id}/image", response_model=FileUploadResponse)
async def upload_image(
    session_id: str,
    file: UploadFile = File(...),
    stepNumber: int = Form(...),
    replace: Optional[bool] = Form(default=False),  # Make it Optional[bool]
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Upload a single image for a step"""
    try:
        # Read file content
        file_content = await file.read()
        
        # Use original filename or generate one
        filename = file.filename or f"step_{stepNumber}.png"
        
        # Convert replace to boolean if it's a string
        is_replacement = replace if isinstance(replace, bool) else str(replace).lower() == 'true'
        
        # Save file with replacement flag
        file_record = await save_uploaded_file(
            db,
            session_id,
            stepNumber,
            file_content,
            filename,
            file.content_type or "image/png",
            is_replacement=is_replacement
        )
        
        return FileUploadResponse(
            success=True,
            step_number=stepNumber,
            filename=file_record.filename,
            file_path=file_record.file_path
        )
    except ValueError as e:
        # More detailed error message
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, 
            detail=f"Upload failed: {str(e)}"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()  # Log the full error for debugging
        return FileUploadResponse(
            success=False,
            step_number=stepNumber,
            message=str(e)
        )

@router.post("/session/{session_id}/finalize", status_code=status.HTTP_200_OK)
async def finalize_upload_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),  
):
    """Finalize an upload session"""
    try:
       
        await finalize_session(db, session_id, user_id=current_user.id)
        return {"status": "success", "message": "Session finalized"}
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))


@router.get("/session/{session_id}/status")  # removed response_model to allow extra fields
async def get_session_status_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Get status of an upload session (augmented with icon fields and title)"""
    try:
        status_data = await get_session_status(db, session_id)
        # Convert to dict whether it's a Pydantic model or already a dict
        base = status_data.dict() if hasattr(status_data, "dict") else dict(status_data)

        # Augment with icon fields and title expected by the frontend
        session = await db.get(ProcessRecordingSession, session_id)
        if session:
            base.update({
                "icon_type": session.icon_type,
                "icon_value": session.icon_value,
                "icon_color": session.icon_color,
                "title": session.name or "Untitled workflow",
            })
        return base
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.get("/session/{session_id}/image/{step_number}")
async def get_image(
    session_id: str,
    step_number: int,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Retrieve an uploaded image (local file or redirect to signed URL)"""
    access = await get_file_access(db, session_id, step_number, expires_in=3600)
    if not access:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    if access["type"] == "local":
        local_path = access["path"]
        if not os.path.exists(local_path):
            print(f"DEBUG: Docker is looking for image at: {local_path}")
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Image file not found at {local_path}")
        return FileResponse(
            local_path,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",  # Add CORS header
                "Access-Control-Allow-Credentials": "true"  # Allow cookies
            }
        )
    elif access["type"] == "url":
        return RedirectResponse(url=access["url"], status_code=307)

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None),
    limit: int = 20,
    offset: int = 0
):
    """List recording sessions"""
    try:
        from sqlalchemy import select
        stmt = (
            select(ProcessRecordingSession)
            .order_by(ProcessRecordingSession.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        
        result = await db.execute(stmt)
        sessions = result.scalars().all()
        
        response = []
        for session in sessions:
            status_data = await get_session_status(db, session.id)
            response.append(status_data)
        
        return response
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Error listing sessions: {str(e)}")
    

    """Get status of an upload session"""
    try:
        status_data = await get_session_status(db, session_id)
        return status_data
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None),
    limit: int = 20,
    offset: int = 0
):
    """List recording sessions"""
    # For now, list all sessions (you can add user filtering later)
    from sqlalchemy import select
    stmt = (
        select(ProcessRecordingSession)
        .order_by(ProcessRecordingSession.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    
    response = []
    for session in sessions:
        status_data = await get_session_status(db, session.id)
        response.append(status_data)
    
    return response

# NEW: Workflow management endpoints
@router.put("/workflow/{session_id}")
async def update_workflow_endpoint(
    session_id: str,
    # Back-compat: allow query params
    name: Optional[str] = None,
    folder_id: Optional[str] = None,
    icon_type: Optional[str] = None,
    icon_value: Optional[str] = None,
    icon_color: Optional[str] = None,
    # Preferred: JSON body
    payload: Optional[dict] = Body(default=None),
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Update workflow details"""
    try:
        # Prefer values from JSON body when provided
        body = payload or {}
        eff_name = body.get("name", name)
        eff_folder_id = body.get("folder_id", folder_id)
        eff_icon_type = body.get("icon_type", icon_type)
        eff_icon_value = body.get("icon_value", icon_value)
        eff_icon_color = body.get("icon_color", icon_color)

        workflow = await update_workflow(
            db,
            session_id,
            name=eff_name,
            folder_id=eff_folder_id,
            icon_type=eff_icon_type,
            icon_value=eff_icon_value,
            icon_color=eff_icon_color,
        )
        return workflow
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.put("/workflow/{session_id}/move")
async def move_workflow_endpoint(
    session_id: str,
    move_data: WorkflowMove,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Move workflow to a different folder or position"""
    try:
        session = await db.get(ProcessRecordingSession, session_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
        
        if session.project_id:
            await check_project_permission(
                db=db,
                user_id=current_user.id,
                project_id=session.project_id,
                required_role=ProjectRole.MEMBER,
            )
        
        workflow = await move_workflow(
            db, 
            session_id, 
            move_data.folder_id, 
            move_data.position,
            is_private=move_data.is_private,  # NEW
            owner_id=current_user.id if move_data.is_private else None,  # NEW
        )
        return workflow
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.delete("/workflow/{session_id}")
async def delete_workflow_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Delete a workflow"""
    try:
        await delete_workflow(db, session_id)
        return {"status": "success", "message": "Workflow deleted"}
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.post("/workflow/{session_id}/duplicate")
async def duplicate_workflow_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Duplicate a workflow"""
    try:
        new_workflow = await duplicate_workflow(db, session_id)
        return new_workflow
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

# Step management endpoints
@router.post("/session/{session_id}/steps", response_model=StepResponse)
async def create_step_endpoint(
    session_id: str,
    position: int,
    step_data: StepCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new step at the specified position"""
    # Check session exists and user has access
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    
    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.EDITOR,
        )
    
    try:
        step = await create_step(
            db,
            session_id,
            position,
            step_type=step_data.step_type.value,
            description=step_data.description,
            content=step_data.content,
        )
        return step
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@router.put("/session/{session_id}/steps/{step_number}", response_model=StepResponse)
async def update_step_endpoint(
    session_id: str,
    step_number: int,
    step_data: StepUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing step"""
    # Check session exists and user has access
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    
    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.EDITOR,
        )
    
    try:
        step = await update_step(
            db,
            session_id,
            step_number,
            description=step_data.description,
            content=step_data.content,
            window_title=step_data.window_title,
        )
        return step
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.delete("/session/{session_id}/steps/{step_number}")
async def delete_step_endpoint(
    session_id: str,
    step_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a step"""
    # Check session exists and user has access
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    
    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.EDITOR,
        )
    
    try:
        await delete_step(db, session_id, step_number)
        return {"status": "success", "message": f"Step {step_number} deleted"}
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@router.post("/session/{session_id}/steps/reorder")
async def reorder_steps_endpoint(
    session_id: str,
    reorder_data: BulkStepReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reorder multiple steps"""
    # Check session exists and user has access
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    
    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.EDITOR,
        )
    
    try:
        reorders = [{"step_number": r.step_number, "new_position": r.new_position} for r in reorder_data.reorders]
        await reorder_steps(db, session_id, reorders)
        return {"status": "success", "message": "Steps reordered"}
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))


# ──────────────────────────────────────────────────────────────────────────────
# EXPORT ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/workflow/{session_id}/export/markdown")
async def export_workflow_markdown(
    session_id: str,
    include_images: bool = Query(default=False, description="Include image URLs in markdown"),
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Export workflow as Markdown"""
    from app.workflow_export import generate_markdown
    
    # Get session with steps and files
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    # Prepare data
    workflow_dict = {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
    }
    
    steps_list = [
        {
            "step_number": step.step_number,
            "step_type": step.step_type,
            "description": step.description,
            "content": step.content,
            "window_title": step.window_title,
            "text_typed": step.text_typed,
            "key_pressed": step.key_pressed,
        }
        for step in session.steps
    ]
    
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    # Generate base URL for images if requested
    image_base_url = None
    if include_images:
        # Use request context to build URL (simplified)
        image_base_url = "/api/v1/process-recording"
    
    markdown = generate_markdown(
        workflow_dict,
        steps_list,
        files_dict,
        include_images=include_images,
        image_base_url=image_base_url,
    )
    
    filename = f"{session.name or 'workflow'}.md".replace(" ", "_")
    
    return Response(
        content=markdown,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/workflow/{session_id}/export/html")
async def export_workflow_html(
    session_id: str,
    embed_images: bool = Query(default=True, description="Embed images as base64"),
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Export workflow as HTML"""
    from app.workflow_export import generate_html
    
    # Get session with steps and files
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    workflow_dict = {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
    }
    
    steps_list = [
        {
            "step_number": step.step_number,
            "step_type": step.step_type,
            "description": step.description,
            "content": step.content,
            "window_title": step.window_title,
            "text_typed": step.text_typed,
            "key_pressed": step.key_pressed,
        }
        for step in session.steps
    ]
    
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    html = generate_html(
        workflow_dict,
        steps_list,
        files_dict,
        storage_path=session.storage_path,
        storage_type=session.storage_type,
        embed_images=embed_images,
    )
    
    filename = f"{session.name or 'workflow'}.html".replace(" ", "_")
    
    return Response(
        content=html,
        media_type="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/workflow/{session_id}/export/pdf")
async def export_workflow_pdf(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Export workflow as PDF using Gotenberg"""
    from app.workflow_export import generate_pdf_gotenberg, _generate_pdf_reportlab
    
    # Get session with steps and files
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    workflow_dict = {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
    }
    
    steps_list = [
        {
            "step_number": step.step_number,
            "step_type": step.step_type,
            "description": step.description,
            "content": step.content,
            "window_title": step.window_title,
            "text_typed": step.text_typed,
            "key_pressed": step.key_pressed,
        }
        for step in session.steps
    ]
    
    # Map step_number to file_path (filename only, stored in DB)
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    # Debug logging
    print(f"[PDF Export] Session ID: {session_id}")
    print(f"[PDF Export] Storage path: {session.storage_path}")
    print(f"[PDF Export] Storage type: {session.storage_type}")
    print(f"[PDF Export] Files: {[(f.step_number, f.file_path, f.filename) for f in session.files]}")
    
    try:
        # Try Gotenberg first (async)
        pdf_bytes = await generate_pdf_gotenberg(
            workflow_dict,
            steps_list,
            files_dict,
            storage_path=session.storage_path,
            storage_type=session.storage_type,
        )
    except Exception as gotenberg_error:
        print(f"[PDF Export] Gotenberg error: {gotenberg_error}")
        # Fall back to reportlab if Gotenberg fails
        try:
            pdf_bytes = _generate_pdf_reportlab(
                workflow_dict,
                steps_list,
                files_dict,
                storage_path=session.storage_path,
                storage_type=session.storage_type,
            )
        except Exception as fallback_error:
            raise HTTPException(
                status.HTTP_501_NOT_IMPLEMENTED, 
                f"PDF generation failed. Gotenberg: {gotenberg_error}. Fallback: {fallback_error}"
            )
    
    filename = f"{session.name or 'workflow'}.pdf".replace(" ", "_")
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/workflow/{session_id}/export/docx")
async def export_workflow_docx(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    """Export workflow as Microsoft Word document"""
    from app.workflow_export import generate_docx
    
    # Get session with steps and files
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    workflow_dict = {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
    }
    
    steps_list = [
        {
            "step_number": step.step_number,
            "step_type": step.step_type,
            "description": step.description,
            "content": step.content,
            "window_title": step.window_title,
            "text_typed": step.text_typed,
            "key_pressed": step.key_pressed,
        }
        for step in session.steps
    ]
    
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    try:
        docx_bytes = generate_docx(
            workflow_dict,
            steps_list,
            files_dict,
            storage_path=session.storage_path,
            storage_type=session.storage_type,
        )
    except RuntimeError as e:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(e))
    
    filename = f"{session.name or 'workflow'}.docx".replace(" ", "_")
    
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )
