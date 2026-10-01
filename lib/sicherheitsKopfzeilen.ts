// ============================================================================
// ARGONAUT OS · lib/sicherheitsKopfzeilen.ts — was jede Antwort mitschickt
//
// Anlass (Prüfbefund 15.09.2026): next.config.ts hatte KEINE einzige
// Sicherheits-Kopfzeile. Die schwerste Folge davon ist unauffällig:
//
//   Magic-Link- und Passwort-Wiederherstellungs-Token stehen in der ADRESSE.
//   Ohne Referrer-Policy schickt der Browser die vollständige Adresse als
//   `Referer` an jede fremde Seite mit, die von dort aus geladen oder verlinkt
//   wird — Schriftarten, Karten, ein angeklickter Link. Der Token steht dann im
//   Zugriffsprotokoll eines fremden Servers.
//
// BEWUSST NICHT HIER DRIN — das ist der wichtige Teil:
//
//   · frame-ancestors / X-Frame-Options.  Sie würden verhindern, dass ARGONAUT
//     in eine fremde Seite eingebettet wird. Genau das TUT ARGONAUT aber
//     absichtlich: der öffentliche Berater läuft seit 09.09.2026 auf fremden
//     Kundenwebsites (web_seiten.chat_domains), und der Vorführ-/Kiosk-Modus
//     lebt davon. Diese Kopfzeile gehört mit einer Ausnahmeliste gebaut und im
//     Browser nachgeprüft — als eigener Schritt, nicht nebenbei.
//
//   · Permissions-Policy.  Eine zu enge Regel schaltet das Diktat (Mikrofon)
//     und die Beleg-Erkennung (Kamera) ab. Auch das gehört geprüft, nicht
//     geraten.
//
//   · Eine vollständige Content-Security-Policy.  Sie bricht bei diesem Aufbau
//     zuverlässig irgendeine Seite, solange niemand jede Einbindung kennt.
//
// Was hier steht, ist rückwärtskompatibel: es kann keine Seite abschalten und
// keinen Nutzer aussperren.
//
// Rein und node-testbar. next.config.ts liest die Liste, damit sie prüfbar ist.
// ============================================================================

export type Kopfzeile = { key: string; value: string };

/**
 * HSTS ohne `includeSubDomains` und ohne `preload` — mit Absicht.
 *
 * `preload` ist praktisch unumkehrbar: die Domain landet in einer Liste, die in
 * die Browser einkompiliert wird. `includeSubDomains` würde jede künftige
 * Subdomain zu HTTPS zwingen, auch eine, die es noch gar nicht gibt. Beides
 * bringt hier wenig, weil Vercel ohnehin nur über HTTPS ausliefert — und beides
 * wäre im Fehlerfall schwer zurückzunehmen. Zwei Jahre Gültigkeit genügen.
 */
const HSTS = 'max-age=63072000';

export const SICHERHEITS_KOPFZEILEN: Kopfzeile[] = [
  // Verhindert, dass die vollständige Adresse (mit Token) an fremde Server geht.
  // Bei eigenen Seiten bleibt der volle Pfad erhalten, die eigene Auswertung
  // funktioniert also weiter; nach draußen geht nur noch der nackte Ursprung.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Der Browser soll den vom Server genannten Inhaltstyp glauben und nicht
  // selbst raten. Ohne das kann eine hochgeladene Datei als Skript ausgeführt
  // werden, obwohl sie als Text ausgeliefert wurde.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Nur noch über HTTPS sprechen. Siehe Kommentar oben zu den Zusätzen.
  { key: 'Strict-Transport-Security', value: HSTS },
];

/** Die Kopfzeilen im Format, das next.config.ts in `headers()` erwartet. */
export function kopfzeilenRegel(): { source: string; headers: Kopfzeile[] } {
  return { source: '/:pfad*', headers: SICHERHEITS_KOPFZEILEN };
}

/** Steht diese Kopfzeile in der Liste? (für die Tests und fürs Nachsehen) */
export function kopfzeile(key: string): string | null {
  const t = String(key ?? '').toLowerCase();
  const treffer = SICHERHEITS_KOPFZEILEN.find((k) => k.key.toLowerCase() === t);
  return treffer ? treffer.value : null;
}

// ============================================================================
// RAHMEN-SCHUTZ nur für die INNEREN Bereiche (S1, Paket 161)
//
// Oben steht, warum frame-ancestors NICHT global gesetzt wird: öffentliche
// Seiten (Berater, Kundenseiten, Landingpages, Buchung, Portal) dürfen
// eingebettet werden. Das Dashboard, der Betreiber-Bereich und die
// Anmeldeseiten dagegen NIE von fremden Seiten: sonst kann eine fremde Seite
// ARGONAUT unsichtbar überlagern und angemeldete Nutzer Knöpfe drücken lassen
// („Clickjacking"). 'self' erlaubt weiter das Einbetten innerhalb von ARGONAUT
// (z. B. /buehne zeigt /vorschau) — niemand wird ausgesperrt.
// ============================================================================

export const RAHMEN_SCHUTZ: Kopfzeile[] = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
];

/** Innere Bereiche (Next-Pfadmuster). Öffentliche Türen stehen hier NIE. */
export const INNERE_BEREICHE: string[] = [
  '/dashboard',
  '/dashboard/:pfad*',
  '/admin',
  '/admin/:pfad*',
  '/admin-login',
  // NICHT /anmelden/<slug>: das ist die ÖFFENTLICHE Newsletter-Anmeldeseite
  // eines Betriebs und darf auf dessen Webseite eingebettet werden.
  '/auth/:pfad*',
  '/webseiten-editor',
];

