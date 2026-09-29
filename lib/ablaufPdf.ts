// ============================================================================
// ARGONAUT OS · lib/ablaufPdf.ts — Baustein „PDF erstellen" (Paket 167)
//
// Zwei Vorlagen, beide schlicht und druckfertig (weiß, A4, ohne Deckblatt):
//   · schreiben      Titel + Text (Platzhalter sind schon eingesetzt)
//   · vorgangsblatt  Titel + Tabelle mit den Angaben des Vorgangs
// Firmenname und Farbe aus dem CI des Betriebs. ALLES wird maskiert.
// Gerendert wird über Gotenberg (lib/textPdf) — diese Datei ist rein.
// ============================================================================

import { esc } from './markdownEinfach';

export type PdfInhalt = {
  vorlage: 'schreiben' | 'vorgangsblatt';
  titel: string;
  text: string;
  zeilen: [string, string][];
  firma: string;
  farbe?: string | null;
  datum: string;
};

export function ablaufPdfHtml(p: PdfInhalt): string {
  const farbe = /^#[0-9a-f]{3,8}$/i.test(String(p.farbe ?? '')) ? String(p.farbe) : '#C9A84C';
  const absaetze = String(p.text ?? '').split(/\n{2,}/).map((a) => a.trim()).filter(Boolean)
    .map((a) => `<p>${esc(a).replace(/\n/g, '<br>')}</p>`).join('');
  const tabelle = p.zeilen.length > 0
    ? `<table>${p.zeilen.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`
    : '<p class="leer">Keine Angaben vorhanden.</p>';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(p.titel)}</title><style>
@page { size: A4; margin: 20mm 18mm 22mm 18mm; }
body { font-family: 'DM Sans', Arial, Helvetica, sans-serif; color: #1c2430; font-size: 11pt; line-height: 1.6; margin: 0; }
.kopf { border-bottom: 3px solid ${farbe}; padding-bottom: 3mm; margin-bottom: 8mm; display: flex; justify-content: space-between; align-items: baseline; }
.firma { font-weight: 700; color: ${farbe}; font-size: 12pt; } .datum { color: #718096; font-size: 9.5pt; }
h1 { font-size: 17pt; margin: 0 0 6mm; line-height: 1.25; }
p { margin: 0 0 3.5mm; } p.leer { color: #718096; }
table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 2mm 3mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
th { width: 38%; color: #4a5568; font-weight: 600; }
</style></head><body>
<div class="kopf"><span class="firma">${esc(p.firma || '')}</span><span class="datum">${esc(p.datum)}</span></div>
<h1>${esc(p.titel)}</h1>
${p.vorlage === 'vorgangsblatt' ? tabelle : absaetze}
</body></html>`;
}

/** Speicherpfad im privaten Ordner: <betrieb>/<jahr-monat>/<kennung>.pdf */
export function ablaufPdfPfad(ownerId: string, kennung: string, jetzt: Date): string {
  const sauber = (x: string) => String(x).replace(/[^a-zA-Z0-9-]/g, '');
  return `${sauber(ownerId)}/${jetzt.toISOString().slice(0, 7)}/${sauber(kennung)}.pdf`;
}
