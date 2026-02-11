import { test, expect } from './fixtures/auth.fixture';

test.describe('Folder Operations', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Wait for app to load
    await page.waitForLoadState('networkidle');
    
    // Ensure sidebar is visible
    const sidebar = page.locator('[data-testid="sidebar"], aside, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    
    // Wait for Pages section to be loaded
    await expect(page.locator('text="Pages"').first()).toBeVisible({ timeout: 10000 });
  });

  test('should create a new folder', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Click New Folder button
    const newFolderButton = page.locator('button:has-text("New Folder")').first();
    await expect(newFolderButton).toBeVisible({ timeout: 10000 });
    await newFolderButton.click();
    
    // Fill folder name in dialog
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    
    const input = dialog.locator('input').first();
    await input.fill('Test Folder');
    
    // Click Create button
    await dialog.locator('button:has-text("Create")').click();
    
    // Wait for dialog to close
    await expect(dialog).not.toBeVisible();
    
    // Verify folder appears in sidebar
    await expect(page.locator('text="Test Folder"')).toBeVisible({ timeout: 5000 });
  });

  test('should rename a folder', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // First create a folder
    await page.locator('button:has-text("New Folder")').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input').first().fill('Original Name');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible();
    
    // Wait for folder to appear
    const folderRow = page
      .getByTestId('folder-row')
      .filter({ hasText: 'Original Name' })
      .first();
    await expect(folderRow).toBeVisible();

    // Hover to show menu button
    await folderRow.hover();

    // Stable menu button locator via test id
    const menuButton = folderRow.getByTestId('folder-menu-button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click({ force: true });
    
    // Click Rename option
    await page.locator('[role="menuitem"]:has-text("Rename")').click();
    
    // Change the name in dialog
    const renameDialog = page.locator('[role="dialog"]');
    const renameInput = renameDialog.locator('input').first();
    await renameInput.clear();
    await renameInput.fill('Renamed Folder');
    await renameDialog.locator('button:has-text("Save")').click();
    
    // Verify rename
    await expect(page.locator('text="Renamed Folder"')).toBeVisible();
    await expect(page.locator('text="Original Name"')).not.toBeVisible();
  });

  test('should create nested folders', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Create parent folder
    await page.locator('button:has-text("New Folder")').click();
    let dialog = page.locator('[role="dialog"]');
    await dialog.locator('input').first().fill('Parent Folder');
    await dialog.locator('button:has-text("Create")').click();
    await expect(dialog).not.toBeVisible();
    
    // Wait for parent folder row
    const parentRow = page
      .getByTestId('folder-row')
      .filter({ hasText: 'Parent Folder' })
      .first();
    await expect(parentRow).toBeVisible();
    
    // Hover over parent folder row
    await parentRow.hover();

    // Use test id for menu button
    const menuButton = parentRow.getByTestId('folder-menu-button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click({ force: true });
    
    // Wait for menu to appear
    await expect(page.locator('[role="menuitem"]').first()).toBeVisible();
    
    // Click New Subfolder
    await page.locator('[role="menuitem"]:has-text("New Subfolder")').click();
    
    // Fill subfolder name
    dialog = page.locator('[role="dialog"]');
    await dialog.locator('input').first().fill('Child Folder');
    await dialog.locator('button:has-text("Create")').click();
    await expect(dialog).not.toBeVisible();
    
    // Verify nested structure
    await expect(page.locator('text="Parent Folder"')).toBeVisible();
    await expect(page.locator('text="Child Folder"')).toBeVisible();
  });

  test('should delete a folder', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Create a folder to delete
    await page.locator('button:has-text("New Folder")').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input').first().fill('Folder to Delete');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible();
    
    // Verify folder exists
    const folderToDelete = page.locator('text="Folder to Delete"').first();
    await expect(folderToDelete).toBeVisible();
    
    // Get folder row and hover
    const folderRow = page
      .getByTestId('folder-row')
      .filter({ hasText: 'Folder to Delete' })
      .first();
    await expect(folderRow).toBeVisible();
    await folderRow.hover();

    const menuButton = folderRow.getByTestId('folder-menu-button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click({ force: true });
    
    // Click Delete
    await page.locator('[role="menuitem"]:has-text("Delete")').click();
    
    // Confirm deletion in dialog
    const deleteDialog = page.locator('[role="dialog"]');
    await deleteDialog.locator('button:has-text("Delete")').last().click();
    
    // Verify folder is deleted
    await expect(page.locator('text="Folder to Delete"')).not.toBeVisible();
  });

  test('should duplicate a folder', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Create a folder
    await page.locator('button:has-text("New Folder")').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input').first().fill('Original Folder');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible();
    
    // Get original folder row and hover
    const folderRow = page
      .getByTestId('folder-row')
      .filter({ hasText: 'Original Folder' })
      .first();
    await expect(folderRow).toBeVisible();
    await folderRow.hover();

    const menuButton = folderRow.getByTestId('folder-menu-button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click({ force: true });
    
    // Click Duplicate
    await page.locator('[role="menuitem"]:has-text("Duplicate")').click();
    
    // Verify both folders exist
    await expect(page.locator('text="Original Folder"')).toBeVisible();
    await expect(page.locator('text="Original Folder (Copy)"')).toBeVisible();
  });

  test('should expand and collapse folders', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Create parent folder
    await page.locator('button:has-text("New Folder")').click();
    let dialog = page.locator('[role="dialog"]');
    await dialog.locator('input').first().fill('Expandable Folder');
    await dialog.locator('button:has-text("Create")').click();
    await expect(dialog).not.toBeVisible();
    
    const parentRow = page
      .getByTestId('folder-row')
      .filter({ hasText: 'Expandable Folder' })
      .first();
    await expect(parentRow).toBeVisible();
    
    // Create a child folder inside Expandable Folder
    await parentRow.hover();
    const menuButton = parentRow.getByTestId('folder-menu-button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click({ force: true });
    
    // Click New Subfolder
    await page.locator('[role="menuitem"]:has-text("New Subfolder")').click();
    
    // Fill subfolder name
    dialog = page.locator('[role="dialog"]');
    await dialog.locator('input').first().fill('Hidden Child');
    await dialog.locator('button:has-text("Create")').click();
    await expect(dialog).not.toBeVisible();
    
    // Verify child is visible (folder should auto-expand after creating child)
    await expect(page.locator('text="Hidden Child"')).toBeVisible({ timeout: 5000 });

    // Get the chevron button to collapse
    const chevronButton = parentRow.locator('button').first();
    
    // Click chevron to collapse
    await chevronButton.click();

    // Child should be hidden
    await expect(page.locator('text="Hidden Child"')).not.toBeVisible();
    
    // Click chevron to expand
    await chevronButton.click();
    
    // Child should be visible again
    await expect(page.locator('text="Hidden Child"')).toBeVisible();
  });

  test('should move folder via drag and drop', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Create two folders
    await page.locator('button:has-text("New Folder")').click();
    let dialog = page.locator('[role="dialog"]');
    await dialog.locator('input').first().fill('Folder A');
    await dialog.locator('button:has-text("Create")').click();
    await expect(dialog).not.toBeVisible();
    
    await page.locator('button:has-text("New Folder")').click();
    dialog = page.locator('[role="dialog"]');
    await dialog.locator('input').first().fill('Folder B');
    await dialog.locator('button:has-text("Create")').click();
    await expect(dialog).not.toBeVisible();
    
    // Wait for both folder rows
    const folderARow = page
      .getByTestId('folder-row')
      .filter({ hasText: 'Folder A' })
      .first();
    const folderBRow = page
      .getByTestId('folder-row')
      .filter({ hasText: 'Folder B' })
      .first();

    await expect(folderARow).toBeVisible();
    await expect(folderBRow).toBeVisible();
    
    // Drag Folder B into Folder A
    await folderBRow.dragTo(folderARow);

    // Replace fixed wait with expectation that Folder B appears as a child (border-l container)
    const folderBAfterMove = page.locator('text="Folder B"').first();
    const folderBParent = folderBAfterMove.locator('xpath=ancestor::div[contains(@class, "border-l")]').first();
    await expect(folderBParent).toBeVisible({ timeout: 5000 });
  });
});
