"""Tests for the datatable feature — table, column, row CRUD + security.

Covers:
- Table CRUD (create, get, list, delete)
- Column CRUD (add different types, delete, reorder)
- Row CRUD (insert, update, delete, get)
- Filtering with parameterized queries (SQL injection blocked)
- Sorting
- Relations (create, assign, unassign)
- Select options
- Auth required on all endpoints
- Project permission checks
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient

BASE = "/api/v1/datatable"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def project_id(async_client: AsyncClient, auth_headers: dict, test_user_id: str) -> str:
    resp = await async_client.post(
        "/api/v1/projects/",
        json={"name": "DTTest", "user_id": test_user_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    return resp.json()["id"]


@pytest_asyncio.fixture()
async def table_id(async_client: AsyncClient, auth_headers: dict, project_id: str) -> str:
    resp = await async_client.post(
        f"{BASE}/tables/",
        json={"name": "Animals", "project_id": project_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# ===========================================================================
# Auth tests — every endpoint MUST require auth
# ===========================================================================

class TestAuthRequired:
    """All datatable endpoints should return 401 without auth."""

    @pytest.mark.asyncio
    async def test_create_table_no_auth(self, async_client: AsyncClient):
        resp = await async_client.post(f"{BASE}/tables/", json={"name": "X", "project_id": "fake"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_tables_no_auth(self, async_client: AsyncClient):
        resp = await async_client.get(f"{BASE}/tables/fakeid")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_rows_no_auth(self, async_client: AsyncClient):
        resp = await async_client.get(f"{BASE}/rows/fakeid")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_filter_no_auth(self, async_client: AsyncClient):
        resp = await async_client.post(
            f"{BASE}/filters/",
            json={"name": "f", "table_id": "x", "column_id": "x", "operation": "equals"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_relation_no_auth(self, async_client: AsyncClient):
        resp = await async_client.post(
            f"{BASE}/relations/",
            json={"left_table_id": "x", "right_table_id": "x", "relation_type": "one_to_one"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_sort_no_auth(self, async_client: AsyncClient):
        resp = await async_client.post(
            f"{BASE}/sorts/",
            json={"table_id": "x", "column_id": "x"},
        )
        assert resp.status_code == 401


# ===========================================================================
# Table CRUD
# ===========================================================================

class TestTableCRUD:
    @pytest.mark.asyncio
    async def test_create_table(self, async_client: AsyncClient, auth_headers: dict, project_id: str):
        resp = await async_client.post(
            f"{BASE}/tables/",
            json={"name": "People", "project_id": project_id},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "People"
        assert data["project_id"] == project_id
        assert "id" in data
        assert data["physical_name"].startswith("st_")

    @pytest.mark.asyncio
    async def test_list_tables(self, async_client: AsyncClient, auth_headers: dict, project_id: str, table_id: str):
        resp = await async_client.get(f"{BASE}/tables/{project_id}", headers=auth_headers)
        assert resp.status_code == 200
        tables = resp.json()
        assert any(t["id"] == table_id for t in tables)

    @pytest.mark.asyncio
    async def test_get_table(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.get(f"{BASE}/tables/table/{table_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == table_id

    @pytest.mark.asyncio
    async def test_update_table(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.put(
            f"{BASE}/tables/{table_id}",
            json={"name": "Pets"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Pets"

    @pytest.mark.asyncio
    async def test_delete_table(self, async_client: AsyncClient, auth_headers: dict, project_id: str):
        # Create then delete
        resp = await async_client.post(
            f"{BASE}/tables/",
            json={"name": "ToDelete", "project_id": project_id},
            headers=auth_headers,
        )
        tid = resp.json()["id"]
        resp = await async_client.delete(f"{BASE}/tables/{tid}", headers=auth_headers)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_get_nonexistent_table(self, async_client: AsyncClient, auth_headers: dict):
        resp = await async_client.get(f"{BASE}/tables/table/doesnotexist", headers=auth_headers)
        assert resp.status_code == 404


# ===========================================================================
# Column CRUD
# ===========================================================================

class TestColumnCRUD:
    @pytest.mark.asyncio
    async def test_add_column(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.post(
            f"{BASE}/columns/",
            json={"table_id": table_id, "name": "age", "ui_type": "number"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ui_type"] == "number"
        assert data["name"] == "age"

    @pytest.mark.asyncio
    async def test_add_text_column(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.post(
            f"{BASE}/columns/",
            json={"table_id": table_id, "name": "description", "ui_type": "single_line_text"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_add_boolean_column(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.post(
            f"{BASE}/columns/",
            json={"table_id": table_id, "name": "active", "ui_type": "BOOLEAN"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_list_columns(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.get(f"{BASE}/columns/{table_id}", headers=auth_headers)
        assert resp.status_code == 200
        cols = resp.json()
        # Should have at least the default "name" column
        assert len(cols) >= 1
        assert any(c["name"] == "name" for c in cols)

    @pytest.mark.asyncio
    async def test_delete_column(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        # Add then delete
        resp = await async_client.post(
            f"{BASE}/columns/",
            json={"table_id": table_id, "name": "temp", "ui_type": "single_line_text"},
            headers=auth_headers,
        )
        col_id = resp.json()["id"]
        resp = await async_client.delete(f"{BASE}/columns/{col_id}", headers=auth_headers)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_reorder_column(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        # Add two columns, then reorder
        await async_client.post(
            f"{BASE}/columns/",
            json={"table_id": table_id, "name": "col_a", "ui_type": "single_line_text"},
            headers=auth_headers,
        )
        resp2 = await async_client.post(
            f"{BASE}/columns/",
            json={"table_id": table_id, "name": "col_b", "ui_type": "single_line_text"},
            headers=auth_headers,
        )
        col_b_id = resp2.json()["id"]
        resp = await async_client.patch(
            f"{BASE}/columns/{col_b_id}/reorder",
            json={"new_position": 0},
            headers=auth_headers,
        )
        assert resp.status_code == 200


# ===========================================================================
# Row CRUD
# ===========================================================================

class TestRowCRUD:
    @pytest.mark.asyncio
    async def test_insert_row(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.post(
            f"{BASE}/rows/",
            json={"table_id": table_id, "data": {"name": "Dog"}},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "row_id" in resp.json()

    @pytest.mark.asyncio
    async def test_get_rows(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        # Insert a row first
        await async_client.post(
            f"{BASE}/rows/",
            json={"table_id": table_id, "data": {"name": "Cat"}},
            headers=auth_headers,
        )
        resp = await async_client.get(f"{BASE}/rows/{table_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_update_row(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.post(
            f"{BASE}/rows/",
            json={"table_id": table_id, "data": {"name": "Fish"}},
            headers=auth_headers,
        )
        row_id = resp.json()["row_id"]
        resp = await async_client.patch(
            f"{BASE}/rows/{table_id}/{row_id}",
            json={"data": {"name": "Shark"}},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_row(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.post(
            f"{BASE}/rows/",
            json={"table_id": table_id, "data": {"name": "Temp"}},
            headers=auth_headers,
        )
        row_id = resp.json()["row_id"]
        resp = await async_client.delete(
            f"{BASE}/rows/{table_id}/{row_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == row_id

    @pytest.mark.asyncio
    async def test_search_rows(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        await async_client.post(
            f"{BASE}/rows/",
            json={"table_id": table_id, "data": {"name": "Elephant"}},
            headers=auth_headers,
        )
        resp = await async_client.get(
            f"{BASE}/rows/{table_id}/search?q=Elephant",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1


# ===========================================================================
# Filter — SQL injection prevention
# ===========================================================================

class TestFiltering:
    @pytest.mark.asyncio
    async def test_create_filter(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        # Get column ID first
        cols = (await async_client.get(f"{BASE}/columns/{table_id}", headers=auth_headers)).json()
        name_col = next(c for c in cols if c["name"] == "name")

        resp = await async_client.post(
            f"{BASE}/filters/",
            json={
                "name": "Name filter",
                "table_id": table_id,
                "column_id": name_col["id"],
                "operation": "contains",
                "value": "test",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["operation"] == "contains"

    @pytest.mark.asyncio
    async def test_sql_injection_blocked(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        """Verify that SQL injection via filter values is blocked."""
        cols = (await async_client.get(f"{BASE}/columns/{table_id}", headers=auth_headers)).json()
        name_col = next(c for c in cols if c["name"] == "name")

        # Create a filter with a SQL injection payload
        resp = await async_client.post(
            f"{BASE}/filters/",
            json={
                "name": "Injection test",
                "table_id": table_id,
                "column_id": name_col["id"],
                "operation": "equals",
                "value": "'; DROP TABLE users; --",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200

        # The rows endpoint should work fine (not crash)
        resp = await async_client.get(f"{BASE}/rows/{table_id}", headers=auth_headers)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_list_filters(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.get(
            f"{BASE}/filters/?table_id={table_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_filter(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        cols = (await async_client.get(f"{BASE}/columns/{table_id}", headers=auth_headers)).json()
        name_col = next(c for c in cols if c["name"] == "name")

        resp = await async_client.post(
            f"{BASE}/filters/",
            json={
                "name": "To delete",
                "table_id": table_id,
                "column_id": name_col["id"],
                "operation": "equals",
                "value": "x",
            },
            headers=auth_headers,
        )
        filter_id = resp.json()["id"]
        resp = await async_client.delete(f"{BASE}/filters/{filter_id}", headers=auth_headers)
        assert resp.status_code == 200


# ===========================================================================
# Sort
# ===========================================================================

class TestSorting:
    @pytest.mark.asyncio
    async def test_create_sort(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        cols = (await async_client.get(f"{BASE}/columns/{table_id}", headers=auth_headers)).json()
        name_col = next(c for c in cols if c["name"] == "name")

        resp = await async_client.post(
            f"{BASE}/sorts/",
            json={"table_id": table_id, "column_id": name_col["id"], "direction": "desc"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["direction"] == "desc"

    @pytest.mark.asyncio
    async def test_list_sorts(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.get(
            f"{BASE}/sorts/?table_id={table_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_clear_sorts(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.delete(
            f"{BASE}/sorts/table/{table_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200


# ===========================================================================
# Select options
# ===========================================================================

class TestSelectOptions:
    @pytest.mark.asyncio
    async def test_create_select_column(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        resp = await async_client.post(
            f"{BASE}/select-options/",
            json={
                "table_id": table_id,
                "name": "status",
                "options": [
                    {"name": "Active", "color": "green"},
                    {"name": "Inactive", "color": "red"},
                ],
                "ui_type": "single_select",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "status"

    @pytest.mark.asyncio
    async def test_list_options(self, async_client: AsyncClient, auth_headers: dict, table_id: str):
        # Create column first
        resp = await async_client.post(
            f"{BASE}/select-options/",
            json={
                "table_id": table_id,
                "name": "priority",
                "options": ["Low", "Medium", "High"],
            },
            headers=auth_headers,
        )
        col_id = resp.json()["id"]
        resp = await async_client.get(f"{BASE}/select-options/{col_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 3


# ===========================================================================
# Relations
# ===========================================================================

class TestRelations:
    @pytest.mark.asyncio
    async def test_create_one_to_one_relation(
        self, async_client: AsyncClient, auth_headers: dict, project_id: str,
    ):
        # Create two tables
        t1 = (await async_client.post(
            f"{BASE}/tables/", json={"name": "People", "project_id": project_id}, headers=auth_headers,
        )).json()
        t2 = (await async_client.post(
            f"{BASE}/tables/", json={"name": "Passports", "project_id": project_id}, headers=auth_headers,
        )).json()

        resp = await async_client.post(
            f"{BASE}/relations/",
            json={
                "left_table_id": t1["id"],
                "right_table_id": t2["id"],
                "relation_type": "one_to_one",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["relation_type"] == "one_to_one"

    @pytest.mark.asyncio
    async def test_create_many_to_many_relation(
        self, async_client: AsyncClient, auth_headers: dict, project_id: str,
    ):
        t1 = (await async_client.post(
            f"{BASE}/tables/", json={"name": "Students", "project_id": project_id}, headers=auth_headers,
        )).json()
        t2 = (await async_client.post(
            f"{BASE}/tables/", json={"name": "Courses", "project_id": project_id}, headers=auth_headers,
        )).json()

        resp = await async_client.post(
            f"{BASE}/relations/",
            json={
                "left_table_id": t1["id"],
                "right_table_id": t2["id"],
                "relation_type": "many_to_many",
                "display_name": "enrolled",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_assign_and_unassign_relation(
        self, async_client: AsyncClient, auth_headers: dict, project_id: str,
    ):
        # Create tables and relation
        t1 = (await async_client.post(
            f"{BASE}/tables/", json={"name": "Owners", "project_id": project_id}, headers=auth_headers,
        )).json()
        t2 = (await async_client.post(
            f"{BASE}/tables/", json={"name": "Cars", "project_id": project_id}, headers=auth_headers,
        )).json()

        rel = (await async_client.post(
            f"{BASE}/relations/",
            json={
                "left_table_id": t1["id"],
                "right_table_id": t2["id"],
                "relation_type": "many_to_one",
            },
            headers=auth_headers,
        )).json()

        # Insert rows
        r1 = (await async_client.post(
            f"{BASE}/rows/", json={"table_id": t1["id"], "data": {"name": "Alice"}}, headers=auth_headers,
        )).json()
        r2 = (await async_client.post(
            f"{BASE}/rows/", json={"table_id": t2["id"], "data": {"name": "Tesla"}}, headers=auth_headers,
        )).json()

        # Assign
        resp = await async_client.post(
            f"{BASE}/relations/{rel['id']}/assign",
            json={
                "left_item_id": r1["row_id"],
                "right_item_id": r2["row_id"],
                "left_table_id": t1["id"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200

        # Unassign
        resp = await async_client.post(
            f"{BASE}/relations/{rel['id']}/unassign",
            json={
                "left_item_id": r1["row_id"],
                "right_item_id": r2["row_id"],
                "left_table_id": t1["id"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200


# ===========================================================================
# Project permission checks
# ===========================================================================

class TestProjectPermissions:
    @pytest.mark.asyncio
    async def test_non_member_cannot_access_table(
        self, async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, project_id: str,
    ):
        """A user who is not a project member should get 403."""
        resp = await async_client.get(
            f"{BASE}/tables/{project_id}",
            headers=second_auth_headers,
        )
        assert resp.status_code == 403
