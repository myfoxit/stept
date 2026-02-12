import { test, expect } from './fixtures/auth.fixture';

test.describe('Folder Operations', () => {
  test('should display shared section with new folder button', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Sidebar should be visible
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // "New Shared Folder" button in the Shared section
    const newSharedFolder = page.locator('text="New Shared Folder"');
    await expect(newSharedFolder).toBeVisible({ timeout: 10000 });
  });

  test('should display private section with new folder button', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // "New Private Folder" button in the Private section
    const newPrivateFolder = page.locator('text="New Private Folder"');
    await expect(newPrivateFolder).toBeVisible({ timeout: 10000 });
  });

  test('should create a shared folder', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Click "New Shared Folder"
    await page.locator('text="New Shared Folder"').click();

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('text="Create Shared Folder"')).toBeVisible();

    // Fill in folder name
    const input = dialog.locator('input#name');
    await input.fill('Test Shared Folder');

    // Click Create
    await dialog.locator('button:has-text("Create")').click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Folder should appear in sidebar
    await expect(page.locator('text="Test Shared Folder"')).toBeVisible({ timeout: 5000 });
  });

  test('should create a private folder', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Click "New Private Folder"
    await page.locator('text="New Private Folder"').click();

    // Dialog should appear with "Create Private Folder" title
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('text="Create Private Folder"')).toBeVisible();

    // Fill in folder name
    const input = dialog.locator('input#name');
    await input.fill('Test Private Folder');

    // Click Create
    await dialog.locator('button:has-text("Create")').click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Folder should appear in sidebar
    await expect(page.locator('text="Test Private Folder"')).toBeVisible({ timeout: 5000 });
  });

  test('should rename a folder via context menu', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Create a folder first
    await page.locator('text="New Shared Folder"').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input#name').fill('Folder To Rename');
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
    await page.locator('text="New Shared Folder"').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input#name').fill('Folder To Delete');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible({ timeout: 5000 });

    // Wait for folder to appear
    const folderRow = page.getByTestId('folder-row').filter({ hasText: 'Folder To Delete' }).first();
    await expect(folderRow).toBeVisible({ timeout: 5000 });
    await folderRow.hover();

    // Open context menu
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

  test('should create a subfolder via context menu', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Create parent folder
    await page.locator('text="New Shared Folder"').click();
    const createDialog = page.locator('[role="dialog"]');
    await createDialog.locator('input#name').fill('Parent Folder');
    await createDialog.locator('button:has-text("Create")').click();
    await expect(createDialog).not.toBeVisible({ timeout: 5000 });

    // Find parent and open context menu
    const parentRow = page.getByTestId('folder-row').filter({ hasText: 'Parent Folder' }).first();
    await expect(parentRow).toBeVisible({ timeout: 5000 });
    await parentRow.hover();

    const menuButton = parentRow.getByTestId('folder-menu-button').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click({ force: true });

    // Click "New Subfolder"
    await page.locator('[role="menuitem"]:has-text("New Subfolder")').click();

    // Fill subfolder name in dialog
    const subDialog = page.locator('[role="dialog"]');
    await expect(subDialog).toBeVisible({ timeout: 5000 });
    await subDialog.locator('input').first().fill('Child Folder');
    await subDialog.locator('button:has-text("Create")').click();
    await expect(subDialog).not.toBeVisible({ timeout: 5000 });

    // Both folders should be visible
    await expect(page.locator('text="Parent Folder"')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text="Child Folder"')).toBeVisible({ timeout: 5000 });
  });
});
