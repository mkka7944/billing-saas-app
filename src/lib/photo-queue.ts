export interface QueuedPhoto {
  id?: number
  deliveryPhotoId: string
  assignmentItemId: string
  psid: string
  surveyId: string
  email: string
  photoBlob: Blob
  gpsLat?: number | null
  gpsLng?: number | null
  createdAt: string
  retryCount: number
  lastError?: string | null
}

const DB_NAME = 'billing-saas-photo-queue'
const STORE_NAME = 'photo_queue'
const DB_VERSION = 6

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      const oldVersion = event.oldVersion

      // Fresh install: create store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        })
      }

      // Version-by-version migrations (for future use)
      // Each case falls through to the next — applies cumulative changes
      switch (oldVersion) {
        case 0: // Fresh install — store created above
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          // Current schema — no migrations needed between these versions
          // Future: add `case 5:` block before `case 6:` for v5→v6 migration
          break
      }

      // Create indexes after store is guaranteed to exist
      const store = request.transaction!.objectStore(STORE_NAME)
      if (!store.indexNames.contains('deliveryPhotoId')) {
        store.createIndex('deliveryPhotoId', 'deliveryPhotoId', { unique: false })
      }
      if (!store.indexNames.contains('assignmentItemId')) {
        store.createIndex('assignmentItemId', 'assignmentItemId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function addToQueue(photo: Omit<QueuedPhoto, 'id' | 'retryCount' | 'createdAt'>): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.add({ ...photo, retryCount: 0, createdAt: new Date().toISOString() })
    req.onsuccess = () => resolve(req.result as number)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function getAllQueued(): Promise<QueuedPhoto[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function getQueueCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function removeFromQueue(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => reject(tx.error)
  })
}

export async function markFailed(id: number, error: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(id)
    req.onsuccess = () => {
      const photo = req.result
      if (!photo) { resolve(); return }
      photo.lastError = error
      store.put(photo)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => { db.close(); resolve() }
  })
}

export async function clearAll(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function incrementRetry(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(id)
    req.onsuccess = () => {
      const photo = req.result
      if (!photo) { resolve(); return }
      photo.retryCount++
      store.put(photo)
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => { db.close(); resolve() }
  })
}
