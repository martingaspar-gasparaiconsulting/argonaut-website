// ============================================================
// ARGONAUT OS · W3 · webBloecke.ts — Bausteine + Render-Maschine
//
// Eine Webseite = eine Liste von Bausteinen (Block[]). Diese Datei enthält:
//   • BAUSTEIN_KATALOG — welche Bausteine es gibt (für den späteren Editor W5)
//   • blockHtml        — ein Baustein → HTML
//   • rechtsSektionen  — Impressum/Datenschutz/AGB als verankerte Abschnitte
//   • seiteHtml        — komplette, in sich geschlossene HTML-Seite (für <iframe>
//                        und später fürs Veröffentlichen W7), inkl. fixem Fuß.
//
// Reine Funktionen — KEINE Supabase-Aufrufe, KEINE React-Hooks. Damit vom
// KI-Generator (W4), vom Editor (W5) und vom Veröffentlichen (W7) nutzbar.
// ============================================================

import { impressumText, datenschutzText, agbText, fussHtml, type CiRecht } from './webRecht';

export interface CiWeb extends CiRecht {
  firma?: string | null;
  slogan?: string | null;
  ueber_uns?: string | null;
  kernsaetze?: string | null;
  logo_url?: string | null;
  farbe_primaer?: string | null;
  farbe_sekundaer?: string | null;
  farbe_akzent?: string | null;
  schrift?: string | null;
  oeffnungszeiten?: string | null;
}

// --- Baustein-Typen ---------------------------------------------------------
export type Block =
  | { typ: 'hero'; titel: string; unterzeile: string; knopf: string }
  | { typ: 'leistungen'; titel: string; punkte: { titel: string; text: string }[] }
  | { typ: 'ueber'; titel: string; text: string }
  | { typ: 'galerie'; titel: string; anzahl: number }
  | { typ: 'kontakt'; titel: string; text: string }
  | { typ: 'cta'; titel: string; knopf: string };

// --- Katalog für den späteren Editor (W5) -----------------------------------
export const BAUSTEIN_KATALOG: { typ: Block['typ']; icon: string; name: string; beschreibung: string }[] = [
  { typ: 'hero', icon: '⭐', name: 'Titelbereich', beschreibung: 'Großer Aufmacher mit Claim und Knopf' },
  { typ: 'leistungen', icon: '🧩', name: 'Leistungen', beschreibung: 'Ihre Angebote in Kacheln' },
  { typ: 'ueber', icon: '🏢', name: 'Über uns', beschreibung: 'Ihre Geschichte und Stärken' },
  { typ: 'galerie', icon: '🖼️', name: 'Galerie', beschreibung: 'Platz für Bilder (Platzhalter)' },
  { typ: 'kontakt', icon: '✉️', name: 'Kontakt', beschreibung: 'Adresse, Telefon, Anfrage' },
  { typ: 'cta', icon: '📣', name: 'Handlungsaufruf', beschreibung: 'Auffälliger Knopf zur Anfrage' },
];

// --- Helfer -----------------------------------------------------------------
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function z(v?: string | null): string { return (v ?? '').trim(); }

const SCHRIFT_STACKS: Record<string, string> = {
  modern: "'Inter','Segoe UI',system-ui,sans-serif",
  klassisch: "Georgia,'Times New Roman',serif",
  elegant: "'Playfair Display',Georgia,serif",
  freundlich: "'Nunito','Segoe UI',sans-serif",
  technisch: "'Roboto Mono',ui-monospace,monospace",
  system: 'system-ui,sans-serif',
};
export function schriftStack(schrift?: string | null): string {
  return SCHRIFT_STACKS[z(schrift) || 'modern'] || SCHRIFT_STACKS.modern;
}

