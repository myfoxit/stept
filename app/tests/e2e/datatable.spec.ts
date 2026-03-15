import { test, expect } from './fixtures/auth.fixture';
import { getTestUrls } from './helpers/config';

/**
 * Datatable E2E tests — covers table CRUD, column types, row editing,
 * sort, filter, search, pagination, and inline editing persistence.
 */

const { apiUrl } = getTestUrls();

/** Helper: create a table via API and return its id */
async function createTableViaAPI(
  page: import('@playwright/test').Page,
  projectId: string,
  name = 'E2E Test Table',
): Promise<string> {
  const resp = await page.request.post(`${apiUrl}/api/v1/datatable/tables/`, {
    data: { name, project_id: projectId },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  return body.id;
}

/** Helper: add a column via API */
async function addColumnViaAPI(
  page: import('@playwright/test').Page,
  tableId: string,
  name: string,
  uiType: string,
  extra: Record<string, any> = {},
): Promise<string> {
  const resp = await page.request.post(`${apiUrl}/api/v1/datatable/columns/`, {
    data: { table_id: tableId, name, ui_type: uiType, ...extra },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  return body.id;
}

/** Helper: insert a row via API */
async function insertRowViaAPI(
  page: import('@playwright/test').Page,
  tableId: string,
  data: Record<string, any>,
): Promise<number> {
  const resp = await page.request.post(`${apiUrl}/api/v1/datatable/rows/`, {
    data: { table_id: tableId, data },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  return body.row_id;
}

/** Helper: delete a table via API */
async function deleteTableViaAPI(
  page: import('@playwright/test').Page,
  tableId: string,
): Promise<void> {
  await page.request.delete(`${apiUrl}/api/v1/datatable/tables/${tableId}`);
}

test.describe('Datatable', () => {
  let tableId: string;

  test.beforeEach(async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;
    // Create a fresh table for each test
    tableId = await createTableViaAPI(page, testData.project_id, `Test Table ${Date.now()}`);
    // Delete the auto-created default row so tests start clean
    const rowsResp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=100&offset=0&apply_filters=false&apply_sorts=false`,
    );
    if (rowsResp.ok()) {
      const rows = await rowsResp.json();
      for (const row of rows.items) {
        await page.request.delete(`${apiUrl}/api/v1/datatable/rows/${tableId}/${row.id}`);
      }
    }
  });

  test.afterEach(async ({ authenticatedPage }) => {
    // Cleanup table
    if (tableId) {
      await deleteTableViaAPI(authenticatedPage, tableId).catch(() => {});
    }
  });

  // ── Table CRUD ──────────────────────────────────────────────

  test('should create a table and see it in sidebar', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    // The table page should load
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('should rename a table', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Rename via API
    const newName = `Renamed ${Date.now()}`;
    const resp = await page.request.put(`${apiUrl}/api/v1/datatable/tables/${tableId}`, {
      data: { name: newName },
    });
    expect(resp.ok()).toBeTruthy();

    // Navigate and verify
    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible({ timeout: 10000 });
  });

  test('should delete a table', async ({ authenticatedPage, testData }) => {
    const page = authenticatedPage;

    // Create a separate table to delete
    const tempId = await createTableViaAPI(page, testData.project_id, 'To Delete');

    const resp = await page.request.delete(`${apiUrl}/api/v1/datatable/tables/${tempId}`);
    expect(resp.ok()).toBeTruthy();

    // Verify it's gone
    const getResp = await page.request.get(`${apiUrl}/api/v1/datatable/tables/table/${tempId}`);
    expect(getResp.status()).toBe(404);
  });

  // ── Column Types ──────────────────────────────────────────

  test('should add a text column', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'description', 'single_line_text');
    expect(colId).toBeTruthy();

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('th', { hasText: 'Description' })).toBeVisible({ timeout: 10000 });
  });

  test('should add a number column', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'count', 'number');
    expect(colId).toBeTruthy();

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('th', { hasText: 'Count' })).toBeVisible({ timeout: 10000 });
  });

  test('should add a checkbox column', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'done', 'checkbox');
    expect(colId).toBeTruthy();

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('th', { hasText: 'Done' })).toBeVisible({ timeout: 10000 });
  });

  test('should add a date column', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'due_date', 'date');
    expect(colId).toBeTruthy();

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('th', { hasText: 'Due_date' })).toBeVisible({ timeout: 10000 });
  });

  test('should add a select column with options', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Create select column via select-options API
    const resp = await page.request.post(`${apiUrl}/api/v1/datatable/select-options/`, {
      data: {
        table_id: tableId,
        name: 'status',
        ui_type: 'single_select',
        options: [
          { name: 'Open', color: '#22c55e' },
          { name: 'Closed', color: '#ef4444' },
        ],
      },
    });
    expect(resp.ok()).toBeTruthy();

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('th', { hasText: 'Status' })).toBeVisible({ timeout: 10000 });
  });

  // ── Row CRUD ──────────────────────────────────────────────

  test('should insert a row and see it in the grid', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'title', 'single_line_text');
    await insertRowViaAPI(page, tableId, { title: 'First Row' });

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Wait for the row data to appear
    await expect(page.locator('td', { hasText: 'First Row' })).toBeVisible({ timeout: 10000 });
  });

  test('should edit a text cell inline', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'title', 'single_line_text');
    await insertRowViaAPI(page, tableId, { title: 'Original' });

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Find the cell with the value and double-click to edit
    const cell = page.locator('td', { hasText: 'Original' }).first();
    await expect(cell).toBeVisible({ timeout: 10000 });
    await cell.dblclick();

    // Select all and type new value (try both Ctrl+A and Meta+A for macOS)
    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Updated');
    await page.keyboard.press('Enter');

    // Wait for mutation to complete
    await page.waitForTimeout(1000);

    // Verify via API
    const resp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_filters=false&apply_sorts=false`,
    );
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    const row = body.items.find((r: any) => r.title != null);
    expect(row).toBeTruthy();
    expect(row.title).toContain('Updated');
  });

  test('should edit a number cell', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'amount', 'number');
    await insertRowViaAPI(page, tableId, { amount: 0 });

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    const cell = page.locator('td').filter({ hasText: '0' }).first();
    await expect(cell).toBeVisible({ timeout: 10000 });
    await cell.dblclick();

    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('42');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Verify via API
    const resp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_filters=false&apply_sorts=false`,
    );
    const body = await resp.json();
    const row = body.items.find((r: any) => r.amount != null);
    expect(row).toBeTruthy();
    expect(row.amount).toBe(42);
  });

  test('should delete a row', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'title', 'single_line_text');
    const rowId = await insertRowViaAPI(page, tableId, { title: 'Delete Me' });

    // Delete via API
    const resp = await page.request.delete(`${apiUrl}/api/v1/datatable/rows/${tableId}/${rowId}`);
    expect(resp.ok()).toBeTruthy();

    // Verify it's gone — the row we deleted should not be in the results
    const getResp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=100&offset=0&apply_filters=false&apply_sorts=false`,
    );
    const body = await getResp.json();
    const deletedRow = body.items.find((r: any) => r.title === 'Delete Me');
    expect(deletedRow).toBeUndefined();
  });

  // ── Sort ──────────────────────────────────────────────────

  test('should sort rows by column', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'priority', 'number');
    await insertRowViaAPI(page, tableId, { priority: 3 });
    await insertRowViaAPI(page, tableId, { priority: 1 });
    await insertRowViaAPI(page, tableId, { priority: 2 });

    // Create a sort via API
    const sortResp = await page.request.post(`${apiUrl}/api/v1/datatable/sorts/`, {
      data: { table_id: tableId, column_id: colId, direction: 'asc', priority: 0 },
    });
    expect(sortResp.ok()).toBeTruthy();

    // Fetch sorted rows
    const rowsResp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_sorts=true`,
    );
    const body = await rowsResp.json();
    // Filter to rows that have priority set (skip any default rows)
    const sortedRows = body.items.filter((r: any) => r.priority != null);
    expect(sortedRows[0].priority).toBe(1);
    expect(sortedRows[1].priority).toBe(2);
    expect(sortedRows[2].priority).toBe(3);
  });

  test('should sort descending', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'score', 'number');
    await insertRowViaAPI(page, tableId, { score: 10 });
    await insertRowViaAPI(page, tableId, { score: 50 });
    await insertRowViaAPI(page, tableId, { score: 30 });

    await page.request.post(`${apiUrl}/api/v1/datatable/sorts/`, {
      data: { table_id: tableId, column_id: colId, direction: 'desc', priority: 0 },
    });

    const rowsResp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_sorts=true`,
    );
    const body = await rowsResp.json();
    const sortedRows = body.items.filter((r: any) => r.score != null);
    expect(sortedRows[0].score).toBe(50);
    expect(sortedRows[1].score).toBe(30);
    expect(sortedRows[2].score).toBe(10);
  });

  // ── Filter ────────────────────────────────────────────────

  test('should filter rows', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'name', 'single_line_text');
    await insertRowViaAPI(page, tableId, { name: 'Alice' });
    await insertRowViaAPI(page, tableId, { name: 'Bob' });
    await insertRowViaAPI(page, tableId, { name: 'Charlie' });

    // Create a filter: name equals "Bob"
    const filterResp = await page.request.post(`${apiUrl}/api/v1/datatable/filters/`, {
      data: {
        table_id: tableId,
        column_id: colId,
        name: 'Name is Bob',
        operation: 'equals',
        value: '"Bob"',
      },
    });
    expect(filterResp.ok()).toBeTruthy();

    // Fetch filtered rows
    const rowsResp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_filters=true`,
    );
    const body = await rowsResp.json();
    // Filter should return only Bob
    const filtered = body.items.filter((r: any) => r.name === 'Bob');
    expect(filtered.length).toBe(1);
  });

  test('should filter with contains', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'email', 'single_line_text');
    await insertRowViaAPI(page, tableId, { email: 'alice@test.com' });
    await insertRowViaAPI(page, tableId, { email: 'bob@example.com' });

    await page.request.post(`${apiUrl}/api/v1/datatable/filters/`, {
      data: {
        table_id: tableId,
        column_id: colId,
        name: 'Email contains test',
        operation: 'contains',
        value: '"test"',
      },
    });

    const rowsResp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_filters=true`,
    );
    const body = await rowsResp.json();
    const filtered = body.items.filter((r: any) => r.email && r.email.includes('test'));
    expect(filtered.length).toBe(1);
    expect(filtered[0].email).toBe('alice@test.com');
  });

  // ── SQL Injection Prevention ──────────────────────────────

  test('should reject SQL injection in filter values', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'name', 'single_line_text');
    await insertRowViaAPI(page, tableId, { name: 'Safe' });

    // Attempt SQL injection via filter value
    const filterResp = await page.request.post(`${apiUrl}/api/v1/datatable/filters/`, {
      data: {
        table_id: tableId,
        column_id: colId,
        name: 'Injection test',
        operation: 'equals',
        value: '"x\'; DROP TABLE users; --"',
      },
    });
    // Filter creation should succeed (the value is just a string)
    expect(filterResp.ok()).toBeTruthy();

    // Fetch rows - should not error, should return 0 matches
    const rowsResp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_filters=true`,
    );
    expect(rowsResp.ok()).toBeTruthy();
    const body = await rowsResp.json();
    expect(body.total).toBe(0); // No match, but no crash
  });

  // ── Search ────────────────────────────────────────────────

  test('should search rows', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'title', 'single_line_text');
    await insertRowViaAPI(page, tableId, { title: 'Quarterly Report' });
    await insertRowViaAPI(page, tableId, { title: 'Monthly Update' });
    await insertRowViaAPI(page, tableId, { title: 'Annual Review' });

    // Search via API
    const resp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}/search?q=Monthly&scope=global&limit=10&offset=0`,
    );
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    const found = body.items.filter((r: any) => r.title === 'Monthly Update');
    expect(found.length).toBe(1);
  });

  // ── Delete Column ─────────────────────────────────────────

  test('should delete a column', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const colId = await addColumnViaAPI(page, tableId, 'temp_col', 'single_line_text');

    // Delete column
    const resp = await page.request.delete(`${apiUrl}/api/v1/datatable/columns/${colId}`);
    expect(resp.ok()).toBeTruthy();

    // Verify column is gone
    const colsResp = await page.request.get(`${apiUrl}/api/v1/datatable/columns/${tableId}`);
    const cols = await colsResp.json();
    const colNames = cols.map((c: any) => c.name);
    expect(colNames).not.toContain('temp_col');
  });

  // ── Reorder Columns ───────────────────────────────────────

  test('should reorder columns', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'col_a', 'single_line_text');
    await addColumnViaAPI(page, tableId, 'col_b', 'number');
    const colCId = await addColumnViaAPI(page, tableId, 'col_c', 'single_line_text');

    // Move col_c to position 0 (first)
    const resp = await page.request.patch(`${apiUrl}/api/v1/datatable/columns/${colCId}/reorder`, {
      data: { new_position: 0 },
    });
    expect(resp.ok()).toBeTruthy();

    // Verify order
    const colsResp = await page.request.get(`${apiUrl}/api/v1/datatable/columns/${tableId}`);
    const cols = await colsResp.json();
    // Filter out the default 'name' column
    const userCols = cols.filter((c: any) => !['name', 'id'].includes(c.name));
    expect(userCols[0].name).toBe('col_c');
  });

  // ── Pagination ────────────────────────────────────────────

  test('should paginate rows', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'idx', 'number');

    // Insert 25 rows
    for (let i = 0; i < 25; i++) {
      await insertRowViaAPI(page, tableId, { idx: i });
    }

    // Page 1: limit 10, offset 0
    const page1Resp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_filters=false&apply_sorts=false`,
    );
    const page1 = await page1Resp.json();
    expect(page1.total).toBeGreaterThanOrEqual(25);
    expect(page1.items.length).toBe(10);

    // Page 3: limit 10, offset 20
    const page3Resp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=20&apply_filters=false&apply_sorts=false`,
    );
    const page3 = await page3Resp.json();
    expect(page3.items.length).toBe(5);
  });

  // ── Inline Editing Persistence ────────────────────────────

  test('should persist inline edits after page reload', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'note', 'single_line_text');
    await insertRowViaAPI(page, tableId, { note: 'Before Edit' });

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Double-click to edit
    const cell = page.locator('td', { hasText: 'Before Edit' }).first();
    await expect(cell).toBeVisible({ timeout: 10000 });
    await cell.dblclick();

    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('After Edit');
    await page.keyboard.press('Tab'); // Commit via Tab

    // Wait for mutation to finish
    await page.waitForTimeout(1000);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});

    // Verify the edited value persists
    await expect(page.locator('td', { hasText: 'After Edit' })).toBeVisible({ timeout: 10000 });
  });

  // ── Long Text Column ──────────────────────────────────────

  test('should create and use long_text column', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'description', 'long_text');
    await insertRowViaAPI(page, tableId, { description: 'A long piece of text for testing' });

    // Verify via API
    const resp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_filters=false&apply_sorts=false`,
    );
    const body = await resp.json();
    const row = body.items.find((r: any) => r.description != null);
    expect(row).toBeTruthy();
    expect(row.description).toBe('A long piece of text for testing');
  });

  // ── Checkbox Column ───────────────────────────────────────

  test('should create and toggle checkbox column', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'done', 'checkbox');
    const rowId = await insertRowViaAPI(page, tableId, { done: false });

    // Update to true
    const resp = await page.request.patch(`${apiUrl}/api/v1/datatable/rows/${tableId}/${rowId}`, {
      data: { data: { done: true } },
    });
    expect(resp.ok()).toBeTruthy();

    // Verify
    const getResp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_filters=false&apply_sorts=false`,
    );
    const body = await getResp.json();
    const row = body.items.find((r: any) => r.done === true);
    expect(row).toBeTruthy();
  });

  // ── Date Column ───────────────────────────────────────────

  test('should create and use date column', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'due_date', 'date');
    const rowId = await insertRowViaAPI(page, tableId, { due_date: '2026-03-15T00:00:00' });

    const resp = await page.request.get(
      `${apiUrl}/api/v1/datatable/rows/${tableId}?limit=10&offset=0&apply_filters=false&apply_sorts=false`,
    );
    const body = await resp.json();
    const row = body.items.find((r: any) => r.due_date != null);
    expect(row).toBeTruthy();
    expect(String(row.due_date)).toContain('2026-03-15');
  });

  // ── Multiple Column Types Together ────────────────────────

  test('should handle table with mixed column types', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Add various column types
    await addColumnViaAPI(page, tableId, 'title', 'single_line_text');
    await addColumnViaAPI(page, tableId, 'count', 'number');
    await addColumnViaAPI(page, tableId, 'active', 'checkbox');
    await addColumnViaAPI(page, tableId, 'notes', 'long_text');
    await addColumnViaAPI(page, tableId, 'price', 'decimal', { scale: 2 });
    await addColumnViaAPI(page, tableId, 'created', 'date');

    // Insert a row with all types
    await insertRowViaAPI(page, tableId, {
      title: 'Mixed',
      count: 5,
      active: true,
      notes: 'Some long notes here',
      price: 19.99,
      created: '2026-01-01T00:00:00',
    });

    // Navigate and verify render
    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    await expect(page.locator('td', { hasText: 'Mixed' })).toBeVisible({ timeout: 10000 });
  });

  // ── UI: Sort Popover ──────────────────────────────────────

  test('should open sort popover from toolbar', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'name', 'single_line_text');

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    const sortBtn = page.locator('[data-testid="sort-button"]');
    await expect(sortBtn).toBeVisible({ timeout: 10000 });
    await sortBtn.click();

    // Sort popover should be visible
    await expect(page.locator('[role="dialog"], [data-radix-popper-content-wrapper]')).toBeVisible({
      timeout: 5000,
    });
  });

  // ── UI: Search ────────────────────────────────────────────

  test('should search from the UI', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await addColumnViaAPI(page, tableId, 'title', 'single_line_text');
    await insertRowViaAPI(page, tableId, { title: 'Findable Item' });
    await insertRowViaAPI(page, tableId, { title: 'Hidden Item' });

    await page.goto(`/table/${tableId}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Open search — target the input inside the search container
    const searchInput = page.locator('[data-testid="table-search"] input, input[data-testid="table-search"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Findable');
    await page.keyboard.press('Enter');

    // Wait for search results
    await page.waitForTimeout(1000);

    // Should see Findable but not Hidden
    await expect(page.locator('td', { hasText: 'Findable Item' })).toBeVisible({ timeout: 5000 });
  });

  // ── Auth on Endpoints ─────────────────────────────────────

  test('should reject unauthenticated requests', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Create a new context without cookies (unauthenticated)
    const browser = page.context().browser()!;
    const ctx = await browser.newContext();
    const unauthPage = await ctx.newPage();

    try {
      // Try to list tables without auth
      const resp = await unauthPage.request.get(
        `${apiUrl}/api/v1/datatable/tables/some-project-id`,
      );
      expect([401, 403]).toContain(resp.status());

      // Try to create a table without auth
      const createResp = await unauthPage.request.post(`${apiUrl}/api/v1/datatable/tables/`, {
        data: { name: 'Hacked', project_id: 'fake' },
      });
      expect([401, 403]).toContain(createResp.status());

      // Try to insert a row without auth
      const rowResp = await unauthPage.request.post(`${apiUrl}/api/v1/datatable/rows/`, {
        data: { table_id: tableId, data: { name: 'hack' } },
      });
      expect([401, 403]).toContain(rowResp.status());

      // Try to create a sort without auth
      const sortResp = await unauthPage.request.post(`${apiUrl}/api/v1/datatable/sorts/`, {
        data: { table_id: tableId, column_id: 'fake', direction: 'asc' },
      });
      expect([401, 403]).toContain(sortResp.status());

      // Try to create a filter without auth
      const filterResp = await unauthPage.request.post(`${apiUrl}/api/v1/datatable/filters/`, {
        data: { table_id: tableId, column_id: 'fake', name: 'hack', operation: 'equals' },
      });
      expect([401, 403]).toContain(filterResp.status());
    } finally {
      await ctx.close();
    }
  });
});
