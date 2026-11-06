// This device's saved data, in IndexedDB: last-seen copies of pages, and changes waiting to be sent.
// If storage isn't available (private mode), reads find nothing and the app works online only.
const DB_NAME = 'technicon-sales';
const CACHE = 'cache';
const OUTBOX = 'outbox';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(CACHE);
        req.result.createObjectStore(OUTBOX, { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

function run<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = action(tx.objectStore(store));
        // Resolved on commit, so a queued change is really on disk before the app says it is.
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(CACHE, 'readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown) {
  try {
    await run(CACHE, 'readwrite', (s) => s.put(value, key));
  } catch {
    // Storage full or unavailable: the app still works online.
  }
}

export async function cacheClear() {
  try {
    await run(CACHE, 'readwrite', (s) => s.clear());
  } catch {
    // Nothing saved to clear.
  }
}

export function outboxAll<T>(): Promise<T[]> {
  return run<T[]>(OUTBOX, 'readonly', (s) => s.getAll());
}

export function outboxAdd(item: unknown) {
  return run(OUTBOX, 'readwrite', (s) => s.add(item));
}

export function outboxPut(item: unknown) {
  return run(OUTBOX, 'readwrite', (s) => s.put(item));
}

export function outboxDelete(id: number) {
  return run(OUTBOX, 'readwrite', (s) => s.delete(id));
}
