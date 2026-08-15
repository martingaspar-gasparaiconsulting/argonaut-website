// ARGONAUT OS · Service-Worker — Offline-Grundfähigkeit für die Monteur-App
// ============================================================================
// Strategie (bewusst konservativ, damit online nie etwas veraltet):
//  - Navigationen (Seitenaufrufe): NETWORK-FIRST. Immer frisch aus dem Netz;
//    nur wenn offline, kommt die zuletzt gesehene Seite aus dem Cache, sonst
//    die Offline-Seite /offline.
//  - Statische Next-Assets (/_next/static, /images, manifest): STALE-WHILE-
//    REVALIDATE. Sie sind inhaltsgehasht -> gefahrlos cachebar, laden im
//    Hintergrund neu.
//  - Alles andere (POST, /api, Supabase, ORS, Google Maps, fremde Hosts):
//    NICHT anfassen — läuft immer live.
//
// v2 (15.08.26):
//  - Offline-Seite + App-Symbole werden bei der Installation vorab geladen,
//    damit auch der allererste Offline-Moment sauber aussieht.
//  - Navigation-Preload: der Seitenabruf startet parallel zum Service-Worker,
//    das spart auf dem Handy spürbar Zeit.
//  - Der Seiten-Cache ist auf MAX_SHELL Einträge begrenzt (ältester fliegt),
//    sonst wächst er bei 150 Modulen unbegrenzt.
//  - DATENSCHUTZ: Beim Abmelden wird der Seiten-Cache geleert. Auf geteilten
//    Geräten (Werkstatt-Tablet) darf der nächste Nutzer offline nicht die
//    Seiten des vorherigen zu sehen bekommen. Ausgelöst per postMessage aus
//    dem Abmelden-Knopf.
// ============================================================================
const VERSION = 'argonaut-v2';
const SHELL = 'argonaut-shell-' + VERSION;
const STATIC = 'argonaut-static-' + VERSION;

const OFFLINE_SEITE = '/offline';
const MAX_SHELL = 50;

const VORAB = [
  OFFLINE_SEITE,
  '/manifest.json',
  '/images/argonaut-icon-192.png',
  '/images/argonaut-icon-512.png',
  '/images/argonaut-icon-maskable-192.png',
  '/images/argonaut-icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC);
    // Einzeln statt addAll: eine fehlende Datei darf nicht die ganze
    // Installation scheitern lassen.
    await Promise.all(VORAB.map(async (pfad) => {
      try {
        const res = await fetch(pfad, { cache: 'reload' });
        if (res && res.status === 200) await cache.put(pfad, res.clone());
      } catch (e) { /* ohne diese Datei geht es auch */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.indexOf(VERSION) === -1).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) { /* optional */ }
    }
    await self.clients.claim();
  })());
});

// Nachrichten aus der App — aktuell nur: Seiten-Cache leeren (Abmelden).
self.addEventListener('message', (event) => {
  const daten = event.data || {};
  if (daten.typ === 'cache-leeren') {
    event.waitUntil((async () => {
      await caches.delete(SHELL);
      if (event.source && event.source.postMessage) {
        try { event.source.postMessage({ typ: 'cache-geleert' }); } catch (e) { /* egal */ }
      }
    })());
  }
});

/** Hält den Seiten-Cache klein: über MAX_SHELL fliegen die ältesten Einträge. */
async function shellBegrenzen(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_SHELL) return;
    const zuviel = keys.length - MAX_SHELL;
    for (let i = 0; i < zuviel; i++) await cache.delete(keys[i]);
  } catch (e) { /* egal */ }
}

async function offlineAntwort(cache) {
  const seite = await caches.match(OFFLINE_SEITE);
  if (seite) return seite;
  const start = await cache.match('/dashboard/meine-einsaetze');
  if (start) return start;
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Offline</title><body style="background:#0A1628;color:#E8EDF4;font-family:sans-serif;padding:40px;text-align:center">' +
    '<h1 style="color:#C9A84C">Offline</h1><p>Keine Verbindung. Sobald Sie wieder online sind, lädt die Seite normal.</p></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 },
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // POST/PUT etc. nie abfangen
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // fremde Hosts (Supabase, ORS, Maps) durchlassen
  if (url.pathname.startsWith('/api/')) return;     // API immer live

  // Navigationen: erst Netz (ggf. schon vorgeladen), dann Cache-Rückfall.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const vorgeladen = await event.preloadResponse;
        const netz = vorgeladen || await fetch(req);
        if (netz && netz.status === 200) {
          await cache.put(req, netz.clone());
          shellBegrenzen(cache);
        }
        return netz;
      } catch (e) {
        const treffer = await cache.match(req);
        if (treffer) return treffer;
        return offlineAntwort(cache);
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
