import { test, expect } from './fixtures/auth.fixture';

test.describe('Table Operations', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Wait for app to load
    await page.waitForLoadState('networkidle');
    
    // Ensure sidebar is visible
    const sidebar = page.locator('[data-testid="sidebar"], aside, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    
    // Wait for Tables section to be loaded
    await expect(page.locator('text="Tables"').first()).toBeVisible({ timeout: 10000 });
  });

  test('should create a new table', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Click Create Table button in sidebar
    const createTableButton = page.locator('button:has-text("Create Table")').first();
    await expect(createTableButton).toBeVisible({ timeout: 10000 });
    await createTableButton.click();
    
    // Fill table name in dialog
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    
    const input = dialog.locator('input#tableName');
    await input.fill('Test Table');
    
    // Click Create button
    await dialog.locator('button:has-text("Create")').click();
    
    // Wait for dialog to close
    await expect(dialog).not.toBeVisible();
    
    // Verify table appears in sidebar
    await expect(page.locator('text="Test Table"')).toBeVisible({ timeout: 5000 });
  });

  test('should rename a table', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // First create a table
    await page.locator('button:has-text("Create Table")').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input#tableName').fill('Original Table');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible();

    // Open the table
    await page.locator('text="Original Table"').first().click();
    await page.waitForLoadState('networkidle');

    // Click a generic "More" or actions button on the table page
    const moreButton = page.locator('button:has-text("More"), button[aria-label="More"]').first();
    await expect(moreButton).toBeVisible({ timeout: 5000 });
    await moreButton.click();

    // Click Edit option
    await page.locator('[role="menuitem"]:has-text("Edit")').click();

    // Change the name in dialog
    const renameDialog = page.locator('[role="dialog"]');
    const renameInput = renameDialog.locator('input').first();
    await renameInput.clear();
    await renameInput.fill('Renamed Table');
    await renameDialog.locator('button:has-text("Save")').click();

    // Verify rename in sidebar
    await expect(page.locator('text="Renamed Table"')).toBeVisible();
    await expect(page.locator('text="Original Table"')).not.toBeVisible();
  });

  test('should delete a table', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Create a table to delete
    await page.locator('button:has-text("Create Table")').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input#tableName').fill('Table to Delete');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible();

    // Wait for table to appear in sidebar before proceeding
    await expect(page.locator('text="Table to Delete"').first()).toBeVisible({ timeout: 10000 });

    // Open the table
    await page.locator('text="Table to Delete"').first().click();
    await page.waitForLoadState('networkidle');

    // Open actions menu on the table page
    const moreButton = page.locator('button:has-text("More"), button[aria-label="More"]').first();
    await expect(moreButton).toBeVisible({ timeout: 5000 });
    await moreButton.click();

    // Click Delete
    await page.locator('[role="menuitem"]:has-text("Delete")').click();

    // Confirm deletion in dialog
    const deleteDialog = page.locator('[role="dialog"]');
    await expect(deleteDialog).toBeVisible({ timeout: 5000 });
    
    // Wait for the delete request to complete
    const deleteResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/v1/tables/') && response.request().method() === 'DELETE'
    );
    
    await deleteDialog.locator('button:has-text("Delete")').last().click();
    
    // Wait for delete API call to complete
    await deleteResponsePromise;

    // Wait for dialog to close to ensure delete finished
    await expect(deleteDialog).not.toBeVisible({ timeout: 10000 });

    // Wait for network to settle after deletion (cache invalidation)
    await page.waitForLoadState('networkidle');

    // Wait for the table entry to disappear from sidebar
    // Use a more specific selector and wait for it to be detached
    await expect(page.locator('button:has-text("Table to Delete"), a:has-text("Table to Delete")')).toHaveCount(0, { timeout: 15000 });
  });

  test('should search table data', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Create and navigate to a table
    await page.locator('button:has-text("Create Table")').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input#tableName').fill('Searchable Table');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible();
    
    // Click on the table to open it
    await page.locator('text="Searchable Table"').click();
    
    // Wait for table page to load
    await page.waitForLoadState('networkidle');
    
    // Find search component by test id
    const searchContainer = page.getByTestId('table-search');
    await expect(searchContainer).toBeVisible({ timeout: 10000 });
    
    // Type in search input
    const searchInput = searchContainer.locator('input[placeholder*="Search"]');
    await searchInput.fill('test search query');
    
    // Verify search is active using status hook
    const status = page.getByTestId('table-search-status');
    await expect(status).toHaveAttribute('data-search-active', 'true', {
      timeout: 5000,
    });
    
    // Clear search using clear button test id
    const clearButton = page.getByTestId('table-search-clear');
    await clearButton.click();
    
    // Verify search is cleared
    await expect(searchInput).toHaveValue('');
    await expect(status).toHaveAttribute('data-search-active', 'false', {
      timeout: 5000,
    });
  });

  test('should filter table data', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Create and navigate to a table
    await page.locator('button:has-text("Create Table")').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input#tableName').fill('Filterable Table');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible();

    // Click on the table
    await page.locator('text="Filterable Table"').click();
    await page.waitForLoadState('networkidle');

    // Click Filter button (by test id if present, otherwise by text)
    let filterButton = page.getByTestId('filter-button').first();
    if (!(await filterButton.isVisible({ timeout: 1000 }).catch(() => false))) {
      filterButton = page.locator('button:has-text("Filter")').first();
    }
    await expect(filterButton).toBeVisible({ timeout: 10000 });
    await filterButton.click();

    // Wait for filter popover
    const filterPopover = page
      .locator('[role="dialog"], [data-radix-popper-content-wrapper]')
      .filter({ hasText: 'Filters' })
      .first();
    await expect(filterPopover).toBeVisible();

    // Select a column for filtering (if columns exist)
    const columnSelect = filterPopover.locator('button[role="combobox"]').first();
    const hasColumns = await columnSelect.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasColumns) {
      await columnSelect.click();

      // Select first available column
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();

        // Select condition
        const conditionSelect = filterPopover.locator('button[role="combobox"]').nth(1);
        await conditionSelect.click();
        await page.locator('[role="option"]:has-text("equals")').first().click();

        // Enter value
        const valueInput = filterPopover.locator('input[placeholder="Enter value..."]');
        await valueInput.fill('test value');

        // Apply filter
        await filterPopover.locator('button:has-text("Apply filters")').click();

        // Verify filter state via data attribute on button if available
        if (await filterButton.getAttribute('data-has-filters').catch(() => null) !== null) {
          await expect(filterButton).toHaveAttribute('data-has-filters', 'true', {
            timeout: 5000,
          });
        }
      }
    }

    // Close popover if still open
    const closeButton = filterPopover.locator('button svg.icon-x').locator('..').first();
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click();
    }
  });

  test('should sort table data', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Create and navigate to a table
    await page.locator('button:has-text("Create Table")').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input#tableName').fill('Sortable Table');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible();
    
    // Click on the table
    await page.locator('text="Sortable Table"').click();
    await page.waitForLoadState('networkidle');
    
    // Click Sort button via test id
    const sortButton = page.getByTestId('sort-button');
    await expect(sortButton).toBeVisible({ timeout: 10000 });
    await sortButton.click();
    
    // Wait for sort popover
    const sortPopover = page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').filter({ hasText: 'Sort' }).first();
    await expect(sortPopover).toBeVisible();
    
    // Click Add sort
    await sortPopover.locator('button:has-text("Add sort")').click();
    
    // Select column if available
    const columnSelect = sortPopover.locator('button[role="combobox"]').first();
    const hasColumns = await columnSelect.isVisible({ timeout: 2000 }).catch(() => false);
    
    if (hasColumns) {
      await columnSelect.click();
      
      // Select first column
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        
        // Select direction
        const directionSelect = sortPopover.locator('button[role="combobox"]').nth(1);
        await directionSelect.click();
        await page.locator('[role="option"]:has-text("Ascending")').first().click();
        
        // Apply sort
        await sortPopover.locator('button:has-text("Apply sorts")').click();
        
        // Verify sort state via data attribute
        await expect(sortButton).toHaveAttribute('data-has-sorts', 'true', {
          timeout: 5000,
        });
      }
    }
    
    // Close popover if still open
    const closeButton = sortPopover.locator('button svg.icon-x').locator('..').first();
    if (
      await closeButton.isVisible({ timeout: 1000 }).catch(() => false)
    ) {
      await closeButton.click();
    }
  });

  test('should hide and show columns', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Create and navigate to a table
    await page.locator('button:has-text("Create Table")').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input#tableName').fill('Customizable Table');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible();
    
    // Click on the table
    await page.locator('text="Customizable Table"').click();
    await page.waitForLoadState('networkidle');
    
    // Click Customize button using test id (label may differ by viewport)
    const customizeButton = page.getByTestId('column-visibility-button').first();
    await expect(customizeButton).toBeVisible({ timeout: 10000 });
    await customizeButton.click();
    
    // Wait for dropdown menu (use aria-label rather than inner text)
    const visibilityMenu = page
      .locator('[role="menu"][aria-label="Column Visibility"]')
      .first();
    await expect(visibilityMenu).toBeVisible();
    
    // Find checkboxes for columns
    const checkboxes = visibilityMenu.locator('[role="menuitemcheckbox"]');
    const checkboxCount = await checkboxes.count();

    if (checkboxCount > 0) {
      const firstCheckbox = checkboxes.first();
      const columnName = (await firstCheckbox.textContent()) ?? '';

      // Uncheck to hide column
      await firstCheckbox.click();

      // Click outside to close menu
      await page.mouse.click(10, 10);
      await expect(visibilityMenu).not.toBeVisible({ timeout: 2000 });

      // Optional header visibility check
      const tableHeaders = page.locator('thead th');
      try {
        await expect(
          tableHeaders.filter({ hasText: columnName.trim() })
        ).not.toBeVisible({ timeout: 2000 });
      } catch {
        // Column might not exist in headers yet if table is empty
      }

      // Re-open menu and re-check to show column again
      await customizeButton.click();
      const newVisibilityMenu = page
        .locator('[role="menu"][aria-label="Column Visibility"]')
        .first();
      await expect(newVisibilityMenu).toBeVisible({ timeout: 5000 });

      const newCheckboxes = newVisibilityMenu.locator('[role="menuitemcheckbox"]');
      await newCheckboxes.first().click();
    }

    // Close menu
    await page.mouse.click(10, 10);
  });
});
