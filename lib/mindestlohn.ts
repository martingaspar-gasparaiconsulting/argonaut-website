// ============================================================================
// ARGONAUT OS · lib/mindestlohn.ts — Paket 386 · MO0c (16.10.2026)
// Mindestlohn und Minijob-Grenze nach Datum, Branchen-Mindestlohn als Vorlage.
//
// Befund vorher: Der Schichtplan rechnete fest mit 13,90 € und 603 € — ab dem
// 01.01.2027 (14,60 €, 633 €) wäre die Minijob-Stundengrenze falsch gewesen.
// Und wer mehr als den Mindestlohn zahlt (z. B. Branchen-Mindestlohn
// Gebäudereinigung 15,00 €), bekam zu viele erlaubte Stunden angezeigt:
// 603 € ÷ 15,00 € = 40,2 h statt 43,4 h.
//
// Regeln:
//   · Minijob-Grenze = Mindestlohn × 130 ÷ 3, auf volle Euro aufgerundet
//     (§ 8 Abs. 1a SGB IV).
//   · Erlaubte Stunden je Monat = Grenze ÷ tatsächlicher Stundenlohn.
//   · MARTIN 16.10.2026: Nichts festschreiben. Die Tabelle ist nur eine
//     EMPFEHLUNG mit Stand-Datum (und Hinweis auf die nächste bekannte
//     Erhöhung). Der Betrieb kann den Stundenlohn je Minijobber jederzeit
//     selbst eintragen — der eingetragene Wert zählt immer; liegt er unter
//     der Empfehlung, gibt es nur einen Warnhinweis, keine Sperre.
//   · Leer = Empfehlung des Monats.
//   · Nach dem letzten bekannten Stand: Wert bleibt stehen, mit Hinweis
//     „bitte prüfen" (Wächter-Test wird rot, sobald der Stand alt ist).
//
// Rein — keine Datenbank, node-testbar (tests/mindestlohnMO0c).
// ============================================================================

export type LohnStufe = { ab: string; euro: number; quelle: string };

/** Gesetzlicher Mindestlohn (MiLoG) — aufsteigend nach Datum. */
export const GESETZLICH: LohnStufe[] = [
  { ab: '2025-01-01', euro: 12.82, quelle: 'Vierte Mindestlohnanpassungsverordnung' },
  { ab: '2026-01-01', euro: 13.90, quelle: 'Fünfte Mindestlohnanpassungsverordnung' },
  { ab: '2027-01-01', euro: 14.60, quelle: 'Fünfte Mindestlohnanpassungsverordnung' },
];

/** Bis wann die Tabelle sicher bekannt ist — danach Hinweis „bitte prüfen". */
export const BEKANNT_BIS = '2027-12-31';
/** Wann die Tabelle zuletzt gegen die Quelle geprüft wurde (steht in der Empfehlung). */
export const STAND = '2026-10-16';

function euroText(n: number): string {
  return n.toFixed(2).replace('.', ',');
}
function datumText(tag: string): string {
  const [j, m, t] = tag.split('-');
  return `${t}.${m}.${j}`;
}

/** Nächste bekannte Erhöhung nach diesem Tag (oder null). */
export function naechsteErhoehung(tag: string): LohnStufe | null {
  const t = tagAus(tag);
  if (!t) return null;
  return GESETZLICH.find((s) => s.ab > t) ?? null;
}

/** Empfehlungs-Satz für die Oberfläche, z. B. „Empfehlung (Stand 16.10.2026): 13,90 € … ab 01.01.2027: 14,60 €". */
export function empfehlungText(tag: string): string {
  const m = mindestlohnAm(tag);
  if (!m) return '';
  const n = naechsteErhoehung(tag);
  return `Empfehlung (Stand ${datumText(STAND)}): gesetzlicher Mindestlohn ${euroText(m.euro)} €`
    + (n ? ` · nächste bekannte Erhöhung ab ${datumText(n.ab)}: ${euroText(n.euro)} €` : '')
    + (m.veraltet ? ' · Stand bitte prüfen' : '')
    + ' · Ihr eigener Wert geht immer vor.';
}

export type BranchenVorlage = { key: string; label: string; euro: number; ab: string; bis: string; quelle: string };

/** Allgemeinverbindliche Branchen-Mindestlöhne als Vorlage zum Übernehmen. */
export const BRANCHEN_VORLAGEN: BranchenVorlage[] = [
  { key: 'gebaeudereinigung_lg1', label: 'Gebäudereinigung · Lohngruppe 1 (Innen- und Unterhaltsreinigung)', euro: 15.0, ab: '2026-01-01', bis: '2026-12-31',
    quelle: 'Zehnte Verordnung über zwingende Arbeitsbedingungen in der Gebäudereinigung' },
  { key: 'gebaeudereinigung_lg6', label: 'Gebäudereinigung · Lohngruppe 6 (Glas- und Fassadenreinigung)', euro: 18.4, ab: '2026-01-01', bis: '2026-12-31',
    quelle: 'Zehnte Verordnung über zwingende Arbeitsbedingungen in der Gebäudereinigung' },
];

