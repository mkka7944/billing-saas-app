const DB_NAME = 'billing-saas-offline-cache'
const STORE_NAME = 'offline_cache'
const CACHE_KEY = 'deliver-assignment-cache'
const DB_VERSION = 1

export interface CachedAssignment {
  data: Record<string, unknown> | null
  items: Record<string, unknown>[]
  cachedAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function cacheAssignment(data: Record<string, unknown> | null, items: Record<string, unknown>[]): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ data, items, cachedAt: Date.now() }, CACHE_KEY)
    tx.oncomplete = () => db.close()
  } catch {
    try {
      const entry: CachedAssignment = { data, items, cachedAt: Date.now() }
      localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
    } catch {
      // both failed
    }
  }
}

export async function getCachedAssignment(): Promise<CachedAssignment | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(CACHE_KEY)
      req.onsuccess = () => resolve((req.result as CachedAssignment) ?? null)
      req.onerror = () => resolve(null)
      tx.oncomplete = () => db.close()
    })
  } catch {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      return raw ? JSON.parse(raw) as CachedAssignment : null
    } catch {
      return null
    }
  }
}

export async function clearAssignmentCache(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(CACHE_KEY)
    tx.oncomplete = () => db.close()
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      // ignore
    }
  }
}
