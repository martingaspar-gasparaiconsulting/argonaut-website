// ============================================================
// ARGONAUT OS · W4-Look · webBloecke.ts — Bausteine + Render-Maschine (v2)
//
// Eine Webseite = eine Liste von Bausteinen (Block[]). Diese Datei enthält:
//   • BAUSTEIN_KATALOG — welche Bausteine es gibt (für den Editor W5)
//   • blockHtml        — ein Baustein → HTML
//   • rechtsSektionen  — Impressum/Datenschutz/AGB als verankerte Abschnitte
//   • seiteHtml        — komplette, in sich geschlossene HTML-Seite (für <iframe>
//                        und fürs Veröffentlichen W7), inkl. fixem Fuß.
//
// v2: mehr „Sog"-Bausteine (Hero mit Bildplatz, Zahlen-Band, Bewertungen, FAQ),
// mutigere Typografie, echter Abschnitts-Rhythmus. Reine Funktionen — keine
// Supabase-Aufrufe, keine Hooks.
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
  | { typ: 'hero'; eyebrow?: string; titel: string; unterzeile: string; knopf: string; bild?: string }
  | { typ: 'stats'; titel?: string; zahlen: { wert: string; label: string }[] }
  | { typ: 'leistungen'; eyebrow?: string; titel: string; punkte: { titel: string; text: string }[] }
  | { typ: 'ueber'; eyebrow?: string; titel: string; text: string }
  | { typ: 'galerie'; titel: string; anzahl: number; bilder?: string[] }
  | { typ: 'testimonials'; eyebrow?: string; titel: string; stimmen: { text: string; name: string; rolle: string }[] }
  | { typ: 'faq'; eyebrow?: string; titel: string; fragen: { frage: string; antwort: string }[] }
  | { typ: 'kontakt'; titel: string; text: string }
  | { typ: 'cta'; titel: string; knopf: string };

// --- Katalog für den Editor (W5) --------------------------------------------
export const BAUSTEIN_KATALOG: { typ: Block['typ']; icon: string; name: string; beschreibung: string }[] = [
  { typ: 'hero', icon: '⭐', name: 'Titelbereich', beschreibung: 'Großer Aufmacher mit Bild, Claim und Knopf' },
  { typ: 'stats', icon: '📊', name: 'Zahlen-Band', beschreibung: 'Große Kennzahlen, die Vertrauen schaffen' },
  { typ: 'leistungen', icon: '🧩', name: 'Leistungen', beschreibung: 'Ihre Angebote in Kacheln' },
  { typ: 'ueber', icon: '🏢', name: 'Über uns', beschreibung: 'Ihre Geschichte und Stärken' },
  { typ: 'galerie', icon: '🖼️', name: 'Galerie', beschreibung: 'Platz für Bilder (Platzhalter)' },
  { typ: 'testimonials', icon: '⭐', name: 'Bewertungen', beschreibung: 'Kundenstimmen mit Sternen' },
  { typ: 'faq', icon: '❓', name: 'FAQ', beschreibung: 'Häufige Fragen zum Aufklappen' },
  { typ: 'kontakt', icon: '✉️', name: 'Kontakt', beschreibung: 'Adresse, Telefon, Anfrage' },
  { typ: 'cta', icon: '📣', name: 'Handlungsaufruf', beschreibung: 'Auffälliger Knopf zur Anfrage' },
];

