/**
 * IndexedDB storage for screenshots.
 * Replaces chrome.storage.local for large binary data (screenshot data URLs).
 *
 * DB: stept-recordings
 * Object store: screenshots (key: stepId)
 */

const DB_NAME = 'stept-recordings';
const DB_VERSION = 1;
const STORE_NAME = 'screenshots';

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'stepId' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[Stept] IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Save a screenshot data URL to IndexedDB.
 * @param {string} stepId - Unique step identifier (e.g., "step_1")
 * @param {string} dataUrl - The screenshot data URL
 */
async function saveScreenshot(stepId, dataUrl) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ stepId, dataUrl, timestamp: Date.now() });

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Get a screenshot data URL from IndexedDB.
 * @param {string} stepId
 * @returns {Promise<string|null>}
 */
async function getScreenshot(stepId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(stepId);

    request.onsuccess = () => {
      resolve(request.result ? request.result.dataUrl : null);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Get all screenshots from IndexedDB.
 * @returns {Promise<Object>} Map of stepId → dataUrl
 */
async function getAllScreenshots() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const map = {};
      for (const record of request.result) {
        map[record.stepId] = record.dataUrl;
      }
      resolve(map);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Delete a screenshot from IndexedDB.
 * @param {string} stepId
 */
async function deleteScreenshot(stepId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(stepId);

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Clear all screenshots from IndexedDB.
 */
async function clearAllScreenshots() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Migrate existing screenshots from chrome.storage.local (persistedSteps)
 * to IndexedDB. Run once on extension load.
 */
async function migrateFromChromeStorage() {
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
        const lightweight = result.persistedSteps.map((s) => ({
          ...s,
          screenshotDataUrl: s.screenshotDataUrl ? `idb:step_${s.stepNumber}` : null,
        }));
        await chrome.storage.local.set({ persistedSteps: lightweight });
      }

      resolve(migrated > 0);
    });
  });
}

// Export for service worker (background.js uses importScripts or direct access)
// Since background.js is type:module, we use self assignment
self.screenshotDB = {
  saveScreenshot,
  getScreenshot,
  getAllScreenshots,
  deleteScreenshot,
  clearAllScreenshots,
  migrateFromChromeStorage,
};
