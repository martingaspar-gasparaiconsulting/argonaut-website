// ============================================================================
// ARGONAUT OS · lib/partnerAnbindung.ts — Paket 274 (08.10.2026)
//
// Partner-Andockstelle: externe Dienste, die ARGONAUT NICHT nachbaut, sondern
// vermittelt. Martins Linie (08.10.2026): ARGONAUT ist nur Softwareanbieter.
// Je Partner gibt es immer zwei Wege:
//   ① Der Betrieb hat schon ein Konto -> in der Schnittstellen-Zentrale verbinden.
//   ② Noch kein Konto -> „Hier abschließen" über den ARGONAUT-Partnerlink;
//      der Vertrag entsteht direkt zwischen Betrieb und Partner.
// ARGONAUT verkauft keine Partner-Leistungen weiter (keine Rechnung, keine
// Haftung für deren Inhalte); ein Partnerlink wird offen als solcher benannt.
//
// Erster Partner: carVertical (Fahrzeughistorie). Der Bericht hängt am Fahrzeug
// (kfz_bestand.historie_*); in der Börse erscheint „Fahrzeughistorie geprüft"
// nur, wenn der Betrieb das je Fahrzeug freigibt.
// Keine Imports, keine Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

export type Partner = {
  key: string;
  name: string;
  /** Wofür (ein Satz, Sie-Form). */
  wofuer: string;
  /** „Noch kein Konto?" -> Abschluss beim Partner (Partnerlink, sobald vereinbart). */
  abschlussUrl: string;
  /** Ist abschlussUrl bereits ein vereinbarter Partnerlink (Kennzeichnung)? */
  partnerlink: boolean;
  /** Einzelbericht ohne Konto kaufen (für den Betrieb). */
  einzelUrl?: string;
};

const ENV_CARVERTICAL = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_PARTNERLINK_CARVERTICAL) || '';
// Paket 283: Fahrzeugbewertung (DAT, Schwacke) — Partnerlink nur, wenn vereinbart und gesetzt
const ENV_DAT = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_PARTNERLINK_DAT) || '';
const ENV_SCHWACKE = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_PARTNERLINK_SCHWACKE) || '';

export const PARTNER: Partner[] = [
  {
    key: 'carvertical',
    name: 'carVertical',
    wofuer: 'Fahrzeughistorie zur FIN: Schäden, Kilometerstand-Verlauf, Diebstahl-Abfrage — als Bericht für Sie und Ihre Käufer.',
    abschlussUrl: /^https:\/\//.test(ENV_CARVERTICAL) ? ENV_CARVERTICAL : 'https://www.carvertical.com/de/business',
    partnerlink: /^https:\/\//.test(ENV_CARVERTICAL),
    einzelUrl: 'https://www.carvertical.com/de',
  },
  // Paket 283 (K16): Fahrzeugbewertung und FIN-Abfrage im eigenen Konto des Händlers
  {
    key: 'dat',
    name: 'DAT',
    wofuer: 'FIN-Abfrage (Ausstattung ab Werk) und Fahrzeugbewertung mit Händler-Einkaufs- und -Verkaufswert in Ihrem DAT-Konto (SilverDAT).',
    abschlussUrl: /^https:\/\//.test(ENV_DAT) ? ENV_DAT : 'https://www.dat.de',
    partnerlink: /^https:\/\//.test(ENV_DAT),
  },
  {
    key: 'schwacke',
    name: 'Schwacke',
    wofuer: 'FIN-Abfrage und Fahrzeugbewertung mit Händler-Einkaufs- und -Verkaufswert in Ihrem Schwacke-Konto.',
    abschlussUrl: /^https:\/\//.test(ENV_SCHWACKE) ? ENV_SCHWACKE : 'https://www.schwacke.de',
    partnerlink: /^https:\/\//.test(ENV_SCHWACKE),
  },
];

export function partner(key: string | null | undefined): Partner | undefined {
  return PARTNER.find((p) => p.key === key);
}

// --- Fahrzeughistorie am Fahrzeug ----------------------------------------------------

export const HISTORIE_ANBIETER: { key: string; label: string }[] = [
  { key: 'carvertical', label: 'carVertical' },
  { key: 'sonstige', label: 'Anderer Anbieter' },
];

export type Historie = { historie_url: string | null; historie_anbieter: string | null; historie_am: string | null; historie_oeffentlich: boolean };

/** Bericht-Link nur als https, ohne Leerzeichen und Anführungszeichen, höchstens 500 Zeichen. */
export function berichtUrlGueltig(u: unknown): u is string {
  return typeof u === 'string' && u.length <= 500 && /^https:\/\/[^\s"'<>]+\.[^\s"'<>]+$/.test(u);
}

/**
 * Eingabe aus der Akte prüfen -> Felder für kfz_bestand.
 * Leerer Link = Bericht entfernen (dann auch nicht öffentlich).
 */
export function historieEingabe(roh: { url?: unknown; anbieter?: unknown; am?: unknown; oeffentlich?: unknown }, heuteIso: string):
  { ok: true; felder: Historie } | { ok: false; fehler: string } {
  const url = typeof roh.url === 'string' ? roh.url.trim() : '';
  if (!url) return { ok: true, felder: { historie_url: null, historie_anbieter: null, historie_am: null, historie_oeffentlich: false } };
  if (!berichtUrlGueltig(url)) return { ok: false, fehler: 'Bitte den vollständigen Link zum Bericht einfügen (beginnt mit https://).' };
  const anbieter = HISTORIE_ANBIETER.some((a) => a.key === roh.anbieter) ? (roh.anbieter as string) : 'sonstige';
  const am = typeof roh.am === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(roh.am) ? roh.am : heuteIso.slice(0, 10);
  if (am > heuteIso.slice(0, 10)) return { ok: false, fehler: 'Das Datum des Berichts liegt in der Zukunft.' };
  return { ok: true, felder: { historie_url: url, historie_anbieter: anbieter, historie_am: am, historie_oeffentlich: roh.oeffentlich === true } };
}

export type HistorieOeffentlich = { url: string; anbieter: string; am: string | null };

/** Was die Börse zeigen darf: nur mit Freigabe des Betriebs und gültigem Link. */
export function historieFuerBoerse(r: Record<string, unknown>): HistorieOeffentlich | null {
  if (r.historie_oeffentlich !== true || !berichtUrlGueltig(r.historie_url)) return null;
  const a = HISTORIE_ANBIETER.find((x) => x.key === r.historie_anbieter);
  const am = typeof r.historie_am === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.historie_am) ? r.historie_am.slice(0, 10) : null;
  return { url: r.historie_url, anbieter: a && a.key !== 'sonstige' ? a.label : 'unabhängiger Anbieter', am };
}

/** „Fahrzeughistorie geprüft · carVertical · 10/2026" */
export function historieText(h: HistorieOeffentlich): string {
  return `Fahrzeughistorie geprüft · ${h.anbieter}${h.am ? ` · ${h.am.slice(5, 7)}/${h.am.slice(0, 4)}` : ''}`;
}
