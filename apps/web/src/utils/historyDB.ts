/**
 * IndexedDB storage utility for client-side session history & auto-save.
 */

export interface HistoryItem {
  id: string;
  name: string;
  tool: string;
  size: number;
  blob: Blob;
  createdAt: number; // timestamp
  expiresAt: number; // timestamp (+1 hour)
}

const DB_NAME = 'DocMaxySessionHistory';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveHistoryItem(name: string, tool: string, blob: Blob): Promise<HistoryItem> {
  try {
    const db = await openDB();
    const now = Date.now();
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      name,
      tool,
      size: blob.size,
      blob,
      createdAt: now,
      expiresAt: now + EXPIRY_MS,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save to history DB:', err);
    return {
      id: crypto.randomUUID(),
      name,
      tool,
      size: blob.size,
      blob,
      createdAt: Date.now(),
      expiresAt: Date.now() + EXPIRY_MS,
    };
  }
}

export async function getHistoryItems(): Promise<HistoryItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const now = Date.now();
        const items: HistoryItem[] = req.result || [];
        const validItems: HistoryItem[] = [];
        const expiredIds: string[] = [];

        items.forEach((item) => {
          if (item.expiresAt < now) {
            expiredIds.push(item.id);
          } else {
            validItems.push(item);
          }
        });

        // Delete expired items asynchronously
        expiredIds.forEach((id) => store.delete(id));

        // Sort newest first
        validItems.sort((a, b) => b.createdAt - a.createdAt);
        resolve(validItems);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to fetch history DB:', err);
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to clear history DB:', err);
  }
}
