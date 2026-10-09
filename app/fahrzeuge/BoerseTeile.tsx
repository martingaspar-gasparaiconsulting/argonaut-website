// ============================================================
// ARGONAUT OS · Paket 272 · K11a Fahrzeugbörse — gemeinsame Teile
// Kopf (Name, Logo, Kontakt) und Fuß (Impressum, Hinweise) der öffentlichen
// Börse. Trägt die Marke des BETRIEBS, nicht die von ARGONAUT.
// Server-Komponenten, kein Supabase hier (die Daten kommen von der Seite).
// ============================================================

import type { CSSProperties, ReactNode } from 'react';
import { impressumText } from '@/lib/webRecht';
import { textAuf, ARGONAUT_LINK } from '@/lib/kfzBoerse';
import type { Firma } from '@/lib/kfzBoerseLaden';

export const F = { bg: '#F4F6F9', karte: '#FFFFFF', text: '#111827', dim: '#5B6676', linie: '#E2E7EE' };

export const BOERSE_CSS = `
.bx-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.bx-karte{background:#fff;border:1px solid ${F.linie};border-radius:14px;overflow:hidden;text-decoration:none;color:${F.text};display:flex;flex-direction:column;transition:box-shadow .15s}
.bx-karte:hover{box-shadow:0 6px 24px rgba(17,24,39,.10)}
.bx-bild{aspect-ratio:4/3;width:100%;object-fit:cover;background:#E9EDF2;display:block}
.bx-leer{aspect-ratio:4/3;display:grid;place-items:center;background:linear-gradient(135deg,#E9EDF2,#D5DCE5);color:#7A8596;font-weight:700;letter-spacing:.06em;font-size:13px}
.bx-galerie{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:14px}
.bx-galerie img{scroll-snap-align:start;flex:0 0 100%;max-width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;background:#E9EDF2}
.bx-zwei{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:20px;align-items:start}
@media (max-width:860px){.bx-zwei{grid-template-columns:minmax(0,1fr)}}
.bx-filter{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
.bx-filter label{display:grid;gap:4px;font-size:12.5px;color:${F.dim}}
.bx-filter select,.bx-filter input{border:1px solid ${F.linie};border-radius:8px;padding:9px 10px;font-size:14px;background:#fff;color:${F.text};min-width:0}
`;

export function BoerseSeite({ firma, children, fussHinweis }: { firma: Firma; children: ReactNode; fussHinweis?: string }) {
  return (
    <main style={{ minHeight: '100vh', background: F.bg, color: F.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <style>{BOERSE_CSS}</style>
      <BoerseKopf firma={firma} />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 16px 40px' }}>{children}</div>
      <BoerseFuss firma={firma} hinweis={fussHinweis} />
    </main>
  );
}

function BoerseKopf({ firma }: { firma: Firma }) {
  const vorne = textAuf(firma.akzent);
  return (
    <header style={{ background: firma.akzent, color: vorne }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {firma.logo && <img src={firma.logo} alt="" style={{ height: 40, width: 'auto', maxWidth: 160, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 3 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 19, lineHeight: 1.2 }}>{firma.name || 'Fahrzeugangebot'}</div>
            {(firma.ort || firma.plz) && <div style={{ fontSize: 13, opacity: 0.85 }}>{[firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 14, fontWeight: 600 }}>
          {firma.telefon && <a href={`tel:${firma.telefon.replace(/[^+0-9]/g, '')}`} style={{ color: vorne, textDecoration: 'none' }}>☎ {firma.telefon}</a>}
          {firma.email && <a href={`mailto:${firma.email}`} style={{ color: vorne, textDecoration: 'none' }}>✉ {firma.email}</a>}
        </div>
      </div>
    </header>
  );
}

// Paket 294: eigener Fuß-Hinweis für die Mietseite (sonst Kauf-Hinweis wie bisher)
function BoerseFuss({ firma, hinweis }: { firma: Firma; hinweis?: string }) {
  const imp = impressumText({
    firma: firma.name, impressum_inhaber: firma.inhaber, strasse: firma.strasse, plz: firma.plz, ort: firma.ort,
    telefon: firma.telefon, email: firma.email, impressum_ustid: firma.ustid, impressum_register: firma.register, impressum_aufsicht: firma.aufsicht,
  });
  return (
    <footer style={{ borderTop: `1px solid ${F.linie}`, background: '#fff' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 16px 28px', fontSize: 13, color: F.dim, display: 'grid', gap: 10 }}>
        {firma.oeffnungszeiten && <div><b style={{ color: F.text }}>Öffnungszeiten:</b> {firma.oeffnungszeiten}</div>}
        <div>{hinweis ?? 'Alle Angaben nach bestem Wissen. Irrtümer und Zwischenverkauf vorbehalten. Maßgeblich ist der Kaufvertrag.'}</div>
        <details>
          <summary style={{ cursor: 'pointer', color: F.text, fontWeight: 700 }}>Impressum</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '8px 0 0' }}>{imp}</pre>
        </details>
        {firma.web && /^https?:\/\//.test(firma.web) && <a href={firma.web} rel="noopener" style={{ color: F.text }}>Zur Webseite von {firma.name || 'uns'} ↗</a>}
        {/* Paket 273: offener Hinweis auf ARGONAUT (nur Marke, keine Suchbegriffe) */}
        <div style={{ fontSize: 12 }}><a href={ARGONAUT_LINK} rel="noopener" style={{ color: F.dim }}>Präsentiert mit ARGONAUT OS</a></div>
      </div>
    </footer>
  );
}

export const st: Record<string, CSSProperties> = {
  h1: { fontSize: 26, fontWeight: 800, margin: '0 0 4px', lineHeight: 1.25 },
  dim: { color: F.dim, fontSize: 14 },
  box: { background: F.karte, border: `1px solid ${F.linie}`, borderRadius: 14, padding: 16 },
  pill: { display: 'inline-block', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, background: '#FFF4D6', color: '#7A5600' },
  preis: { fontSize: 22, fontWeight: 800 },
  klein: { fontSize: 12.5, color: F.dim },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', color: F.dim, fontWeight: 500, padding: '7px 10px 7px 0', borderBottom: `1px solid ${F.linie}`, verticalAlign: 'top', whiteSpace: 'nowrap' },
  td: { padding: '7px 0', borderBottom: `1px solid ${F.linie}`, fontWeight: 600 },
};