// --- Helfer -----------------------------------------------------------------
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function z(v?: string | null): string { return (v ?? '').trim(); }
function safeUrl(u?: string | null): string {
  const s = z(u);
  if (!/^https?:\/\//i.test(s)) return '';
  return s.replace(/["'()\\<>\s]/g, '');
}
function eyebrowHtml(text?: string): string {
  return text ? '<div class="eyebrow">' + esc(text) + '</div>' : '';
}

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
function sterne(): string {
  return '<span class="sterne">' + '★★★★★' + '</span>';
}

// --- Ein Baustein → HTML ----------------------------------------------------
export function blockHtml(b: Block, ci: CiWeb): string {
  switch (b.typ) {
    case 'hero': {
      const url = safeUrl(b.bild);
      const stil = url
        ? ' style="background-image:linear-gradient(135deg,rgba(10,15,25,.72),rgba(10,15,25,.55)),url(' + url + ');background-size:cover;background-position:center"'
        : '';
      return [
        '<section class="hero' + (url ? ' hero-bild' : '') + '"' + stil + '><div class="wrap">',
        eyebrowHtml(b.eyebrow),
        '<h1>' + esc(b.titel) + '</h1>',
        b.unterzeile ? '<p class="lead">' + esc(b.unterzeile) + '</p>' : '',
        b.knopf ? '<a class="btn" href="#kontakt">' + esc(b.knopf) + '</a>' : '',
        '</div></section>',
      ].join('');
    }
    case 'stats':
      return [
        '<section class="stats"><div class="wrap">',
        b.titel ? '<h2 class="stats-titel">' + esc(b.titel) + '</h2>' : '',
        '<div class="stats-grid">',
        b.zahlen.map((za) => '<div class="stat"><div class="stat-wert">' + esc(za.wert) + '</div><div class="stat-label">' + esc(za.label) + '</div></div>').join(''),
        '</div></div></section>',
      ].join('');
    case 'leistungen':
      return [
        '<section class="sec" id="leistungen"><div class="wrap">',
        eyebrowHtml(b.eyebrow),
        '<h2>' + esc(b.titel) + '</h2>',
        '<div class="grid">',
        b.punkte.map((p) => '<div class="card"><h3>' + esc(p.titel) + '</h3>' + (p.text ? '<p>' + esc(p.text) + '</p>' : '') + '</div>').join(''),
        '</div></div></section>',
      ].join('');
    case 'ueber':
      return [
        '<section class="sec alt" id="ueber"><div class="wrap narrow">',
        eyebrowHtml(b.eyebrow),
        '<h2>' + esc(b.titel) + '</h2>',
        '<p class="fliess">' + esc(b.text) + '</p>',
        '</div></section>',
      ].join('');
    case 'galerie': {
      const bilder = Array.isArray(b.bilder) ? b.bilder.map(safeUrl).filter(Boolean) : [];
      let inner = '';
      if (bilder.length) {
        inner = bilder.slice(0, 12).map((u) => '<div class="galimg"><img src="' + u + '" alt="" loading="lazy"></div>').join('');
      } else {
        const n = Math.max(1, Math.min(12, b.anzahl || 3));
        for (let i = 0; i < n; i++) inner += '<div class="ph"><span>Bild</span></div>';
      }
      return '<section class="sec"><div class="wrap"><h2>' + esc(b.titel) + '</h2><div class="gal">' + inner + '</div></div></section>';
    }
    case 'testimonials':
      return [
        '<section class="sec alt"><div class="wrap">',
        eyebrowHtml(b.eyebrow),
        '<h2>' + esc(b.titel) + '</h2>',
        '<div class="grid">',
        b.stimmen.map((s) => '<figure class="stimme">' + sterne() + '<blockquote>' + esc(s.text) + '</blockquote><figcaption><b>' + esc(s.name) + '</b>' + (s.rolle ? '<span>' + esc(s.rolle) + '</span>' : '') + '</figcaption></figure>').join(''),
        '</div></div></section>',
      ].join('');
    case 'faq':
      return [
        '<section class="sec"><div class="wrap narrow">',
        eyebrowHtml(b.eyebrow),
        '<h2>' + esc(b.titel) + '</h2>',
        '<div class="faq">',
        b.fragen.map((f) => '<details><summary>' + esc(f.frage) + '</summary><div class="faq-a">' + esc(f.antwort) + '</div></details>').join(''),
        '</div></div></section>',
      ].join('');
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
        b.text ? '<p class="fliess">' + esc(b.text) + '</p>' : '',
        li.length ? '<ul class="kontakt">' + li.join('') + '</ul>' : '',
        '</div></section>',
      ].join('');
    }
    case 'cta':
      return '<section class="cta"><div class="wrap"><h2>' + esc(b.titel) + '</h2><a class="btn btn-dunkel" href="#kontakt">' + esc(b.knopf) + '</a></div></section>';
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
    'body{margin:0;font-family:' + font + ';color:#1c2430;background:#fff;line-height:1.65;-webkit-font-smoothing:antialiased}',
    'h1,h2,h3{line-height:1.12;letter-spacing:-.02em}',
    '.wrap{max-width:1120px;margin:0 auto;padding:0 24px}',
    '.wrap.narrow{max-width:780px}',
    '.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:13px;font-weight:800;color:var(--s);margin-bottom:14px}',
    // Kopf
    '.top{background:rgba(255,255,255,.92);backdrop-filter:saturate(1.2) blur(8px);border-bottom:1px solid #eceff3;position:sticky;top:0;z-index:5}',
    '.trow{display:flex;align-items:center;gap:14px;padding:15px 24px;max-width:1120px;margin:0 auto}',
    '.logo{height:46px;width:46px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;background:var(--p);flex:0 0 auto;font-size:20px}',
    '.logo img{height:46px;width:auto;border-radius:11px;display:block}',
    '.fn{font-weight:800;font-size:20px;color:var(--p);letter-spacing:-.01em}',
    '.cl{font-size:13px;color:var(--s);font-weight:700}',
    '.mainnav{margin-left:auto;display:flex;gap:24px}',
    '.mainnav a{color:#41505f;text-decoration:none;font-weight:600;font-size:15px}',
    '.mainnav a:hover{color:var(--p)}',
    // Knöpfe
    '.btn{display:inline-block;background:var(--a);color:#fff;text-decoration:none;font-weight:800;padding:15px 30px;border-radius:10px;font-size:17px;box-shadow:0 8px 24px -8px rgba(0,0,0,.35);transition:transform .15s}',
    '.btn:hover{transform:translateY(-2px)}',
    '.btn-dunkel{background:var(--p)}',
    // Hero
    '.hero{background:var(--p);color:#fff;padding:96px 0;position:relative;overflow:hidden}',
    '.hero:not(.hero-bild):after{content:"";position:absolute;top:-30%;right:-10%;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,var(--s),transparent 62%);opacity:.28;pointer-events:none}',
    '.hero .wrap{position:relative;z-index:1}',
    '.hero .eyebrow{color:var(--s)}',
    '.hero h1{margin:0 0 16px;font-size:clamp(34px,5.4vw,60px);max-width:14ch}',
    '.hero .lead{font-size:clamp(17px,2.4vw,23px);color:rgba(255,255,255,.9);margin:0 0 30px;max-width:620px}',
    // Abschnitte
    '.sec{padding:82px 0}',
    '.sec.alt{background:#f5f8fc}',
    '.sec h2{font-size:clamp(26px,3.6vw,40px);margin:0 0 34px;color:var(--p)}',
    '.fliess{font-size:clamp(16px,1.5vw,19px);color:#41505f;max-width:64ch}',
    // Leistungs-/Karten-Raster
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}',
    '.card{background:#fff;border:1px solid #e7ebf1;border-radius:16px;padding:26px;box-shadow:0 12px 30px -22px rgba(20,40,70,.35)}',
    '.card h3{margin:0 0 9px;color:var(--p);font-size:20px}',
    '.card p{margin:0;color:#51606f}',
    // Zahlen-Band
    '.stats{background:var(--p);color:#fff;padding:56px 0}',
    '.stats-titel{color:#fff;text-align:center;margin:0 0 30px;font-size:clamp(22px,3vw,30px)}',
    '.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:22px;text-align:center}',
    '.stat-wert{font-size:clamp(34px,4.4vw,52px);font-weight:900;color:var(--s);letter-spacing:-.03em}',
    '.stat-label{font-size:15px;color:rgba(255,255,255,.82);margin-top:6px}',
    // Galerie
    '.gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}',
    '.ph{aspect-ratio:4/3;background:linear-gradient(135deg,#eef2f7,#dde5ee);border:1px dashed #c3ccd7;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#9aa7b5;font-weight:700}',
    '.galimg{aspect-ratio:4/3;border-radius:14px;overflow:hidden;background:#eef2f7}',
    '.galimg img{width:100%;height:100%;object-fit:cover;display:block}',
    // Bewertungen
    '.stimme{margin:0;background:#fff;border:1px solid #e7ebf1;border-radius:16px;padding:24px;box-shadow:0 12px 30px -22px rgba(20,40,70,.35)}',
    '.sterne{color:#f5b301;font-size:18px;letter-spacing:2px}',
    '.stimme blockquote{margin:12px 0 16px;font-size:17px;color:#33414f;line-height:1.6}',
    '.stimme figcaption{display:flex;flex-direction:column}',
    '.stimme figcaption b{color:var(--p)}',
    '.stimme figcaption span{font-size:13px;color:#8290a0}',
    // FAQ
    '.faq details{border:1px solid #e7ebf1;border-radius:12px;margin-bottom:10px;background:#fff;overflow:hidden}',
    '.faq summary{cursor:pointer;padding:16px 18px;font-weight:700;color:var(--p);list-style:none}',
    '.faq summary::-webkit-details-marker{display:none}',
    '.faq summary:after{content:"+";float:right;color:var(--s);font-weight:900}',
    '.faq details[open] summary:after{content:"–"}',
    '.faq-a{padding:0 18px 16px;color:#51606f}',
    // Kontakt
    '.kontakt{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:10px;font-size:17px;color:#38434f}',
    // CTA
    '.cta{background:var(--s);color:#1c2430;padding:64px 0;text-align:center}',
    '.cta h2{margin:0 0 24px;font-size:clamp(24px,3.2vw,36px)}',
    // Recht
    '.recht{padding:44px 0;border-top:1px solid #eceff3;background:#fff}',
    '.recht h2{color:var(--p);font-size:22px;margin:0 0 14px}',
    '.pretext{white-space:pre-wrap;color:#41505f;font-size:14px;line-height:1.7}',
    // Fuß
    '.ao-fuss{background:#0d141c;color:rgba(255,255,255,.8);padding:26px 0}',
    '.ao-fuss-inner{max-width:1120px;margin:0 auto;padding:0 24px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;font-size:14px}',
    '.ao-fuss-links{display:flex;gap:20px}',
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
  const logo = safeUrl(ci.logo_url)
    ? '<span class="logo"><img src="' + safeUrl(ci.logo_url) + '" alt="Logo"></span>'
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
