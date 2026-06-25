# PWA Implementation Plan

> Updated 2026-06-25 with lessons from photo queue history, routing station PWA reference,
> and comprehensive research on IndexedDB persistence, Background Sync, and Firefox support.

---

## Architecture Overview

| Component | Approach | File |
|-----------|----------|------|
| Manifest | Next.js App Router manifest route (typed) | `src/app/manifest.ts` |
| Service Worker | Manual plain JS in `public/` (no build step) | `public/sw.js` |
| SW Registration | Client component with `useEffect` | `src/components/providers/pwa-register.tsx` |
| Icons | PNGs 192x192 + 512x512 (+ maskable variants) | `public/icon-*.png` |
| Install Prompt | `beforeinstallprompt` event handler | In `pwa-register.tsx` |
| Offline Fallback | Minimal HTML page | `public/offline.html` |
| Update Detection | Toast + "Reload" via `postMessage('SKIP_WAITING')` | In `pwa-register.tsx` |
| Persistent Storage | `navigator.storage.persist()` at app init | In `src/lib/photo-queue.ts` |
| Background Sync | `SyncManager` API in SW + `online` event fallback | In `public/sw.js` + `use-photo-queue.ts` |

**Why manual SW instead of @serwist/turbopack:**
- Our app has very specific caching rules (bypass Supabase/Google/map tiles) that are easier in plain JS
- The routing-station's SW is a proven template we can adapt directly
- Zero build complexity — plain JS in `public/`, no extra dependencies
- RSC avoidance is one check in the fetch handler
- We must never cache RSC payloads or API routes (lessons from photo queue history)

---

## Hard-Earned Lessons (From Photo Queue + Routing Station History)

These are the specific failures and fixes that shaped this plan:

| Lesson | What happened | How PWA addresses it |
|--------|--------------|----------------------|
| **SSR proxy killed uploads** | Photos routed through Vercel → 85% failure (10s timeout + GAS rate limits). Fixed by direct browser→GAS upload. | SW must never intercept upload POSTs. API routes = network-only bypass. |
| **IndexedDB DB_VERSION trap** | "object store not found" — store created after DB was already opened at older version. Manual version bump fixed it. | Migration pattern must use cumulative `switch` with fall-through. Add version check at app init. |
| **Two separate IndexedDB queues** | `photo-queue` and `unsent-photo-queue` are independent. Photos in one are invisible in the other. Still an open issue. | PWA should consolidate to one queue with a `type` field (`online` / `unsent`). |
| **`incrementRetry` race condition** | Potential queue data corruption under concurrent async access. | Use IndexedDB transactions properly. One transaction per read-modify-write. |
| **sendBeacon on tab close** | Best-effort only. Photo lost if phone dies before upload completes. | Background Sync API retries after phone restart/tab close (Chrome/Android). |
| **Blob stored directly in IndexedDB** | Correct choice — avoids FileReader UI freeze on main thread. | Keep this pattern. Add `navigator.storage.persist()` to prevent eviction under storage pressure. |
| **GAS 30s timeout + unbounded retries** | Timeout 8s→30s, removed MAX_RETRIES cap. Currently retries forever while app is open. | Background Sync handles retries even after browser close. Combined = full coverage. |
| **Caching supabase.co breaks auth** | #1 routing station lesson. Caching Supabase API calls causes silent auth failures. | Bypass list in SW: `supabase.co`, `google.com`, `googleapis.com`, map tile hosts. |
| **RSC payloads must never be cached** | Stale RSC = blank screen or broken UI after deploy. | Check `event.request.headers.get('Accept')` for `text/x-component` — bypass immediately. |
| **Staff use Firefox for camera** | Samsung Chrome has broken BarcodeDetector. Firefox cameras work. | Service workers work in Firefox (caching + offline). Install prompt + Background Sync are Chrome-only. See Firefox section below. |

---

## 1. Icons — `public/icon-*.png`

Need 4 icon files:
- `icon-192.png` (192x192)
- `icon-512.png` (512x512)
- `icon-192-maskable.png` (192x192 with 20% padding for maskable)
- `icon-512-maskable.png` (512x512 with 20% padding for maskable)

