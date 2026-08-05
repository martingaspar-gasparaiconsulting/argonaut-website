// app/vorschau/_lib/dossierHtml.ts
// I5 · Dossier-Generator: baut je Branche ein PDF-taugliches HTML aus den
// vorhandenen Branchen-Daten (Schmerzen, Ergebnisse, Module, Rollen) + Preis.
// Rein — kein Fetch. Wird über den Gotenberg-Renderer aboRechnungPdf(html) zu PDF.

import { websiteBranchen, websiteBrancheBySlug, type WebBranche } from './branchen-web';
import { baukastenFor, KERN, type Baustein } from './branchen-bausteine';
import { STUFEN, euro } from '@/lib/tarif';

function esc(s: string): string {
  return (s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}
function slugify(s: string): string {
  return (s || '').toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Freien Text (Slug ODER Name) auf eine Branche abbilden. null = keine. */
export function brancheAufloesen(input: string): WebBranche | null {
  const s = (input || '').trim();
  if (!s) return null;
  const bySlug = websiteBrancheBySlug(slugify(s));
  if (bySlug) return bySlug;
  const alle = websiteBranchen();
  const lower = s.toLowerCase();
  return (
    alle.find((b) => b.name.toLowerCase() === lower) ||
    alle.find((b) => b.name.toLowerCase().includes(lower) || lower.includes(b.name.toLowerCase())) ||
    null
  );
}

/** Datei-/Cache-Schlüssel im Storage (Branche-Slug oder 'allgemein'). */
export function dossierKey(input: string): string {
  const b = brancheAufloesen(input);
  return b ? b.slug : 'allgemein';
}

export function dossierHtml(input: string): string {
  const b = brancheAufloesen(input);
  const titel = b ? b.name : 'Ihr Betrieb';
  const bau = b ? baukastenFor(b.kategorie) : { stack: KERN, spezial: [] as Baustein[], rollen: { voll: '', std: '', self: '' } };
  const module = [...bau.stack, ...bau.spezial];
  const schmerzen = b?.schmerzen ?? [];
  const ergebnisse = b?.ergebnisse ?? [];
  const solo = STUFEN[0];

  const modKarten = module
    .map((m) => `<div class="mod"><div class="mi">${m.icon}</div><div><b>${esc(m.name)}</b>${m.tag ? ` <span class="tag">${esc(m.tag)}</span>` : ''}<div class="ms">${esc(m.sub)}</div></div></div>`)
    .join('');
  const schmerzListe = schmerzen.length
    ? `<h2>Kennen Sie das?</h2><ul>${schmerzen.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '';
  const ergListe = ergebnisse.length
    ? `<h2>Das Ergebnis mit ARGONAUT</h2><ul class="gut">${ergebnisse.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '';

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#0A1628;margin:0;padding:0;font-size:12.5px;line-height:1.5}
    .hero{background:#0A1628;color:#fff;padding:34px 40px}
    .kick{color:#C9A84C;font-weight:800;letter-spacing:2px;text-transform:uppercase;font-size:11px}
    .hero h1{font-size:26px;margin:8px 0 6px} .hero p{color:#B8C4D6;margin:0;max-width:560px}
    .body{padding:26px 40px}
    h2{font-size:16px;margin:20px 0 8px;color:#0A1628} h2:first-child{margin-top:0}
    ul{margin:0;padding-left:18px} li{margin:3px 0} ul.gut li::marker{content:'✓  ';color:#3E9E6E;font-weight:800}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
    .mod{display:flex;gap:8px;background:#f5f6f8;border-radius:8px;padding:9px 11px} .mi{font-size:17px}
    .ms{color:#556;font-size:11px;margin-top:2px} .tag{background:#C9A84C22;color:#8a6d1f;border-radius:5px;padding:1px 6px;font-size:10px;font-weight:700}
    .preis{margin-top:22px;background:#0A1628;color:#fff;border-radius:10px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
    .preis b{font-size:22px;color:#C9A84C} .cta{color:#B8C4D6;font-size:11px}
    .foot{color:#889;font-size:10.5px;margin-top:16px}
  </style></head><body>
    <div class="hero">
      <div class="kick">ARGONAUT OS · Branchen-Dossier</div>
      <h1>${esc(titel)}: ein System statt zwölf.</h1>
      <p>Alles, was Ihr Betrieb täglich braucht — Kunden, Angebote, Rechnungen, Termine, Personal und KI — in einer einzigen, DSGVO-konformen Plattform.</p>
    </div>
    <div class="body">
      ${schmerzListe}
      <h2>Was ARGONAUT für ${esc(titel)} übernimmt</h2>
      <div class="grid">${modKarten}</div>
      ${ergListe}
      <div class="preis">
        <div><div class="cta">Schon ab</div><b>${euro(solo.grundgebuehr)}<span style="font-size:12px;color:#B8C4D6">/Monat</span></b></div>
        <div class="cta">Netto zzgl. USt · unverbindliches Angebot in wenigen Minuten unter argonaut-os.com</div>
      </div>
      <div class="foot">Erstellt für ${esc(titel)} · ARGONAUT OS · KI-Betriebssystem für den deutschen Mittelstand.</div>
    </div>
  </body></html>`;
}
