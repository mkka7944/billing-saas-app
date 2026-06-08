export interface QueuedPhoto {
  id?: number
  assignmentItemId: string
  psid: string
  surveyId?: string
  dataUrl?: string
  photoBlob?: Blob
  capturedAt: string
  email: string
  gpsLat?: number | null
  gpsLng?: number | null
  retryCount: number
  status: 'queued' | 'uploading' | 'synced' | 'failed'
  lastError?: string
}

const DB_NAME = 'billing-saas-photo-queue'
const STORE_NAME = 'photo_queue'
const DB_VERSION = 3

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('assignmentItemId', 'assignmentItemId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function addToQueue(photo: Omit<QueuedPhoto, 'id' | 'retryCount' | 'status'>): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.add({ ...photo, retryCount: 0, status: 'queued' })
    req.onsuccess = () => resolve(req.result as number)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function getQueuedPhotos(): Promise<QueuedPhoto[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('status')
    const range = IDBKeyRange.only('queued')
    const req = index.getAll(range)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function markSynced(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(id)
    req.onsuccess = () => {
      const photo = req.result
      if (photo) {
        photo.status = 'synced'
        store.put(photo)
      }
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
    resolve()
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
      if (photo) {
        photo.retryCount++
        photo.status = 'queued'
        store.put(photo)
      }
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
    resolve()
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

export async function clearSynced(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('status')
    const req = index.getAllKeys(IDBKeyRange.only('synced'))
    req.onsuccess = () => {
      const keys = req.result
      for (const key of keys) {
        store.delete(key)
      }
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
    resolve()
  })
}