**Generation options:**

1. **Canva** (free) — Design an icon with "TMT Billing" text + simple symbol (shield/map pin). Export PNGs at 192 and 512.
2. **`pwa-asset-generator`** (npm) — `npx pwa-asset-generator logo.svg public/` — auto-generates all sizes + maskable variants from a single source SVG.
3. **ChatGPT-4o / DALL-E** — Prompt: "App icon for TMT Billing field app, dark theme rounded square, simple flat design, 512x512 PNG" — generates unique icon, then resize for variants.
4. **realfavicongenerator.net** — Upload a source image, download all icon formats.

**What they look like in manifest:**
```json
{
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

---

## 2. Manifest — `src/app/manifest.ts`

Next.js App Router convention: export a default function returning `MetadataRoute.Manifest`.

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TMT Billing',
    short_name: 'TMT Billing',
    description: 'Billing & Recovery System — Delivery management and field staff operations',
    start_url: '/',
    scope: '/',
    id: '/',                    // stable ID prevents re-install on update
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#1e293b',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

### Layout Metadata Update (`src/app/layout.tsx`)

Add to existing `metadata` export:
```ts
export const metadata: Metadata = {
  title: 'TMT Billing',
  description: 'Billing & Recovery System',
  manifest: '/manifest.webmanifest',  // auto-generated by Next.js from manifest.ts
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TMT Billing',
  },
  formatDetection: { telephone: false },
}
```

---

## 3. Service Worker — `public/sw.js`

Adapted from routing-station's proven `sw.js` (95 lines, `scripts/ref/routing-station-src/routing-station-src/sw.js`) with Next.js-specific additions.

### Full SW Code

```js
const CACHE_NAME = 'tmt-billing-v1'
const STATIC_CACHE = 'tmt-static-v1'
const OFFLINE_URL = '/offline.html'

// Bypass hosts — exact list from routing station (#1 lesson: caching these breaks auth + maps)
const BYPASS_HOSTS = [
  'supabase.co',
  'google.com',
  'googleapis.com',
  'googleusercontent.com',
  'openstreetmap.org',
  'basemaps.cartocdn.com',
]

// Background Sync: process photo queue when online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-photos') {
    event.waitUntil(processPhotoQueue())
  }
})

