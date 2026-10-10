// ============================================================================
// ARGONAUT OS · lib/fahrzeugMappeAuslesen.ts — Paket 307 (10.10.2026) · FM3
//
// Fahrzeugschein auslesen: Das Foto (oder PDF) im Fach „Fahrzeugschein" wird
// auf Wunsch des Verkäufers von der KI gelesen. Die KI liefert NUR Vorschläge
// für Marke, Modell, FIN, Erstzulassung, Leistung und Kraftstoff. Der
// Verkäufer sieht jeden Wert, wählt aus und übernimmt selbst — nie wird etwas
// automatisch eingetragen („automatisch erkannt — bitte prüfen").
//
// Datenschutz: Die KI soll KEINE Personendaten lesen (Halter, Anschrift,
// Feld C). Was trotzdem zurückkäme, wird hier verworfen — nur die sechs
// Fahrzeugfelder kommen durch. Kennzeichen wird bewusst nicht gelesen.
//
// Kosten: höchstens LESEN_MAX_JE_MAPPE Versuche je Mappe (Deckel in
// lib/drossel.ts), kleines Modell (lib/kiModelle „kfz.schein.lesen"), Kosten
// im KI-Protokoll beim Betrieb (kiFetch mit Betriebs-Kennung).
//
// Reine Logik, node-testbar, keine Importe außer lib/zahlen.
// ============================================================================

import { leseZahl } from './zahlen';

/** Diese Dateiarten kann die KI lesen (HEIC nicht — dann bitte selbst eintragen). */
export const LESEN_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
/** Größer geht nicht an die KI (Base64 wächst um ein Drittel, Grenze dort 5 MB). */
export const LESEN_MAX_BYTES = 3_700_000;
/** Versuche je Mappe — muss zum Deckel 'oeffentlich/fahrzeugmappe/schein' passen. */
export const LESEN_MAX_JE_MAPPE = 3;

export const ERKANNT_HINWEIS = 'Automatisch erkannt — bitte prüfen. Übernommen wird nur, was Sie anhaken.';

export type ScheinFeld = 'marke' | 'modell' | 'fin' | 'erstzulassung' | 'leistung' | 'kraftstoff';
export const SCHEIN_FELDER: { key: ScheinFeld; titel: string; feld: string }[] = [
  { key: 'marke', titel: 'Marke', feld: 'D.1' },
  { key: 'modell', titel: 'Modell', feld: 'D.3' },
  { key: 'fin', titel: 'FIN', feld: 'E' },
  { key: 'erstzulassung', titel: 'Erstzulassung', feld: 'B' },
  { key: 'leistung', titel: 'Leistung in kW', feld: 'P.2' },
  { key: 'kraftstoff', titel: 'Kraftstoff', feld: 'P.3' },
];

export type Erkannt = Partial<Record<ScheinFeld, string>>;

/** Darf diese Datei an die KI? */
export function lesbar(mime: unknown, bytes: unknown): { ok: true } | { ok: false; fehler: string } {
  const m = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
  if (!LESEN_MIME.includes(m)) return { ok: false, fehler: 'Dieses Format kann nicht automatisch gelesen werden. Bitte tragen Sie die Angaben selbst ein.' };
  const n = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : NaN;
  if (!(n > 0)) return { ok: false, fehler: 'Die Datei ist leer.' };
  if (n > LESEN_MAX_BYTES) return { ok: false, fehler: 'Das Foto ist zu groß zum automatischen Lesen. Bitte tragen Sie die Angaben selbst ein.' };
  return { ok: true };
}

/** Anweisung an die KI — lesen, nichts erfinden, keine Personendaten. */
export const SCHEIN_SYSTEM =
  'Du liest eine deutsche Zulassungsbescheinigung Teil I (Fahrzeugschein) aus. Lies NUR diese Felder und nur, was klar lesbar ist — '
  + 'erfinde, ergänze oder rate nichts: '
  + 'D.1 Marke, D.3 Handelsbezeichnung (Modell), E Fahrzeug-Identifizierungsnummer (17 Zeichen), B Datum der Erstzulassung (TT.MM.JJJJ), '
  + 'P.2 Nennleistung in kW (nur die Zahl vor dem Schrägstrich), P.3 Kraftstoff bzw. Energiequelle. '
  + 'Lies KEINE Personendaten: keinen Namen, keine Anschrift (Feld C), kein Kennzeichen, keine Nummern von Dokumenten. '
  + 'Ist ein Feld nicht sicher lesbar oder ist das kein Fahrzeugschein, gib "" zurück. '
  + 'Antworte AUSSCHLIESSLICH mit gültigem JSON ohne Markdown im Format '
  + '{"marke":"","modell":"","fin":"","erstzulassung":"","leistung_kw":"","kraftstoff":""}.';

export const SCHEIN_FRAGE = 'Lies diesen Fahrzeugschein aus und gib die Felder als JSON zurück.';

/** JSON aus der KI-Antwort holen (auch mit ```-Zaun oder Vor-/Nachtext). */
export function jsonAusText(text: unknown): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/```json/gi, '').replace(/```/g, '');
  const a = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (a < 0 || e <= a) return null;
  try {
    const j = JSON.parse(t.slice(a, e + 1));
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch { return null; }
}

