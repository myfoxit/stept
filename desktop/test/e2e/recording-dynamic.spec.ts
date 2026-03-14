import { test, expect } from '@playwright/test';
import { ElectronDriver } from './helpers/electron-driver';
import { FixtureServer } from './helpers/serve-fixtures';
import { compareSnapshots, GoldenSnapshot } from './helpers/snapshot-comparator';
import * as fs from 'fs';
import * as path from 'path';

const goldenPath = path.resolve(__dirname, 'fixtures', 'golden', 'dynamic-content.json');
const golden: GoldenSnapshot = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));

let driver: ElectronDriver;
let server: FixtureServer;

test.describe('Recording: Dynamic Content', () => {
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

  test('adds tasks and interacts with dynamic list', async () => {
    const page = await driver.launch();
    const url = server.getUrl('dynamic-content.html');
    await page.goto(url);

    // Verify page loaded
    expect(await page.textContent('h1')).toBe('Task Manager');

    // Add first task
    await page.fill('#taskInput', 'Write E2E tests');
    await page.click('#addTaskBtn');

    // Verify task appears
    const firstTask = page.locator('.task-text').first();
    await expect(firstTask).toHaveText('Write E2E tests');

    // Add second task
    await page.fill('#taskInput', 'Review PR');
    await page.click('#addTaskBtn');

    // Verify counter
    const counter = page.locator('#counter');
    expect(await counter.textContent()).toContain('2 tasks');

    // Toggle first task complete
    const firstCheck = page.locator('.task-check').first();
    await firstCheck.click();
    await expect(page.locator('.task-item').first()).toHaveClass(/done/);

    // Verify counter updated
    expect(await counter.textContent()).toContain('1 completed');
  });

  test('deletes tasks from dynamic list', async () => {
    const page = await driver.launch();
    const url = server.getUrl('dynamic-content.html');
    await page.goto(url);

    // Add a task
    await page.fill('#taskInput', 'Temporary task');
    await page.click('#addTaskBtn');
    expect(await page.locator('.task-item').count()).toBe(1);

    // Delete it
    await page.click('.task-delete');
    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('adds task via Enter key', async () => {
    const page = await driver.launch();
    const url = server.getUrl('dynamic-content.html');
    await page.goto(url);

    await page.fill('#taskInput', 'Enter key task');
    await page.press('#taskInput', 'Enter');

    const task = page.locator('.task-text').first();
    await expect(task).toHaveText('Enter key task');
  });

  test('golden snapshot matches mock dynamic content workflow', async () => {
    const mockSteps = [
      {
        stepNumber: 1, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Dynamic Content - Task Manager',
        description: 'Click task input', screenshotPath: '/tmp/step_001.png',
        globalMousePosition: { x: 200, y: 200 }, relativeMousePosition: { x: 200, y: 200 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 200, y: 200 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Add a new task...', elementRole: 'AXTextField',
      },
      {
        stepNumber: 2, timestamp: new Date().toISOString(),
        actionType: 'Type', windowTitle: 'Dynamic Content - Task Manager',
        description: 'Type "My new task"', textTyped: 'my new task',
        globalMousePosition: { x: 0, y: 0 }, relativeMousePosition: { x: 0, y: 0 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 0, y: 0 }, screenshotSize: { width: 0, height: 0 },
      },
      {
        stepNumber: 3, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Dynamic Content - Task Manager',
        description: 'Click "Add"', screenshotPath: '/tmp/step_003.png',
        globalMousePosition: { x: 400, y: 200 }, relativeMousePosition: { x: 400, y: 200 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 400, y: 200 }, screenshotSize: { width: 800, height: 600 },
        elementName: 'Add', elementRole: 'AXButton',
      },
      {
        stepNumber: 4, timestamp: new Date().toISOString(),
        actionType: 'Left Click', windowTitle: 'Dynamic Content - Task Manager',
        description: 'Click checkbox',
        globalMousePosition: { x: 50, y: 300 }, relativeMousePosition: { x: 50, y: 300 },
        windowSize: { width: 800, height: 600 },
        screenshotRelativeMousePosition: { x: 50, y: 300 }, screenshotSize: { width: 800, height: 600 },
        elementName: '', elementRole: 'AXCheckBox',
      },
    ];

    const result = compareSnapshots(mockSteps as any, golden);
    expect(result.pass).toBe(true);
    expect(result.matched).toBeGreaterThanOrEqual(3);
  });
});