async function processPhotoQueue() {
  // SW reads IndexedDB photo queue and retries failed uploads
  // This retries even after phone restart or tab close (Chrome/Android only)
  const db = await openDB('billing-saas-photo-queue', 6)
  const items = await db.getAll('photo_queue')
  for (const item of items) {
    try {
      await fetch(item.email, {
        method: 'POST',
        body: JSON.stringify({
          photo: item.photoBlob,
          surveyId: item.surveyId,
          lat: item.gpsLat,
          lng: item.gpsLng,
        }),
      })
      await db.delete('photo_queue', item.id)
    } catch {
      // Will retry on next sync event
    }
  }
}

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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 1. BYPASS — Supabase, Google, map tiles (#1 routing station lesson)
  if (BYPASS_HOSTS.some((h) => url.hostname.includes(h))) return

  // 2. BYPASS — RSC/Flight payloads (critical for Next.js — stale RSC = blank screen)
  if (event.request.headers.get('Accept')?.includes('text/x-component')) return

  // 3. BYPASS — API routes (always fresh data, never cache SSR endpoints)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/image')) return

  // 4. CacheFirst for static assets (hashed filenames are immutable)
  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
        if (res.status === 200) {
          const clone = res.clone()
          caches.open(STATIC_CACHE).then((c) => c.put(event.request, clone))
        }
        return res
      }))
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

  // 7. NetworkOnly for everything else (default browser behavior)
})
```

### Key Decisions (from routing station + production lessons)

1. **Bypass Supabase/Google/map tiles** — #1 routing station lesson. Caching these breaks auth and maps.
2. **Never cache RSC payloads** — Most dangerous Next.js-specific SW bug. Stale RSC = blank screen after deploy.
3. **Only cache `/_next/static/*` with CacheFirst** — Content-hashed filenames are immutable, safe forever.
4. **NetworkFirst for navigation** — Uses cached HTML as offline fallback but always tries network first.
5. **No precache of app shell** — Next.js generates different chunks per build. Precaching entire app bundle would break after deploy. Only precache offline page + icons + manifest.
6. **Background Sync for photo queue** — Chrome/Android only. Falls back to `online` event on other browsers.

---

## 4. Persistent Storage — `src/lib/photo-queue.ts`

Add at app initialization to prevent IndexedDB eviction under storage pressure:

```ts
async function requestPersistentStorage() {
  if (navigator.storage?.persist) {
    const persisted = await navigator.storage.persist()
    if (persisted) {
      console.log('Persistent storage granted — photo queue protected from eviction')
    }
  }
}
```

Chrome auto-grants persistent storage if:
- The site is installed as a PWA (home screen)
- The site has high engagement
- The site has push notifications enabled

Without this, the browser may delete IndexedDB data (including the photo queue) when the device runs low on storage. This is the #1 risk for photo loss in production.

---

## 5. Background Sync for Photo Queue

### Chrome/Android (Primary)

In the service worker, handle `sync` events:

```js
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-photos') {
    event.waitUntil(processPhotoQueue())
  }
})
```

Register from the client when a photo fails to upload:

```ts
async function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready
    await reg.sync.register('sync-photos')
  }
}
```

### Firefox/iOS (Fallback)

Keep the existing `online` event + `visibilitychange` listener in `use-photo-queue.ts`:

```ts
window.addEventListener('online', syncPhotos)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncPhotos()
})
```

Background Sync means Chrome retries the upload even if:
- The user closes the browser tab
- The phone goes to sleep
- The phone restarts (next time Chrome opens and detects network)

---

## 6. PWA Register + Install + Update Detection — `src/components/providers/pwa-register.tsx`

```tsx
'use client'

import { useEffect, useState } from 'react'

export function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [installable, setInstallable] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Register SW with updateViaCache: 'none' (critical — prevents stale SW from HTTP cache)
    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).then((reg) => {
      // Detect waiting SW (new version deployed but not yet active)
      if (reg.waiting) {
        setWaitingWorker(reg.waiting)
        setUpdateAvailable(true)
      }

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newSW)
            setUpdateAvailable(true)
          }
        })
      })
    })

    // Auto-reload when new SW takes over
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })

    // Install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setInstallable(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') setInstallable(false)
    setDeferredPrompt(null)
  }

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage('SKIP_WAITING')
    }
  }

  return (
    <>
      {/* Update available toast — uses existing toast system */}
      {updateAvailable && (
        <div className="update-banner">
          {/* Wired via useToast() — show "New version available" with reload action */}
        </div>
      )}

      {/* Install button */}
      {installable && (
        <button onClick={handleInstall} className="...">
          Install App
        </button>
      )}
    </>
  )
}
```

Key details:
- `updateViaCache: 'none'` — critical, prevents browser from caching SW from HTTP cache
- SW does NOT auto `skipWaiting` — user controls when to update
- Update is surfaced via the existing `useToast()` system (toast with action)
- Manual "Check for updates" button goes in Settings → General tab

### Listen for SKIP_WAITING in SW

Add to `public/sw.js`:

```js
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
```

---

## 7. Offline Fallback — `public/offline.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline — TMT Billing</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0f172a; color: #e2e8f0; text-align: center; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; }
  </style>
</head>
<body>
  <div>
    <h1>You're offline</h1>
    <p>Check your connection and try again.</p>
  </div>
</body>
</html>
```

---

## 8. Headers — `next.config.ts`

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

export default nextConfig
```

**Key point about sw.js caching:** The browser detects service worker updates by byte-comparing the fetched sw.js with the cached version. If sw.js is cached by a CDN or HTTP cache, updates never get picked up. `no-cache, no-store, must-revalidate` is mandatory.

---

## 9. Firefox Support

Firefox on Android has **partial** PWA support:

| Feature | Chrome Android | Firefox Android |
|---------|---------------|-----------------|
| `beforeinstallprompt` | ✅ Full support | ❌ Not supported |
| `display: standalone` | ✅ Full support | ❌ Opens as normal tab |
| **Service Worker** (caching, offline) | ✅ Full support | ✅ Full support |
| **Background Sync** | ✅ Full support | ❌ Not supported |
| **IndexedDB** | ✅ Full support | ✅ Full support |
| **`navigator.storage.persist()`** | ✅ Auto-grant for installed PWAs | ✅ Supported |

