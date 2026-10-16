// ============================================================================
// ARGONAUT OS · lib/protokollStart.ts — MO1 Teil 4 (16.10.2026)
//
// 1. QR am Objekt: ein Aufkleber an Anlage, Fahrzeug, Leiter, Feuerlöscher …
//    führt direkt zu „Protokoll starten" für genau dieses Objekt.
//    Link nur zur eigenen Adresse und nur mit echter ID — sonst null.
//    Wer scannt, muss angemeldet sein (Bereich /dashboard).
// 2. Norm-Startvorlagen: die geprüften Fristen und Prüfpunkte aus
//    lib/pruefungen.ts (PRUEF_NORMEN) als Formular-Vorlagen mit Intervall,
//    Messwerte mit Einheit und Grenzwert. Fachwerte sind STARTWERTE.
//
// Rein, ohne Datenbank — getestet in tests/protokollStartMO1d.test.mjs.
// ============================================================================

import { PRUEF_NORMEN, type PruefNorm } from './pruefungen';
import { istBezugTyp, istUuid, type BezugTyp } from './protokollBezug';
import type { Feld } from './formularBaukasten';

export const START_PARAM = 'objekt';

/** Link für den QR-Aufkleber: /dashboard/formulare?objekt=<typ>:<id> */
export function protokollLink(origin: string, typ: unknown, id: unknown): string | null {
  const o = String(origin ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/?#]+$/i.test(o)) return null;
  if (!istBezugTyp(typ) || !istUuid(id)) return null;
  return `${o}/dashboard/formulare?${START_PARAM}=${typ}:${String(id).toLowerCase()}`;
}

/** Liest ?objekt=<typ>:<id> aus der Adresse — alles andere wird ignoriert. */
export function leseStartObjekt(suche: string | null | undefined): { typ: BezugTyp; id: string } | null {
  let roh: string | null = null;
  try { roh = new URLSearchParams(String(suche ?? '')).get(START_PARAM); } catch { return null; }
  if (!roh) return null;
  const [typ, id, rest] = roh.split(':');
  if (rest !== undefined || !istBezugTyp(typ) || !istUuid(id)) return null;
  return { typ, id: id.toLowerCase() };
}

/** Text für das Etikett unter dem QR-Code (HTML-sicher). */
export function etikettHtml(titel: string, qrSvg: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const svg = /^<svg[\s>]/.test(qrSvg) ? qrSvg : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>QR ${esc(titel)}</title>`
    + '<style>body{font-family:system-ui,sans-serif;margin:24px;color:#000}.e{width:62mm;border:1px dashed #999;padding:4mm;text-align:center}'
    + '.e svg{width:50mm;height:50mm}.t{font-weight:700;font-size:12pt;margin-top:2mm}.h{font-size:9pt;color:#444}@media print{.e{border:0}}</style></head>'
    + `<body><div class="e">${svg}<div class="t">${esc(titel)}</div><div class="h">Scannen · Protokoll starten</div></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Norm-Startvorlagen
// ---------------------------------------------------------------------------

export type NormVorlage = { key: string; titel: string; kategorie: string; beschreibung: string; intervall_monate: number; felder: Feld[] };

export function normZuVorlage(n: PruefNorm): NormVorlage {
  const felder: Feld[] = [];
  let i = 0;
  const neu = (f: Omit<Feld, 'id'>) => { i += 1; felder.push({ id: `f${i}`, ...f }); };
  neu({ typ: 'hinweis', label: `Startvorlage nach ${n.norm}: Prüfpunkte, Grenzwerte und Frist sind Startwerte. Bitte für Ihren Betrieb prüfen und anpassen.` });
  if (n.fristHinweis) neu({ typ: 'hinweis', label: n.fristHinweis });
  neu({ typ: 'datum', label: 'Prüfdatum', pflicht: true });
  neu({ typ: 'text', label: 'Prüfer/in', pflicht: true });
  neu({ typ: 'ueberschrift', label: 'Sichtprüfung und Erprobung' });
  for (const p of n.pruefpunkte) neu({ typ: 'pruefpunkt', label: p, pflicht: true });
  if (n.messungen?.length) {
    neu({ typ: 'ueberschrift', label: 'Messungen' });
    for (const m of n.messungen) {
      const f: Omit<Feld, 'id'> = { typ: 'messwert', label: m.punkt, einheit: m.einheit, pflicht: true };
      if (typeof m.min === 'number' && Number.isFinite(m.min)) f.min = m.min;
      if (typeof m.max === 'number' && Number.isFinite(m.max)) f.max = m.max;
      if (m.hinweis) f.hilfe = m.hinweis;
      neu(f);
    }
  }
  neu({ typ: 'textlang', label: 'Festgestellte Mängel / Bemerkungen' });
  neu({ typ: 'foto', label: 'Fotos' });
  neu({ typ: 'unterschrift', label: 'Unterschrift Prüfer/in', pflicht: true });
  return {
    key: n.key, titel: `${n.bezeichnung} (${n.norm})`.slice(0, 200), kategorie: 'pruefung',
    beschreibung: `Wiederkehrende Prüfung, Startwert ${n.intervall_monate} Monate.`, intervall_monate: n.intervall_monate, felder,
  };
}

export const NORM_VORLAGEN: NormVorlage[] = PRUEF_NORMEN.map(normZuVorlage);
