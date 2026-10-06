// ============================================================================
// ARGONAUT OS · lib/dossierAuslieferung.ts — Paket 221 (06.10.2026)
// Hilfen für die öffentliche Dossier-Route (/api/oeffentlich/dossier-pdf):
//  · Cache-Name des neuen Fachdossiers — ändert sich mit jedem Text, damit nie
//    eine alte Fassung aus dem Speicher ausgeliefert wird.
//  · Hinweisseite für Branchen „in rechtlicher Vorbereitung".
// Keine Imports — node-testbar.
// ============================================================================

/** Kurzer, stabiler Prüfwert (djb2) über einen Text. */
export function pruefwert(text: string): string {
  let h = 5381;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Dateiname im Bucket 'dossiers', z. B. fach-1-elektriker-1x2y3z.pdf */
export function fachdossierCacheName(slug: string, version: string | number, text: string): string {
  const sauber = String(slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80) || 'branche';
  const v = String(version ?? '').replace(/[^a-z0-9.]/gi, '') || '0';
  return `fach-${v}-${sauber}-${pruefwert(text)}.pdf`;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Schlichte Hinweisseite im ARGONAUT-Design (keine Skripte, keine fremden Quellen). */
export function vorbereitungsSeite(branche: string, grund: string, titel: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titel)} · ARGONAUT OS</title>
<style>body{margin:0;background:#0A1628;color:#E8EDF4;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}
main{max-width:560px}.m{color:#C9A84C;letter-spacing:.18em;font-weight:700;font-size:13px}h1{font-size:28px;line-height:1.2;margin:16px 0}
p{color:#C9D3E2;line-height:1.6}a{color:#C9A84C}</style></head><body><main>
<div class="m">ARGONAUT OS</div>
<h1>Dossier für ${esc(branche)}: ${esc(titel)}</h1>
<p>${esc(grund)}</p>
<p>Sie möchten trotzdem mehr erfahren? Wir zeigen Ihnen ARGONAUT OS gern persönlich: <a href="https://argonaut-os.com">argonaut-os.com</a></p>
</main></body></html>`;
}
