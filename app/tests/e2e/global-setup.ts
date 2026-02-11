// app/tests/e2e/global-setup.ts
import { chromium, FullConfig } from '@playwright/test';
import { seedTestData, cleanupTestData, setGlobalTestData } from './helpers/seed';
import { getTestUrls } from './helpers/config';

async function globalSetup(config: FullConfig) {
  console.log('Running global setup...');
  const { apiUrl, appUrl } = getTestUrls();
  console.log(`🌐 Global Setup expects API at: ${apiUrl}`);
  console.log(`🌐 Global Setup expects App at: ${appUrl}`);

  // Set env vars for tests running in this process
  process.env.API_URL = apiUrl;
  process.env.PLAYWRIGHT_BASE_URL = appUrl;

  try {
    await cleanupTestData();
    const testData = await seedTestData();
    setGlobalTestData(testData);

    const browser = await chromium.launch();
    const page = await browser.newPage();

    // --- 🔍 DEBUGGING LISTENERS ---
    // 1. Listen for Console Logs from the browser
    page.on('console', msg => console.log(`[Browser Console]: ${msg.text()}`));
    
    // 2. Listen for Failed Network Requests
    page.on('requestfailed', request => {
      console.log(`[Network Error]: ${request.url()} - ${request.failure()?.errorText}`);
    });

    // 3. Listen for Responses to see which API we are hitting
    page.on('response', response => {
      if (response.url().includes('/auth') || response.url().includes('/login')) {
        console.log(`[API Response]: ${response.status()} from ${response.url()}`);
      }
    });
    // -----------------------------

    console.log(`Navigating to login: ${appUrl}/login`);
    await page.goto(`${appUrl}/login`);

    await page.fill('input[type="email"]', testData.email);
    await page.fill('input[type="password"]', testData.password);
    await page.click('button[type="submit"]');

    // Wait for redirect - match root, dashboard, projects, or any authenticated route
    try {
      // First, wait for navigation away from /login
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
      console.log(`✅ Login successful, redirected to: ${page.url()}`);
      
      // Additionally, wait for the page to be in a stable authenticated state
      // by checking that we're no longer on the login page and the page has loaded
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
        console.log('Network idle timeout (non-fatal), continuing...');
      });
      
    } catch (e) {
      console.error("❌ Login Timeout! Dumping page state...");
      console.log("Current URL:", page.url());
      // Check if there is an error message on screen
      const errorText = await page.locator('.error, [role="alert"]').allInnerTexts();
      console.log("Visible Error Messages:", errorText);
      // Take a screenshot for debugging
      await page.screenshot({ path: 'playwright/.auth/login-failure.png' });
      throw e;
    }

    await page.context().storageState({ path: 'playwright/.auth/user.json' });
    await browser.close();
    
  } catch (error) {
    console.error('Global setup failed:', error);
    throw error;
  }
}

export default globalSetup;