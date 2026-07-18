// ARGONAUT OS · Service-Worker — Offline-Grundfähigkeit für die Monteur-App
// ============================================================================
// Strategie (bewusst konservativ, damit online nie etwas veraltet):
//  - Navigationen (Seitenaufrufe): NETWORK-FIRST. Immer frisch aus dem Netz;
//    nur wenn offline, kommt die zuletzt gesehene Seite aus dem Cache.
//  - Statische Next-Assets (/_next/static, /images, manifest): STALE-WHILE-
//    REVALIDATE. Sie sind inhaltsgehasht -> gefahrlos cachebar, laden im
//    Hintergrund neu.
//  - Alles andere (POST, /api, Supabase, ORS, Google Maps, fremde Hosts):
//    NICHT anfassen — läuft immer live.
// ============================================================================
const VERSION = 'argonaut-v1';
const SHELL = 'argonaut-shell-' + VERSION;
const STATIC = 'argonaut-static-' + VERSION;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.indexOf(VERSION) === -1).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // POST/PUT etc. nie abfangen
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // fremde Hosts (Supabase, ORS, Maps) durchlassen
  if (url.pathname.startsWith('/api/')) return;     // API immer live

  // Navigationen: erst Netz, dann Cache-Rückfall.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const netz = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put(req, netz.clone());
        return netz;
      } catch (e) {
        const cache = await caches.open(SHELL);
        const treffer = await cache.match(req);
        if (treffer) return treffer;
        const start = await cache.match('/dashboard/meine-einsaetze');
        if (start) return start;
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>Offline</title><body style="background:#0A1628;color:#E8EDF4;font-family:sans-serif;padding:40px;text-align:center">' +
          '<h1 style="color:#C9A84C">Offline</h1><p>Keine Verbindung. Sobald du wieder online bist, lädt die Seite normal.</p></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 },
        );
      }
    })());
    return;
  }

  // Statische Assets: sofort aus dem Cache, im Hintergrund auffrischen.
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/images/') || url.pathname === '/manifest.json') {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const treffer = await cache.match(req);
      const netz = fetch(req)
        .then((res) => { if (res && res.status === 200) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      return treffer || (await netz) || new Response('', { status: 504 });
    })());
  }
});
