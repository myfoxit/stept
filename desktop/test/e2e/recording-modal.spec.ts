import { test, expect } from '@playwright/test';
import { ElectronDriver } from './helpers/electron-driver';
import { FixtureServer } from './helpers/serve-fixtures';
import { compareSnapshots, GoldenSnapshot } from './helpers/snapshot-comparator';
import * as fs from 'fs';
import * as path from 'path';

const goldenPath = path.resolve(__dirname, 'fixtures', 'golden', 'modal-dialog.json');
const golden: GoldenSnapshot = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));

let driver: ElectronDriver;
let server: FixtureServer;

test.describe('Recording: Modal Dialog', () => {
  test.beforeAll(async () => {
    server = new FixtureServer();
    await server.start();
  });

  test.afterAll(async () => {
    await server.stop();
  });

  test.beforeEach(async () => {
    driver = new ElectronDriver();
  });

  test.afterEach(async () => {
    await driver.close();
  });

  test('navigates to modal dialog page and interacts with modal', async () => {
    const page = await driver.launch();
    const url = server.getUrl('modal-dialog.html');
    await page.goto(url);

    // Verify page loaded
    const heading = await page.textContent('h1');
    expect(heading).toBe('Account Settings');

    // Click "Delete Account" to open modal
    await page.click('#deleteBtn');

    // Verify modal is visible
    const modal = page.locator('#modalOverlay');
    await expect(modal).toHaveClass(/active/);

    // Verify modal content
    const modalTitle = await page.textContent('#modalTitle');
    expect(modalTitle).toBe('Delete Account?');

    // Click Cancel
    await page.click('#cancelBtn');

    // Verify modal closed and cancellation shown
    await expect(modal).not.toHaveClass(/active/);
    const cancelResult = page.locator('#cancelledResult');
    await expect(cancelResult).toBeVisible();
  });

  test('modal confirm workflow', async () => {
    const page = await driver.launch();
    const url = server.getUrl('modal-dialog.html');
    await page.goto(url);

    // Open modal
    await page.click('#deleteBtn');
    await expect(page.locator('#modalOverlay')).toHaveClass(/active/);

    // Click Confirm
    await page.click('#confirmBtn');

    // Verify confirmation
    await expect(page.locator('#modalOverlay')).not.toHaveClass(/active/);
    await expect(page.locator('#confirmedResult')).toBeVisible();
  });

  test('golden snapshot matches mock modal workflow', async () => {
    const mockSteps = [
      {
        stepNumber: 1, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Modal Dialog - Confirmation',
        description: 'Click "Delete Account"', screenshotPath: '/tmp/step_001.png',
        globalMousePosition: { x: 300, y: 400 }, relativeMousePosition: { x: 300, y: 400 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 300, y: 400 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Delete Account', elementRole: 'AXButton', elementDescription: 'Delete button',
      },
      {
        stepNumber: 2, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Modal Dialog - Confirmation',
        description: 'Click "Cancel"', screenshotPath: '/tmp/step_002.png',
        globalMousePosition: { x: 350, y: 450 }, relativeMousePosition: { x: 350, y: 450 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 350, y: 450 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Cancel', elementRole: 'AXButton', elementDescription: 'Cancel button',
      },
    ];

    const result = compareSnapshots(mockSteps as any, golden);
    expect(result.pass).toBe(true);
    expect(result.matched).toBe(2);
  });
});