function text(v: unknown, max: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** FIN säubern: Leerzeichen/Striche weg, groß; nur gültige 17 Zeichen ohne I, O, Q. */
export function finSauber(v: unknown): string {
  const f = text(v, 40).replace(/[\s-]/g, '').toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(f) ? f : '';
}

/** Erstzulassung TT.MM.JJJJ, MM/JJJJ oder JJJJ-MM(-TT) -> „MM/JJJJ" (wie das Formular). Zukunft/Unsinn -> ''. */
export function ezSauber(v: unknown, jahr: number): string {
  const t = text(v, 20);
  let mm = NaN, jj = NaN;
  const a = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const b = t.match(/^(\d{1,2})[./](\d{4})$/);
  const c = t.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (a) { mm = Number(a[2]); jj = Number(a[3]); if (!(Number(a[1]) >= 1 && Number(a[1]) <= 31)) return ''; }
  else if (b) { mm = Number(b[1]); jj = Number(b[2]); }
  else if (c) { mm = Number(c[2]); jj = Number(c[1]); }
  if (!(mm >= 1 && mm <= 12 && jj >= 1900 && jj <= jahr)) return '';
  return `${String(mm).padStart(2, '0')}/${jj}`;
}

/** Leistung in kW: „110/5500" -> „110"; 1 bis 2.000 kW, ganze Zahl. */
export function kwSauber(v: unknown): string {
  const t = text(v, 20).split('/')[0].replace(/kw/i, '').trim();
  if (!t) return '';
  const n = leseZahl(t);
  if (n === null || !Number.isFinite(n)) return '';
  const g = Math.round(n);
  return g >= 1 && g <= 2000 ? String(g) : '';
}

/** Kraftstoff aus P.3 in Alltagssprache; Unbekanntes bleibt (gekürzt) stehen. */
export function kraftstoffSauber(v: unknown): string {
  const t = text(v, 40);
  if (!t) return '';
  const k = t.toLowerCase();
  const elektro = /elektr|strom|\be\b/.test(k);
  if (/hybr|\/\s*e\b|benzin\s*\/\s*elektr|diesel\s*\/\s*elektr/.test(k) || ((/benzin|diesel/.test(k)) && elektro)) {
    return /diesel/.test(k) ? 'Hybrid (Diesel/Elektro)' : 'Hybrid (Benzin/Elektro)';
  }
  if (/diesel/.test(k)) return 'Diesel';
  if (/benzin|super|otto/.test(k)) return 'Benzin';
  if (elektro) return 'Elektro';
  if (/lpg|autogas|flüssiggas|fluessiggas/.test(k)) return 'Autogas (LPG)';
  if (/cng|erdgas/.test(k)) return 'Erdgas (CNG)';
  if (/wasserstoff|h2/.test(k)) return 'Wasserstoff';
  return t;
}

/** KI-Antwort -> nur die sechs geprüften Fahrzeugfelder. Alles andere (z. B. Namen) fällt weg. */
export function erkanntSauber(roh: unknown, jahr: number): Erkannt {
  const b = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const aus: Erkannt = {};
  const marke = text(b.marke, 60);
  const modell = text(b.modell, 80);
  const fin = finSauber(b.fin);
  const ez = ezSauber(b.erstzulassung, jahr);
  const kw = kwSauber(b.leistung_kw ?? b.leistung);
  const kraft = kraftstoffSauber(b.kraftstoff);
  if (marke) aus.marke = marke;
  if (modell) aus.modell = modell;
  if (fin) aus.fin = fin;
  if (ez) aus.erstzulassung = ez;
  if (kw) aus.leistung = kw;
  if (kraft) aus.kraftstoff = kraft;
  return aus;
}

export type VorschlagZeile = { key: ScheinFeld; titel: string; feld: string; wert: string; aktuell: string; gleich: boolean; vorgewaehlt: boolean };

/**
 * Vorschläge zum Anhaken: leere Felder sind vorgewählt, schon Eingetragenes
 * nie — der Verkäufer entscheidet, ob er seinen Eintrag überschreibt.
 */
export function vorschlaege(erkannt: Erkannt, angaben: Record<string, unknown>): VorschlagZeile[] {
  return SCHEIN_FELDER.filter((f) => erkannt[f.key]).map((f) => {
    const wert = erkannt[f.key] as string;
    const aktuell = typeof angaben[f.key] === 'string' ? (angaben[f.key] as string).trim() : '';
    const gleich = aktuell !== '' && aktuell.toLowerCase().replace(/\s/g, '') === wert.toLowerCase().replace(/\s/g, '');
    return { key: f.key, titel: f.titel, feld: f.feld, wert, aktuell, gleich, vorgewaehlt: !aktuell };
  });
}

/** Angehakte Werte in die Angaben übernehmen; merkt sich, dass der Schein gelesen wurde. */
export function uebernehmen(angaben: Record<string, string | boolean>, erkannt: Erkannt, keys: string[]): Record<string, string | boolean> {
  const neu = { ...angaben };
  let n = 0;
  for (const f of SCHEIN_FELDER) {
    if (keys.includes(f.key) && erkannt[f.key]) { neu[f.key] = erkannt[f.key] as string; n++; }
  }
  if (n) neu.schein_gelesen = true;
  return neu;
}

/** Zeile für die Notiz am Ankauf, damit der Händler weiß, woher die Fahrzeugdaten kommen. */
export const NOTIZ_SCHEIN_GELESEN = 'Fahrzeugdaten teilweise automatisch aus dem Fahrzeugschein erkannt und vom Verkäufer bestätigt — bitte mit dem Original vergleichen.';
