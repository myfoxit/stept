import { getTestUrls } from './config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DATA_PATH = path.join(__dirname, '..', '..', '..', 'playwright', '.auth', 'seed-data.json');

export type TestSeedData = {
  user_id: string;
  project_id: string;
  email: string;
  password: string;
};

// Alias for backwards compat with fixtures
export type TestData = TestSeedData;

function getApiUrl(): string {
  return getTestUrls().apiUrl;
}

/**
 * Persist seed data to disk so worker processes can read it.
 * (global-setup runs in a separate process from test workers)
 */
export function setGlobalTestData(data: TestSeedData) {
  const dir = path.dirname(SEED_DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SEED_DATA_PATH, JSON.stringify(data, null, 2));
}

/**
 * Read seed data from disk. Returns null if not seeded yet.
 */
export function getGlobalTestData(): TestSeedData | null {
  try {
    if (fs.existsSync(SEED_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

export async function seedTestData(): Promise<TestSeedData> {
  const res = await fetch(`${getApiUrl()}/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(
      `Failed to seed test data: ${res.status} ${res.statusText} - ${JSON.stringify(body)}`,
    );
  }

  const data = (await res.json()) as TestSeedData;
  return data;
}

export async function cleanupTestData(): Promise<void> {
  try {
    const res = await fetch(`${getApiUrl()}/test/cleanup`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const body = await safeJson(res);
      console.warn(
        `cleanupTestData non-OK response: ${res.status} ${res.statusText} - ${JSON.stringify(body)}`,
      );
    }
    console.log('Test data cleaned up');
  } catch (err) {
    console.warn('cleanupTestData request failed:', err);
  } finally {
    // Remove seed data file
    try {
      if (fs.existsSync(SEED_DATA_PATH)) {
        fs.unlinkSync(SEED_DATA_PATH);
      }
    } catch {
      // ignore
    }
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
