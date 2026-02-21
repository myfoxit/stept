import { getTestUrls } from './config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DATA_PATH = path.join(__dirname, '..', '..', '..', 'playwright', '.auth', 'seed-data.json');

export interface TestData {
  user_id: string;
  project_id: string;
  email: string;
  password: string;
}

/**
 * Persist seed data to disk so Playwright worker processes can read it.
 * Global-setup runs in a separate process from test workers.
 */
export function setGlobalTestData(data: TestData): void {
  const dir = path.dirname(SEED_DATA_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SEED_DATA_PATH, JSON.stringify(data, null, 2));
}

export function getGlobalTestData(): TestData | null {
  try {
    if (fs.existsSync(SEED_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf-8'));
    }
  } catch {
    // Corrupted file — treat as missing
  }
  return null;
}

export async function seedTestData(): Promise<TestData> {
  const { apiUrl } = getTestUrls();
  const res = await fetch(`${apiUrl}/test/seed`, { method: 'POST' });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Seed failed: ${res.status} ${res.statusText} — ${body}`);
  }

  return (await res.json()) as TestData;
}

export async function cleanupTestData(): Promise<void> {
  const { apiUrl } = getTestUrls();

  try {
    const res = await fetch(`${apiUrl}/test/cleanup`, { method: 'DELETE' });
    if (!res.ok) {
      console.warn(`Cleanup returned ${res.status}: ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    console.warn('Cleanup request failed (test backend may not be running):', err);
  }

  // Remove seed data file
  try { fs.unlinkSync(SEED_DATA_PATH); } catch { /* missing is fine */ }
}
