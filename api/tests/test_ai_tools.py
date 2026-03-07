"""
Tests for AI tools in app/services/ai_tools/.

Each tool's execute() is tested with:
  - Valid arguments (mock DB / session)
  - Invalid / missing arguments (should return error dict gracefully)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

# Import tool modules directly
from app.services.ai_tools import create_page, create_folder, suggest_workflow
from app.services.ai_tools import read_workflow, rename_workflow, rename_steps
from app.services.ai_tools import analyze_workflow, list_workflows, merge_steps


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_db():
    """Create a mock AsyncSession."""
    db = AsyncMock(spec=AsyncSession)
    db.scalar = AsyncMock(return_value=None)
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


def _make_mock_workflow(steps=None):
    """Create a mock ProcessRecordingSession with optional steps."""
    wf = MagicMock()
    wf.id = "wf_123"
    wf.name = "Test Workflow"
    wf.generated_title = "AI Title"
    wf.summary = "A summary"
    wf.tags = ["test"]
    wf.total_steps = len(steps or [])
    wf.status = "completed"
    wf.user_id = "user_1"
    wf.project_id = "proj_1"
    wf.difficulty = "easy"
    wf.steps = steps or []
    wf.is_processed = True
    wf.is_private = False
    wf.owner_id = "user_1"
    wf.guide_markdown = None
    return wf


def _make_mock_step(step_number, action_type="click", window_title="App", description=None):
    step = MagicMock()
    step.id = f"step_{step_number}"
    step.step_number = step_number
    step.step_type = "screenshot"
    step.action_type = action_type
    step.window_title = window_title
    step.description = description or f"Step {step_number} description"
    step.generated_title = None
    step.generated_description = None
    step.ui_element = None
    step.step_category = None
    step.is_annotated = False
    step.text_typed = None
    step.key_pressed = None
    step.content = None
    step.url = None
    step.owner_app = None
    return step


# ---------------------------------------------------------------------------
# create_page
# ---------------------------------------------------------------------------

class TestCreatePage:
    @pytest.mark.asyncio
    async def test_execute_valid(self):
        db = _make_mock_db()
        # Mock: user is a member of the project
        db.scalar = AsyncMock(return_value="user_1")

        result = await create_page.execute(
            db=db, user_id="user_1", project_id="proj_1",
            title="My Page", content="Hello world",
        )
        assert result.get("success") is True
        assert "document_id" in result
        assert result["title"] == "My Page"
        db.add.assert_called()

    @pytest.mark.asyncio
    async def test_execute_no_project(self):
        db = _make_mock_db()
        result = await create_page.execute(
            db=db, user_id="user_1", project_id=None,
            title="Orphan",
        )
        assert "error" in result

    @pytest.mark.asyncio
    async def test_execute_no_access(self):
        db = _make_mock_db()
        db.scalar = AsyncMock(return_value=None)  # not a member

        result = await create_page.execute(
            db=db, user_id="user_1", project_id="proj_1",
            title="Denied",
        )
        assert "error" in result


# ---------------------------------------------------------------------------
# create_folder
# ---------------------------------------------------------------------------

class TestCreateFolder:
    @pytest.mark.asyncio
    async def test_execute_valid(self):
        db = _make_mock_db()
        db.scalar = AsyncMock(return_value="user_1")  # member check

        result = await create_folder.execute(
            db=db, user_id="user_1", project_id="proj_1",
            name="Reports",
        )
        assert result.get("success") is True
        assert result["name"] == "Reports"
        db.add.assert_called()

    @pytest.mark.asyncio
    async def test_execute_no_project(self):
        db = _make_mock_db()
        result = await create_folder.execute(
            db=db, user_id="user_1", project_id=None,
            name="Orphan",
        )
        assert "error" in result


# ---------------------------------------------------------------------------
# suggest_workflow
# ---------------------------------------------------------------------------

class TestSuggestWorkflow:
    @pytest.mark.asyncio
    async def test_execute_empty_question(self):
        db = _make_mock_db()
        result = await suggest_workflow.execute(
            db=db, user_id="user_1", project_id="proj_1",
        )
        assert "error" in result

    @pytest.mark.asyncio
    async def test_execute_no_results(self):
        db = _make_mock_db()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_result.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)

        result = await suggest_workflow.execute(
            db=db, user_id="user_1", project_id="proj_1",
            question="How do I bake a cake?",
        )
        assert result.get("success") is True
        assert result["count"] == 0


# ---------------------------------------------------------------------------
# read_workflow
# ---------------------------------------------------------------------------

class TestReadWorkflow:
    @pytest.mark.asyncio
    async def test_execute_missing_args(self):
        db = _make_mock_db()
        result = await read_workflow.execute(
            db=db, user_id="user_1", project_id="proj_1",
        )
        assert "error" in result

    @pytest.mark.asyncio
    async def test_execute_not_found(self):
        db = _make_mock_db()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        result = await read_workflow.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="nonexistent",
        )
        assert "error" in result

    @pytest.mark.asyncio
    async def test_execute_found(self):
        steps = [_make_mock_step(1), _make_mock_step(2)]
        wf = _make_mock_workflow(steps)

        db = _make_mock_db()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = wf
        db.execute = AsyncMock(return_value=mock_result)

        result = await read_workflow.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="wf_123",
        )
        assert result.get("success") is True
        assert result["total_steps"] == 2


# ---------------------------------------------------------------------------
# rename_workflow
# ---------------------------------------------------------------------------

class TestRenameWorkflow:
    @pytest.mark.asyncio
    async def test_execute_no_name(self):
        db = _make_mock_db()
        result = await rename_workflow.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="wf_123",
        )
        assert "error" in result

    @pytest.mark.asyncio
    async def test_execute_valid(self):
        wf = _make_mock_workflow()
        db = _make_mock_db()
        db.scalar = AsyncMock(return_value=wf)

        result = await rename_workflow.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="wf_123", new_name="Better Name",
        )
        assert result.get("success") is True
        assert result["new_name"] == "Better Name"


# ---------------------------------------------------------------------------
# rename_steps
# ---------------------------------------------------------------------------

class TestRenameSteps:
    @pytest.mark.asyncio
    async def test_execute_empty_renames(self):
        db = _make_mock_db()
        result = await rename_steps.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="wf_123", renames=[],
        )
        assert "error" in result

    @pytest.mark.asyncio
    async def test_execute_valid(self):
        steps = [_make_mock_step(1), _make_mock_step(2)]
        wf = _make_mock_workflow(steps)

        db = _make_mock_db()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = wf
        db.execute = AsyncMock(return_value=mock_result)

        result = await rename_steps.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="wf_123",
            renames=[
                {"step_number": 1, "title": "Open app"},
                {"step_number": 2, "title": "Click save"},
            ],
        )
        assert result.get("success") is True
        assert result["renamed_count"] == 2


# ---------------------------------------------------------------------------
# analyze_workflow
# ---------------------------------------------------------------------------

class TestAnalyzeWorkflow:
    @pytest.mark.asyncio
    async def test_execute_missing_id(self):
        db = _make_mock_db()
        result = await analyze_workflow.execute(
            db=db, user_id="user_1", project_id="proj_1",
        )
        assert "error" in result

    @pytest.mark.asyncio
    async def test_execute_valid(self):
        steps = [_make_mock_step(i, action_type="click", window_title="App") for i in range(1, 6)]
        wf = _make_mock_workflow(steps)

        db = _make_mock_db()
        db.scalar = AsyncMock(return_value=wf)

        result = await analyze_workflow.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="wf_123",
        )
        assert result.get("success") is True
        assert result["total_steps"] == 5
        assert "applications_used" in result


# ---------------------------------------------------------------------------
# list_workflows
# ---------------------------------------------------------------------------

class TestListWorkflows:
    @pytest.mark.asyncio
    async def test_execute_empty(self):
        db = _make_mock_db()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)

        result = await list_workflows.execute(
            db=db, user_id="user_1", project_id="proj_1",
        )
        assert result.get("success") is True
        assert result["count"] == 0

    @pytest.mark.asyncio
    async def test_execute_with_results(self):
        wf1 = _make_mock_workflow()
        wf1.created_at = None
        wf2 = _make_mock_workflow()
        wf2.id = "wf_456"
        wf2.name = "Other Workflow"
        wf2.created_at = None

        db = _make_mock_db()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [wf1, wf2]
        db.execute = AsyncMock(return_value=mock_result)

        result = await list_workflows.execute(
            db=db, user_id="user_1", project_id="proj_1",
        )
        assert result.get("success") is True
        assert result["count"] == 2


# ---------------------------------------------------------------------------
# merge_steps
# ---------------------------------------------------------------------------

class TestMergeSteps:
    @pytest.mark.asyncio
    async def test_execute_missing_id(self):
        db = _make_mock_db()
        result = await merge_steps.execute(
            db=db, user_id="user_1", project_id="proj_1",
        )
        assert "error" in result

    @pytest.mark.asyncio
    async def test_execute_no_duplicates(self):
        steps = [
            _make_mock_step(1, action_type="click", window_title="App A"),
            _make_mock_step(2, action_type="type", window_title="App B"),
        ]
        wf = _make_mock_workflow(steps)

        db = _make_mock_db()
        db.scalar = AsyncMock(return_value=wf)

        result = await merge_steps.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="wf_123",
        )
        assert result.get("success") is True
        assert result["removed_count"] == 0

    @pytest.mark.asyncio
    async def test_execute_with_duplicates(self):
        steps = [
            _make_mock_step(1, action_type="click", window_title="App"),
            _make_mock_step(2, action_type="click", window_title="App"),
            _make_mock_step(3, action_type="type", window_title="Other"),
        ]
        for s in steps:
            s.step_type = "screenshot"
        wf = _make_mock_workflow(steps)

        db = _make_mock_db()
        db.scalar = AsyncMock(return_value=wf)

        result = await merge_steps.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="wf_123",
        )
        assert result.get("success") is True
        assert result["removed_count"] >= 1

    @pytest.mark.asyncio
    async def test_execute_specific_steps(self):
        steps = [_make_mock_step(1), _make_mock_step(2), _make_mock_step(3)]
        wf = _make_mock_workflow(steps)

        db = _make_mock_db()
        db.scalar = AsyncMock(return_value=wf)

        result = await merge_steps.execute(
            db=db, user_id="user_1", project_id="proj_1",
            workflow_id="wf_123",
            step_numbers=[2],
        )
        assert result.get("success") is True
        assert result["removed_count"] == 1