**What this means for staff:**
- Staff using **Firefox** still benefit from: faster load from cache, offline fallback page, and IndexedDB photo queue working normally.
- Staff using **Firefox** miss: install-to-homescreen prompt, standalone mode (no browser chrome), and Background Sync (uploads don't retry if Firefox is closed).
- **Recommendation:** Encourage Chrome for the full PWA experience. Firefox is a backup browser for QR scanning (the Samsung Chrome BarcodeDetector bug was already fixed separately).

---

## 10. What Problem Each Feature Solves

| Scenario | Before PWA | After PWA |
|----------|-----------|-----------|
| **Photo queue survives phone shutdown** | ❌ sendBeacon best-effort only | ✅ IndexedDB + Background Sync retries after reboot |
| **Photo queue survives tab close** | ❌ Lost if sendBeacon fails | ✅ Background Sync fires regardless of tab state |
| **App loads on slow network** | ⏳ White screen until chunks arrive | ✅ Static chunks served from cache instantly |
| **Phone goes offline mid-delivery** | ⚠️ Photo queued, but page blank on nav | ✅ Offline fallback page, cached assets work |
| **New version deployed** | ❌ Staff sees stale app until hard refresh | ✅ Toast "New version → reload" |
| **Install to home screen** | ❌ Opens in browser with URL bar | ✅ Standalone app, no browser chrome |
| **IndexedDB evicted under storage pressure** | ⚠️ Possible photo loss | ✅ `persist()` prevents eviction for installed PWAs |

---

## 11. Implementation Order

| Step | File(s) | Description | Est. Time |
|------|---------|-------------|-----------|
| 1 | `public/icon-*.png` | Generate/design icons (192 + 512 + maskable variants) | 15 min |
| 2 | `src/app/manifest.ts` | Create manifest route | 10 min |
| 3 | `src/app/layout.tsx` | Add manifest + appleWebApp metadata | 5 min |
| 4 | `public/offline.html` | Create minimal offline fallback | 5 min |
| 5 | `public/sw.js` | Write service worker (adapted from routing-station) | 20 min |
| 6 | `src/components/providers/pwa-register.tsx` | PWA register component (SW reg + install + update detection) | 15 min |
| 7 | `src/lib/photo-queue.ts` | Add `navigator.storage.persist()` + Background Sync registration | 10 min |
| 8 | `next.config.ts` | Add headers for SW/manifest | 5 min |
| 9 | Settings General tab | Add "Check for updates" button | 10 min |
| 10 | Testing | Verify manifest, SW, install, offline, update flow | 20 min |
| | **Total** | | **~1.5 hr** |

---

## 12. Testing Checklist

1. Open app in Chrome → DevTools → Application → Manifest → verify manifest loads
2. Application → Service Workers → verify SW registered with correct scope
3. Verify BYPASS hosts don't appear in cache storage (supabase.co, googleapis.com)
4. Click "Install App" button → verify install prompt appears
5. After install, open the standalone PWA → verify it looks/works correctly
6. Go offline (DevTools → Network → Offline) → verify offline page shows on navigation
7. Go back online → verify navigation works
8. Verify `/_next/static/*` files are cached (CacheFirst strategy)
9. Verify `/api/*` calls are NOT cached (always fresh from network)
10. Verify RSC payloads (`text/x-component`) are NOT cached
11. Verify Supabase API calls still work (not cached by SW)
12. Verify map tiles still load (not cached by SW)
13. Take photo offline → verify it's queued in IndexedDB and `persist()` is active
14. Register Background Sync → go offline → verify sync event fires when online
15. Test update flow: deploy new version → verify toast appears → tap reload → verify new version loads
16. Test on mobile Chrome → verify install prompt on Android
17. Test on Firefox → verify SW still works (caching + offline)
18. Clear SW cache → verify re-registration works
19. Deploy to Vercel → verify SW still works in production
