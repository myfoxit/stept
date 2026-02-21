import { test, expect } from './fixtures/auth.fixture';

test.describe('Folder Operations', () => {
  test('should display sidebar with folder section', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('should have new folder button', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // FolderPlus button with title="New Folder"
    const newFolderBtn = page.locator('button[title="New Folder"]').first();
    await expect(newFolderBtn).toBeVisible({ timeout: 10000 });
  });

  test('should create a folder', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Click "New Folder" button
    const newFolderBtn = page.locator('button[title="New Folder"]').first();
    await newFolderBtn.click();

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill in folder name
    const input = dialog.locator('input').first();
    await input.fill('Test Folder');

    // Click Create
    await dialog.locator('button:has-text("Create")').click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Folder should appear in sidebar
    await expect(page.locator('text="Test Folder"')).toBeVisible({ timeout: 5000 });
  });

  test('should rename a folder via context menu', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Create a folder first
    const newFolderBtn = page.locator('button[title="New Folder"]').first();
    await newFolderBtn.click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input').first().fill('Folder To Rename');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible({ timeout: 5000 });

    // Find the folder row and hover to show menu
    const folderRow = page.getByTestId('folder-row').filter({ hasText: 'Folder To Rename' }).first();
    await expect(folderRow).toBeVisible({ timeout: 5000 });
    await folderRow.hover();

    // Click the menu button
    const menuButton = folderRow.getByTestId('folder-menu-button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click({ force: true });

    // Click Rename in the dropdown
    await page.locator('[role="menuitem"]:has-text("Rename")').click();

    // Rename dialog should appear
    const renameDialog = page.locator('[role="dialog"]');
    await expect(renameDialog).toBeVisible({ timeout: 5000 });

    const renameInput = renameDialog.locator('input').first();
    await renameInput.clear();
    await renameInput.fill('Renamed Folder');
    await renameDialog.locator('button:has-text("Save")').click();

    // Verify the rename
    await expect(page.locator('text="Renamed Folder"')).toBeVisible({ timeout: 5000 });
  });

  test('should delete a folder via context menu', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Create a folder first
    const newFolderBtn = page.locator('button[title="New Folder"]').first();
    await newFolderBtn.click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input').first().fill('Folder To Delete');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible({ timeout: 5000 });

    // Find folder and open context menu
    const folderRow = page.getByTestId('folder-row').filter({ hasText: 'Folder To Delete' }).first();
    await expect(folderRow).toBeVisible({ timeout: 5000 });
    await folderRow.hover();

    const menuButton = folderRow.getByTestId('folder-menu-button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click({ force: true });

    // Click Delete
    await page.locator('[role="menuitem"]:has-text("Delete")').click();

    // Confirm deletion in dialog
    const deleteDialog = page.locator('[role="dialog"]');
    await expect(deleteDialog).toBeVisible({ timeout: 5000 });
    await deleteDialog.locator('button:has-text("Delete")').last().click();

    // Folder should be gone
    await expect(page.locator('text="Folder To Delete"')).not.toBeVisible({ timeout: 5000 });
  });
});
