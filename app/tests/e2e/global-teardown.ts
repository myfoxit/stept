import { cleanupTestData } from './helpers/seed';
import { getTestUrls } from './helpers/config';

async function globalTeardown() {
  console.log('Running global teardown...');

  const { apiUrl } = getTestUrls();
  console.log(`Using API URL: ${apiUrl}`);

  // Final cleanup of test data
  try {
    await cleanupTestData();
    console.log('Test data cleaned up');
  } catch (error) {
    console.warn('Failed to cleanup test data:', error);
  }

  console.log('Global teardown complete');
}

export default globalTeardown;
