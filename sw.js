/* Sổ Tài Sản — service worker (shell offline nhẹ) */
const CACHE = 'so-tai-san-shell-v2'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg']),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Không cache API / Supabase / cross-origin
  if (url.origin !== self.location.origin) return

  // Navigations: network-first, fallback cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  // Static assets: cache-first, then network
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit
      return fetch(req).then((res) => {
        if (res.ok && (url.pathname.includes('/assets/') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.png'))) {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
    }),
  )
})
