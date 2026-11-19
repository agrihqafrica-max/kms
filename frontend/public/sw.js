const CACHE_NAME = 'kmsp-shell-v1'
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS).catch(() => {})),
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Bypass API & auth requests so live responses are never served stale
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/health') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/organizations')
  ) {
    return
  }

  // Network-first for HTML navigations so latest shell loads when online
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/') || caches.match(request)),
    )
    return
  }

  // Cache-first with background refresh for static assets
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => caches.match('/'))
    }),
  )
})
