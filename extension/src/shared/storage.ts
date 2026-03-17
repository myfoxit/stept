// Direct port of storage.js — IndexedDB wrapper for screenshot blobs.
// The only change is: named exports instead of self.screenshotDB assignment.

const DB_NAME = 'stept-recordings';
const DB_VERSION = 1;
const STORE_NAME = 'screenshots';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'stepId' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[Stept] IndexedDB open error:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function saveScreenshot(stepId: string, dataUrl: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ stepId, dataUrl, timestamp: Date.now() });

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject((event.target as IDBTransaction).error);
  });
}

export async function getScreenshot(stepId: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(stepId);

    request.onsuccess = () => {
      resolve(request.result ? request.result.dataUrl : null);
    };
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

export async function getAllScreenshots(): Promise<Record<string, string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const map: Record<string, string> = {};
      for (const record of request.result) {
        map[record.stepId] = record.dataUrl;
      }
      resolve(map);
    };
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

export async function deleteScreenshot(stepId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(stepId);

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject((event.target as IDBTransaction).error);
  });
}

export async function clearAllScreenshots(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject((event.target as IDBTransaction).error);
  });
}

export async function migrateFromChromeStorage(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['persistedSteps'], async (result) => {
      if (!result.persistedSteps || !Array.isArray(result.persistedSteps)) {
        resolve(false);
        return;
      }

      let migrated = 0;
      for (const step of result.persistedSteps) {
        if (step.screenshotDataUrl) {
          const stepId = `step_${step.stepNumber}`;
          try {
            await saveScreenshot(stepId, step.screenshotDataUrl);
            migrated++;
          } catch (e) {
            console.error('[Stept] Migration failed for step', step.stepNumber, e);
          }
        }
      }

      if (migrated > 0) {
        // Update persistedSteps to remove data URLs (keep metadata only)
        const lightweight = result.persistedSteps.map((s: any) => ({
          ...s,
          screenshotDataUrl: s.screenshotDataUrl ? `idb:step_${s.stepNumber}` : null,
        }));
        await chrome.storage.local.set({ persistedSteps: lightweight });
      }

      resolve(migrated > 0);
    });
  });
}
