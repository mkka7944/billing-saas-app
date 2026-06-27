const CACHE_NAME = 'tmt-billing-v2'
const STATIC_CACHE = 'tmt-static-v2'
const OFFLINE_URL = '/offline.html'

const BYPASS_HOSTS = [
  'supabase.co',
  'google.com',
  'googleapis.com',
  'googleusercontent.com',
  'openstreetmap.org',
  'basemaps.cartocdn.com',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([
      OFFLINE_URL,
      '/manifest.webmanifest',
      '/icon-192.png',
      '/icon-512.png',
    ])).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (k !== CACHE_NAME && k !== STATIC_CACHE) return caches.delete(k)
      }))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 1. BYPASS — Supabase, Google, map tiles (#1 routing station lesson)
  if (BYPASS_HOSTS.some((h) => url.hostname.includes(h))) return

  // 2. BYPASS — RSC/Flight payloads (stale RSC = blank screen after deploy)
  if (event.request.headers.get('Accept')?.includes('text/x-component')) return

  // 3. BYPASS — API routes (always fresh data)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/image')) return

  // 4. StaleWhileRevalidate for static assets (dev has no hash, prod needs fresh)
  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((res) => {
          if (res.status === 200) {
            const clone = res.clone()
            caches.open(STATIC_CACHE).then((c) => c.put(event.request, clone))
          }
          return res
        })
        return cached || fetchPromise
      })
    )
    return
  }

  // 5. StaleWhileRevalidate for JSON data chunks
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((res) => {
          if (res.status === 200) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone))
          }
          return res
        })
        return cached || fetchPromise
      })
    )
    return
  }

  // 6. NetworkFirst for navigation — fallback to offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone))
        }
        return res
      }).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // 7. NetworkOnly for everything else
})
