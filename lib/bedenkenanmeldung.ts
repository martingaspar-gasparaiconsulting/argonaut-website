// ============================================================================
// ARGONAUT OS · lib/bedenkenanmeldung.ts — HW-B (16.10.2026)
//
// Bedenkenanmeldung nach VOB/B § 4 Abs. 3 als Schreiben aus dem Bauvorhaben.
// Der Wortlaut kommt AUSSCHLIESSLICH aus „Meine Rechtstexte" (bau.bedenken);
// ARGONAUT liefert nur das Gerüst: Kopf, Empfänger, Datum, Betreff, Bauvorhaben,
// die je Fall eingetragenen Bedenken und die Frist als Daten. Ohne eigenen Text
// entsteht kein Schreiben. Wortlaut/Gerüst: Anwalt R65.
//
// Reine Funktionen. Node-getestet: tests/bedenkenanmeldungHWB.test.mjs
// ============================================================================

import type { DokumentText } from './rechtsTexte';

export type BedenkenEingabe = { bauvorhaben: string; kunde: string; bedenken: string; frist: string };

export const BEDENKEN_MIN = 20;
export const BEDENKEN_MAX = 4000;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function datumDe(iso: string): string {
  return ISO.test(iso) ? iso.split('-').reverse().join('.') : iso;
}

export function pruefeBedenken(e: BedenkenEingabe, heute: string): { ok: true } | { ok: false; fehler: string } {
  if (!String(e.bauvorhaben ?? '').trim()) return { ok: false, fehler: 'Bitte das Bauvorhaben bzw. die Leistung angeben.' };
  if (!String(e.kunde ?? '').trim()) return { ok: false, fehler: 'Bitte den Auftraggeber angeben.' };
  const b = String(e.bedenken ?? '').trim();
  if (b.length < BEDENKEN_MIN) return { ok: false, fehler: `Bitte die Bedenken konkret beschreiben (mindestens ${BEDENKEN_MIN} Zeichen): was, warum, welche Folge.` };
  if (b.length > BEDENKEN_MAX) return { ok: false, fehler: `Die Bedenken sind zu lang (höchstens ${BEDENKEN_MAX} Zeichen).` };
  const f = String(e.frist ?? '').trim();
  if (!ISO.test(f)) return { ok: false, fehler: 'Bitte eine Frist für die Entscheidung des Auftraggebers setzen.' };
  if (f < heute) return { ok: false, fehler: 'Die Frist liegt in der Vergangenheit.' };
  return { ok: true };
}

/** Werte für die Platzhalter {{…}} im eigenen Text. */
export function bedenkenWerte(e: BedenkenEingabe, firma: string, heute: string): Record<string, string> {
  return {
    betrieb: firma, kunde: e.kunde.trim(), datum: datumDe(heute),
    bauvorhaben: e.bauvorhaben.trim(), bedenken: e.bedenken.trim(), frist: datumDe(e.frist),
  };
}

function esc(x: unknown): string {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const absatz = (t: string) => esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

/** Druckfertiges Schreiben — nur mit eigenem Text des Betriebs. */
export function bedenkenHtml(e: BedenkenEingabe, firma: string, heute: string, text: DokumentText): { ok: true; html: string } | { ok: false; hinweis: string } {
  if (!text.eigen) return { ok: false, hinweis: text.hinweis };
  // Der Text ist schon gefüllt: Stehen Bedenken bzw. Frist darin, nicht doppelt drucken.
  const steht = text.text.includes(e.bedenken.trim());
  const fristSteht = text.text.includes(datumDe(e.frist));
  return {
    ok: true,
    html: `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bedenkenanmeldung</title>
<style>body{font:12.5px/1.55 Helvetica,Arial,sans-serif;color:#111;margin:36px 44px}h1{font-size:16px;margin:22px 0 10px}.k{color:#555}.box{border:1px solid #bbb;padding:8px 10px;margin:8px 0 14px}.r{text-align:right}.fuss{color:#777;font-size:10.5px;margin-top:28px}</style></head><body>
<div class="k">${esc(firma)}</div>
<p style="margin-top:28px">${esc(e.kunde)}</p>
<p class="r">${esc(datumDe(heute))}</p>
<h1>Bedenkenanmeldung</h1>
<p><b>Bauvorhaben / Leistung:</b> ${esc(e.bauvorhaben)}</p>
${steht ? '' : `<div class="box"><b>Bedenken</b>${absatz(e.bedenken)}</div>`}
${fristSteht ? '' : `<p><b>Frist:</b> ${esc(datumDe(e.frist))}</p>`}
${absatz(text.text)}
<p style="margin-top:36px">${esc(firma)}</p>
<p class="fuss">${esc(text.stand)}</p>
</body></html>`,
  };
}
