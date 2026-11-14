// Service worker: red primero para la navegación y caché para los archivos de la propia web
// (la app abre aunque no haya conexión).
// IMPORTANTE: /api/* y /data/* NO se cachean nunca. Son datos privados del equipo (y los estados
// cambian a diario): si se guardaran, se verían datos viejos al recargar o con la sesión cerrada.
const CACHE = 'radar-v4'
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon.svg']))); self.skipWaiting() })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) return  // directo a la red
  const nav = e.request.mode === 'navigate'
  e.respondWith(
    nav
      ? fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put('/', c)); return r }).catch(() => caches.match('/'))
      : caches.match(e.request).then(h => h || fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)) } return r }))
  )
})
