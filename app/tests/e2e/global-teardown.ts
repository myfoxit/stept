/**
 * Global teardown: clean up test data created during the run.
 */
import { cleanupTestData } from './helpers/seed';

export default async function globalTeardown() {
  await cleanupTestData();
}
