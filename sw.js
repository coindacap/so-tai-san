/* Sổ Tài Sản — service worker
 * Network-first for HTML + assets to avoid white-screen after deploy
 * (stale index.html pointing at deleted hashed bundles).
 */
const CACHE = 'so-tai-san-shell-v7'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['./manifest.webmanifest', './icon.svg']).catch(() => {
        /* ignore partial cache on install */
      }),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    )
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // HTML navigations: always try network first, never serve stale shell by default
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            void caches.open(CACHE).then((c) => c.put('./index.html', copy))
          }
          return res
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./'))),
    )
    return
  }

  // Hashed assets & other same-origin GETs: network-first, then cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (
          res.ok &&
          (url.pathname.includes('/assets/') ||
            url.pathname.endsWith('.svg') ||
            url.pathname.endsWith('.png') ||
            url.pathname.endsWith('.webmanifest'))
        ) {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || Promise.reject())),
  )
})
