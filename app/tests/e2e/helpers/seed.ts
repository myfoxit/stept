import { getTestUrls } from './config';

function getApiUrl(): string {
  return getTestUrls().apiUrl;
}

export type TestSeedData = {
  user_id: string;
  project_id: string;
  email: string;
  password: string;
};

let globalTestData: TestSeedData | null = null;

export function setGlobalTestData(data: TestSeedData) {
  globalTestData = data;
}

export function getGlobalTestData(): TestSeedData | null {
  return globalTestData;
}

export async function seedTestData(): Promise<TestSeedData> {
  const res = await fetch(`${getApiUrl()}/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(
      `Failed to seed test data: ${res.status} ${res.statusText} - ${JSON.stringify(
        body,
      )}`,
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
        `cleanupTestData non-OK response: ${res.status} ${res.statusText} - ${JSON.stringify(
          body,
        )}`,
      );
    }
  } catch (err) {
    console.warn('cleanupTestData request failed:', err);
  } finally {
    globalTestData = null;
  }
}

export async function getTestSeedStatus(): Promise<any> {
  const res = await fetch(`${getApiUrl()}/test/status`, {
    method: 'GET',
  });

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(
      `Failed to get test seed status: ${res.status} ${res.statusText} - ${JSON.stringify(
        body,
      )}`,
    );
  }

  return res.json();
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