/** Regeln für next.config.ts `headers()` — je innerem Bereich eine. */
export function rahmenSchutzRegeln(): { source: string; headers: Kopfzeile[] }[] {
  return INNERE_BEREICHE.map((source) => ({ source, headers: RAHMEN_SCHUTZ }));
}

// ============================================================================
// CSP IM BEOBACHTUNGSMODUS (Paket 187b)
//
// Eine harte Content-Security-Policy „bricht zuverlässig irgendeine Seite"
// (siehe oben). Deshalb zuerst als Content-Security-Policy-Report-Only: Der
// Browser BLOCKIERT NICHTS, er meldet nur, was er bei einer echten Regel
// blockieren würde — an /api/oeffentlich/csp-bericht (landet im Vercel-
// Protokoll als Zeile „[csp] …"). Nach ein paar Wochen ohne Meldungen bzw.
// mit nachgetragenen Quellen kann dieselbe Liste scharf geschaltet werden.
//
// Kann keine Seite abschalten und niemanden aussperren.
// ============================================================================

export const CSP_BERICHT_PFAD = '/api/oeffentlich/csp-bericht';

/** Erlaubte Quellen je Bereich — aus dem Code gesammelt (01.10.2026). */
export const CSP_QUELLEN: Record<string, string[]> = {
  'default-src': ["'self'"],
  // Next.js braucht Inline-Skripte (Hydration); Stripe lädt sein Skript selbst.
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://js.stripe.com'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  // Bilder: Kunden-Logos, Speicher, Vorschaubilder von überall (https), data/blob für Vorschauen
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'media-src': ["'self'", 'blob:', 'https:'],
  'connect-src': ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'https://api.openrouteservice.org', 'https://api.unsplash.com', 'https://api.stripe.com'],
  // Videos nur über Zwei-Klick (youtube-nocookie, vimeo), Stripe, Google-Karte/Kalender
  'frame-src': ["'self'", 'https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://js.stripe.com', 'https://hooks.stripe.com', 'https://www.google.com', 'https://maps.google.com', 'https://calendar.google.com'],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'", 'https:'],
};

/** Die Regel als Text für die Kopfzeile. */
export function cspText(quellen: Record<string, string[]> = CSP_QUELLEN, berichtPfad: string = CSP_BERICHT_PFAD): string {
  const teile = Object.entries(quellen).map(([k, v]) => `${k} ${v.join(' ')}`);
  teile.push(`report-uri ${berichtPfad}`);
  return teile.join('; ');
}

/** Regel für next.config.ts: überall, NUR melden (Report-Only), nie blockieren. */
export function cspBeobachtungRegel(): { source: string; headers: Kopfzeile[] } {
  return { source: '/:pfad*', headers: [{ key: 'Content-Security-Policy-Report-Only', value: cspText() }] };
}

export type CspMeldung = { regel: string; blockiert: string; seite: string };

function nurUrsprung(roh: unknown): string {
  const s = String(roh ?? '').trim().slice(0, 300);
  if (!s) return '';
  if (/^(inline|eval|data|blob|self|wasm-eval|trusted-types-[a-z-]+)$/i.test(s)) return s.toLowerCase();
  try { const u = new URL(s); return u.protocol === 'data:' || u.protocol === 'blob:' ? u.protocol.slice(0, -1) : u.origin; } catch { return s.split(/[?#]/)[0].slice(0, 120); }
}
function nurPfad(roh: unknown): string {
  const s = String(roh ?? '').trim().slice(0, 500);
  if (!s) return '';
  try { return new URL(s).pathname.slice(0, 160); } catch { return s.split(/[?#]/)[0].slice(0, 160); }
}

/**
 * Meldung des Browsers lesen — beide Formate (alt: {"csp-report":{…}},
 * neu: [{type:"csp-violation", body:{…}}]). Nur Regel, Ursprung des
 * blockierten Inhalts und PFAD der Seite — nie die Abfrage-Zeichen (?token=…),
 * damit keine Anmelde-Links ins Protokoll geraten. Höchstens 10 je Sendung.
 */
export function cspMeldungenLesen(text: string): CspMeldung[] {
  let daten: unknown;
  try { daten = JSON.parse(String(text ?? '').slice(0, 20000)); } catch { return []; }
  const roh: Record<string, unknown>[] = [];
  if (Array.isArray(daten)) {
    for (const e of daten) {
      const b = (e as { body?: unknown })?.body;
      if (b && typeof b === 'object') roh.push(b as Record<string, unknown>);
    }
  } else if (daten && typeof daten === 'object') {
    const r = (daten as Record<string, unknown>)['csp-report'];
    if (r && typeof r === 'object') roh.push(r as Record<string, unknown>);
  }
  return roh.slice(0, 10).map((r) => ({
    regel: String(r['effective-directive'] ?? r['effectiveDirective'] ?? r['violated-directive'] ?? '').split(' ')[0].slice(0, 40),
    blockiert: nurUrsprung(r['blocked-uri'] ?? r['blockedURL']),
    seite: nurPfad(r['document-uri'] ?? r['documentURL']),
  })).filter((m) => m.regel !== '');
}
