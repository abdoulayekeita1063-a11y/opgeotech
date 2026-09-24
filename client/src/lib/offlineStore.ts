export type OfflineRecordStatus = "completed" | "pending";

export type OfflineRecord = {
  id?: number;
  operation: string;
  status: OfflineRecordStatus;
  createdAt: number;
  payload: unknown;
  result?: unknown;
  error?: string;
};

const DB_NAME = "opgeotech-offline";
const DB_VERSION = 1;
const RECORDS_STORE = "records";
const DRAFTS_STORE = "drafts";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS_STORE)) {
        const records = db.createObjectStore(RECORDS_STORE, { keyPath: "id", autoIncrement: true });
        records.createIndex("status", "status");
        records.createIndex("operation", "operation");
        records.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<any> | void,
): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let request: IDBRequest<any> | void;
    try {
      request = action(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(request?.result as T | undefined);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
  });
}

function notifyStoreChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("opgeotech:offline-store-updated"));
  }
}

export async function saveOfflineRecord(record: OfflineRecord): Promise<number | undefined> {
  const id = await withStore<number>(RECORDS_STORE, "readwrite", store => store.add(record));
  notifyStoreChanged();
  return id;
}

export async function saveOfflineDraft(key: string, value: unknown): Promise<void> {
  await withStore(DRAFTS_STORE, "readwrite", store => store.put({ key, value, updatedAt: Date.now() }));
  notifyStoreChanged();
}

export async function readOfflineDraft<T>(key: string): Promise<T | undefined> {
  const result = await withStore<{ key: string; value: T }>(DRAFTS_STORE, "readonly", store => store.get(key));
  return result?.value;
}

export async function listOfflineRecords(limit = 250): Promise<OfflineRecord[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const records: OfflineRecord[] = [];
    const request = db.transaction(RECORDS_STORE, "readonly").objectStore(RECORDS_STORE).index("createdAt").openCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= limit) {
        db.close();
        resolve(records);
        return;
      }
      records.push(cursor.value as OfflineRecord);
      cursor.continue();
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error("Could not read offline records"));
    };
  });
}

export async function countPendingOfflineRecords(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(RECORDS_STORE, "readonly").objectStore(RECORDS_STORE).index("status").count("pending");
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error("Could not count offline records"));
    };
  });
}

export async function captureApiOperation(operation: string, payload: unknown, result?: unknown, error?: string) {
  await saveOfflineRecord({
    operation,
    status: error ? "pending" : "completed",
    createdAt: Date.now(),
    payload,
    result,
    error,
  });
}

export function parseApiPayload(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return body ?? null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export function isApiMutationRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const request = new Request(input, init);
  return request.method !== "GET" && new URL(request.url, window.location.origin).pathname.startsWith("/api/trpc");
}