function kontaktAdresse(ci: CiWeb): string {
  return [z(ci.strasse), [z(ci.plz), z(ci.ort)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

// --- Ein Baustein → HTML ----------------------------------------------------
export function blockHtml(b: Block, ci: CiWeb): string {
  switch (b.typ) {
    case 'hero':
      return [
        '<section class="hero"><div class="wrap">',
        '<h1>' + esc(b.titel) + '</h1>',
        b.unterzeile ? '<p class="lead">' + esc(b.unterzeile) + '</p>' : '',
        b.knopf ? '<a class="btn" href="#kontakt">' + esc(b.knopf) + '</a>' : '',
        '</div></section>',
      ].join('');
    case 'leistungen':
      return [
        '<section class="sec" id="leistungen"><div class="wrap">',
        '<h2>' + esc(b.titel) + '</h2>',
        '<div class="grid">',
        b.punkte.map((p) => '<div class="card"><h3>' + esc(p.titel) + '</h3>' + (p.text ? '<p>' + esc(p.text) + '</p>' : '') + '</div>').join(''),
        '</div></div></section>',
      ].join('');
    case 'ueber':
      return [
        '<section class="sec alt" id="ueber"><div class="wrap narrow">',
        '<h2>' + esc(b.titel) + '</h2>',
        '<p>' + esc(b.text) + '</p>',
        '</div></section>',
      ].join('');
    case 'galerie': {
      const n = Math.max(1, Math.min(12, b.anzahl || 3));
      let boxen = '';
      for (let i = 0; i < n; i++) boxen += '<div class="ph">Bild</div>';
      return '<section class="sec"><div class="wrap"><h2>' + esc(b.titel) + '</h2><div class="gal">' + boxen + '</div></div></section>';
    }
    case 'kontakt': {
      const tel = z(ci.telefon), mail = z(ci.email), adr = kontaktAdresse(ci), oeff = z(ci.oeffnungszeiten);
      const li: string[] = [];
      if (tel) li.push('<li>&#9742; ' + esc(tel) + '</li>');
      if (mail) li.push('<li>&#9993; ' + esc(mail) + '</li>');
      if (adr) li.push('<li>&#128205; ' + esc(adr) + '</li>');
      if (oeff) li.push('<li>&#128336; ' + esc(oeff).replace(/\n/g, '<br>') + '</li>');
      return [
        '<section class="sec alt" id="kontakt"><div class="wrap narrow">',
        '<h2>' + esc(b.titel) + '</h2>',
        b.text ? '<p>' + esc(b.text) + '</p>' : '',
        li.length ? '<ul class="kontakt">' + li.join('') + '</ul>' : '',
        '</div></section>',
      ].join('');
    }
    case 'cta':
      return '<section class="cta"><div class="wrap"><h2>' + esc(b.titel) + '</h2><a class="btn" href="#kontakt">' + esc(b.knopf) + '</a></div></section>';
    default:
      return '';
  }
}

// --- Rechts-Abschnitte (verankert, damit der Fuß darauf zeigt) --------------
export function rechtsSektionen(ci: CiWeb): string {
  const block = (id: string, titel: string, text: string) =>
    '<section class="recht" id="' + id + '"><div class="wrap narrow"><h2>' + titel + '</h2><div class="pretext">' + esc(text) + '</div></div></section>';
  return [
    block('impressum', 'Impressum', impressumText(ci)),
    block('datenschutz', 'Datenschutz', datenschutzText(ci)),
    block('agb', 'AGB', agbText(ci)),
  ].join('');
}

// --- CSS der erzeugten Seite ------------------------------------------------
function seiteCss(ci: CiWeb): string {
  const p = z(ci.farbe_primaer) || '#1F3A5F';
  const s = z(ci.farbe_sekundaer) || '#E0A24C';
  const a = z(ci.farbe_akzent) || '#4CAF7D';
  const font = schriftStack(ci.schrift);
  return [
    ':root{--p:' + p + ';--s:' + s + ';--a:' + a + '}',
    '*{box-sizing:border-box}',
    'body{margin:0;font-family:' + font + ';color:#1c2430;background:#fff;line-height:1.6}',
    '.wrap{max-width:1080px;margin:0 auto;padding:0 22px}',
    '.wrap.narrow{max-width:760px}',
    '.top{background:#fff;border-bottom:1px solid #eceff3;position:sticky;top:0;z-index:5}',
    '.trow{display:flex;align-items:center;gap:14px;padding:14px 22px}',
    '.logo{height:44px;width:44px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;background:var(--p);flex:0 0 auto}',
    '.logo img{height:44px;width:auto;border-radius:9px;display:block}',
    '.fn{font-weight:800;font-size:19px;color:var(--p)}',
    '.cl{font-size:13px;color:var(--s);font-weight:600}',
    '.mainnav{margin-left:auto;display:flex;gap:20px}',
    '.mainnav a{color:#41505f;text-decoration:none;font-weight:600;font-size:15px}',
    '.mainnav a:hover{color:var(--p)}',
    '.btn{display:inline-block;background:var(--a);color:#fff;text-decoration:none;font-weight:800;padding:13px 26px;border-radius:9px;font-size:16px}',
    '.hero{background:var(--p);color:#fff;padding:74px 0}',
    '.hero h1{margin:0 0 12px;font-size:clamp(30px,5vw,52px);line-height:1.1}',
    '.hero .lead{font-size:clamp(16px,2.4vw,22px);color:rgba(255,255,255,.85);margin:0 0 26px;max-width:640px}',
    '.sec{padding:60px 0}',
    '.sec.alt{background:#f6f8fb}',
    '.sec h2{font-size:clamp(24px,3.4vw,36px);margin:0 0 28px;color:var(--p)}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}',
    '.card{background:#fff;border:1px solid #e7ebf1;border-radius:14px;padding:22px}',
    '.card h3{margin:0 0 8px;color:var(--p);font-size:19px}',
    '.card p{margin:0;color:#51606f}',
    '.gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}',
    '.ph{aspect-ratio:4/3;background:#e7ebf1;border:1px dashed #c3ccd7;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#9aa7b5;font-weight:700}',
    '.kontakt{list-style:none;padding:0;margin:18px 0 0;display:grid;gap:8px;font-size:17px;color:#38434f}',
    '.cta{background:var(--s);color:#1c2430;padding:52px 0;text-align:center}',
    '.cta h2{margin:0 0 22px;font-size:clamp(22px,3vw,32px)}',
    '.recht{padding:40px 0;border-top:1px solid #eceff3;background:#fff}',
    '.recht h2{color:var(--p);font-size:22px;margin:0 0 14px}',
    '.pretext{white-space:pre-wrap;color:#41505f;font-size:14px;line-height:1.7}',
    '.ao-fuss{background:var(--p);color:rgba(255,255,255,.85);padding:22px 0}',
    '.ao-fuss-inner{max-width:1080px;margin:0 auto;padding:0 22px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;font-size:14px}',
    '.ao-fuss-links{display:flex;gap:18px}',
    '.ao-fuss-links a{color:#fff;text-decoration:none;opacity:.85}',
    '.ao-fuss-links a:hover{opacity:1}',
  ].join('');
}

// --- Komplette, in sich geschlossene HTML-Seite -----------------------------
export function seiteHtml(
  seite: { titel?: string; bloecke: Block[] },
  ci: CiWeb,
  jahr: number,
): string {
  const firma = esc(z(ci.firma) || 'Ihr Firmenname');
  const slogan = esc(z(ci.slogan));
  const logo = z(ci.logo_url)
    ? '<span class="logo"><img src="' + esc(ci.logo_url) + '" alt="Logo"></span>'
    : '<span class="logo">' + esc((z(ci.firma) || 'A').charAt(0).toUpperCase()) + '</span>';

  const koerper = (seite.bloecke || []).map((b) => blockHtml(b, ci)).join('\n');

  return [
    '<!doctype html>',
    '<html lang="de"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + firma + '</title>',
    '<style>' + seiteCss(ci) + '</style>',
    '</head><body>',
    '<header class="top"><div class="trow">',
    logo,
    '<div><div class="fn">' + firma + '</div>' + (slogan ? '<div class="cl">' + slogan + '</div>' : '') + '</div>',
    '<nav class="mainnav"><a href="#leistungen">Leistungen</a><a href="#ueber">Über uns</a><a href="#kontakt">Kontakt</a></nav>',
    '</div></header>',
    koerper,
    rechtsSektionen(ci),
    fussHtml(ci, jahr),
    '</body></html>',
  ].join('\n');
}