const TAG_RE = /^\d{4}-\d{2}-\d{2}$/;

function tagAus(wert: string): string | null {
  const s = String(wert || '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return TAG_RE.test(s) ? s : null;
}

/** Gesetzlicher Mindestlohn an einem Tag ('YYYY-MM-DD' oder 'YYYY-MM'). */
export function mindestlohnAm(tag: string): { euro: number; quelle: string; veraltet: boolean } | null {
  const t = tagAus(tag);
  if (!t) return null;
  let treffer: LohnStufe | null = null;
  for (const s of GESETZLICH) if (s.ab <= t) treffer = s;
  if (!treffer) treffer = GESETZLICH[0];
  return { euro: treffer.euro, quelle: treffer.quelle, veraltet: t > BEKANNT_BIS };
}

/** Minijob-Grenze in Euro je Monat (§ 8 Abs. 1a SGB IV). */
export function minijobGrenzeAm(tag: string): number | null {
  const m = mindestlohnAm(tag);
  if (!m) return null;
  // in Cent rechnen, damit 13,90 × 130 nicht an Kommastellen scheitert
  const cent = Math.round(m.euro * 100) * 130;
  return Math.ceil(cent / 3 / 100);
}

export type LohnErgebnis = { euro: number; herkunft: 'eigener' | 'gesetzlich'; hinweis: string | null };

/** Welcher Stundenlohn zählt für die Minijob-Rechnung im Monat? */
export function minijobLohn(eigener: unknown, tag: string): LohnErgebnis | null {
  const gesetz = mindestlohnAm(tag);
  if (!gesetz) return null;
  const e = typeof eigener === 'number' ? eigener : (eigener == null || eigener === '' ? NaN : Number(eigener));
  if (Number.isFinite(e) && e > 0) {
    // Der eigene Wert zaehlt IMMER (Martin 16.10.) — unter der Empfehlung nur ein Hinweis.
    if (e + 1e-9 < gesetz.euro) {
      return { euro: e, herkunft: 'eigener',
        hinweis: `Hinterlegter Stundenlohn liegt unter der Mindestlohn-Empfehlung (${euroText(gesetz.euro)} €, Stand ${datumText(STAND)}) — bitte prüfen.` };
    }
    return { euro: e, herkunft: 'eigener', hinweis: gesetz.veraltet ? 'Mindestlohn-Stand bitte prüfen.' : null };
  }
  return { euro: gesetz.euro, herkunft: 'gesetzlich', hinweis: gesetz.veraltet ? 'Mindestlohn-Stand bitte prüfen.' : null };
}

/** Erlaubte Minijob-Stunden im Monat bei diesem Stundenlohn. */
export function maxMinijobStunden(eigener: unknown, tag: string): number | null {
  const g = minijobGrenzeAm(tag);
  const l = minijobLohn(eigener, tag);
  if (g == null || !l) return null;
  return g / l.euro;
}

export type MinijobStatus = 'ok' | 'knapp' | 'ueber';

/** Ampel: über der Grenze, ab 90 % knapp. */
export function minijobStatus(stunden: number, maxStunden: number): MinijobStatus {
  if (!(maxStunden > 0)) return 'ok';
  if (stunden > maxStunden + 1e-9) return 'ueber';
  return stunden >= maxStunden * 0.9 ? 'knapp' : 'ok';
}

/** Eingabe prüfen (Euro je Stunde). null = in Ordnung. Unter der Empfehlung ist KEIN Fehler. */
export function pruefeStundenlohn(euro: number | null): string | null {
  if (euro == null) return null; // leer = Empfehlung
  if (!Number.isFinite(euro) || euro <= 0) return 'Bitte einen Stundenlohn in Euro eintragen.';
  if (euro > 500) return 'Bitte den Stundenlohn prüfen (über 500 €).';
  return null;
}

/** Warnung (kein Fehler), wenn der Wert unter der Empfehlung liegt. */
export function lohnWarnung(euro: number | null, tag: string): string | null {
  if (euro == null || !Number.isFinite(euro)) return null;
  const g = mindestlohnAm(tag);
  if (g && euro + 1e-9 < g.euro) return `Hinweis: liegt unter der Mindestlohn-Empfehlung (${euroText(g.euro)} €, Stand ${datumText(STAND)}). Gespeichert wird trotzdem Ihr Wert.`;
  return null;
}

/** Vorlagen, die an diesem Tag gelten. */
export function vorlagenAm(tag: string): BranchenVorlage[] {
  const t = tagAus(tag);
  if (!t) return [];
  return BRANCHEN_VORLAGEN.filter((v) => v.ab <= t && t <= v.bis);
}
