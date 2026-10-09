// ============================================================================
// ARGONAUT OS · lib/rechtsFreigaben.ts — Rechts-Freigaben-Zentrale (Paket 287, RF1)
//
// Martin 09.10.2026: „ARGONAUT stellt die Plattform; der Kunde darf eine heikle
// Funktion nutzen, wenn er die rechtlichen Voraussetzungen hinterlegt bzw.
// bestätigt hat — immer rechtssicher."
//
// Je heikler Funktion (Ortung, Leistungsauswertung je Mitarbeiter, Führer-
// scheinkontrolle, Bonitätsprüfung, Kameras, Gesprächsaufzeichnung) stehen die
// Voraussetzungen als Häkchen. Die GESCHÄFTSLEITUNG bestätigt sie; gespeichert
// werden wer, wann, welche Fassung, welche Häkchen und Angaben (Nachweis).
// Eine Freigabe gilt 12 Monate, danach ist sie neu zu bestätigen. Ändert sich
// die Fassung (z. B. nach der Prüfung durch den Anwalt), gilt die alte nicht
// mehr — die Funktion ist gesperrt, bis neu bestätigt ist.
//
// ARGONAUT OS prüft NICHT, ob die Unterlagen des Betriebs ausreichen; es hält
// nur fest, was der Betrieb bestätigt hat, und sperrt die Funktion bis dahin.
// Vorlagen (Hinweistexte, Einwilligung, Betriebsvereinbarung) folgen nach der
// Prüfung durch den Anwalt — bis dahin steht „Vorlage folgt" am Häkchen.
//
// Rein, ohne Importe, node-getestet (tests/rechtsFreigabenP287).
// ============================================================================

export const GUELTIG_MONATE = 12;
export const BALD_TAGE = 30;
export const ZWECK_MAX = 300;
export const DIENSTLEISTER_MAX = 120;

export type Betriebsrat = 'einbezogen' | 'keiner';
export type Haken = { key: string; text: string; vorlage?: string };
export type FreigabeFunktion = {
  key: string;
  titel: string;
  wofuer: string;          // was die Funktion tut (eine Zeile)
  warum: string;           // warum es eine Freigabe braucht (Klartext)
  wo: string;              // wo die Funktion im System sitzt bzw. „folgt"
  verfuegbar: boolean;     // gibt es die Funktion schon?
  fassung: string;         // ändert sich die Fassung, ist neu zu bestätigen
  haken: Haken[];
  betriebsrat: boolean;    // Auswahl „einbezogen / keiner vorhanden" Pflicht
  zweck: boolean;          // Zweck als Text Pflicht
  dienstleister: boolean;  // Name des Dienstleisters Pflicht
};

const INFO = 'Vorlage folgt nach rechtlicher Prüfung';

export const FREIGABEN: FreigabeFunktion[] = [
  {
    key: 'leistungsauswertung',
    titel: 'Auswertungen je Mitarbeiter',
    wofuer: 'Ranglisten und Kennzahlen, die einzelne Mitarbeiter vergleichen (z. B. Verkäufer-Rangliste im Chef-Blick Fahrzeughandel).',
    warum: 'Auswertungen, die Leistung oder Verhalten einzelner Mitarbeiter zeigen, berühren den Datenschutz der Mitarbeiter und — wo es einen gibt — die Mitbestimmung des Betriebsrats.',
    wo: 'Chef-Blick Fahrzeughandel → Verkäufer-Rangliste',
    verfuegbar: true,
    fassung: 'rf1-2026-10',
    haken: [
      { key: 'zweck', text: 'Der Zweck der Auswertung ist festgelegt und schriftlich festgehalten.' },
      { key: 'informiert', text: 'Die betroffenen Mitarbeiter sind über Art und Zweck der Auswertung informiert.', vorlage: INFO },
      { key: 'nur_leitung', text: 'Die Auswertung sehen nur Geschäftsleitung bzw. ausdrücklich Berechtigte.' },
    ],
    betriebsrat: true, zweck: true, dienstleister: false,
  },
  {
    key: 'ortung',
    titel: 'Ortung von Fahrzeugen',
    wofuer: 'Standort von Firmen- oder Mietfahrzeugen über einen Telematik-Partner.',
    warum: 'Ein Standort zeigt, wo sich Fahrer und Kunden aufhalten. Das braucht einen klaren Zweck, die Information der Betroffenen und einen Vertrag mit dem Anbieter.',
    wo: 'Folgt mit der Fahrzeugvermietung (Anbindung über Ihr eigenes Konto beim Telematik-Partner)',
    verfuegbar: false,
    fassung: 'rf1-2026-10',
    haken: [
      { key: 'zweck', text: 'Der Zweck ist festgelegt (z. B. Diebstahl, Rückgabe) — keine Dauerbeobachtung.' },
      { key: 'informiert', text: 'Fahrer und Mitarbeiter sind informiert.', vorlage: INFO },
      { key: 'kunden', text: 'Mieter bzw. Kunden werden vor der Nutzung informiert (z. B. im Mietvertrag).', vorlage: INFO },
      { key: 'avv', text: 'Mit dem Telematik-Anbieter besteht ein Vertrag zur Auftragsverarbeitung.' },
      { key: 'dsfa', text: 'Ob eine Datenschutz-Folgenabschätzung nötig ist, wurde geprüft.' },
    ],
    betriebsrat: true, zweck: true, dienstleister: true,
  },
  {
    key: 'fuehrerschein',
    titel: 'Führerscheinkontrolle',
    wofuer: 'Regelmäßige Prüfung der Führerscheine von Fahrern mit Prüfvermerk und Erinnerung.',
    warum: 'Dabei werden Angaben aus dem Führerschein der Mitarbeiter festgehalten. Gespeichert wird nur der Prüfvermerk, keine Kopie.',
    wo: 'Folgt mit den Fuhrpark-Pflichten',
    verfuegbar: false,
    fassung: 'rf1-2026-10',
    haken: [
      { key: 'informiert', text: 'Die Fahrer sind über die Kontrolle und ihren Ablauf informiert.', vorlage: INFO },
      { key: 'keine_kopie', text: 'Es wird nur der Prüfvermerk festgehalten, keine Kopie des Führerscheins.' },
      { key: 'intervall', text: 'Das Prüfintervall ist festgelegt.' },
    ],
    betriebsrat: false, zweck: false, dienstleister: false,
  },
  {
    key: 'bonitaet',
    titel: 'Bonitätsprüfung',
    wofuer: 'Abfrage der Zahlungsfähigkeit von Kunden bei einer Auskunftei.',
    warum: 'Eine Bonitätsabfrage braucht einen Anlass (z. B. Vorleistung oder Ratenzahlung), die Information des Kunden und einen Vertrag mit der Auskunftei.',
    wo: 'Folgt über Partner (Ihr eigenes Konto bei der Auskunftei)',
    verfuegbar: false,
    fassung: 'rf1-2026-10',
    haken: [
      { key: 'anlass', text: 'Abgefragt wird nur bei einem Anlass wie Vorleistung, Mietkaution oder Ratenzahlung.' },
      { key: 'kunden', text: 'Kunden werden vor der Abfrage informiert.', vorlage: INFO },
      { key: 'vertrag', text: 'Mit der Auskunftei besteht ein Vertrag.' },
    ],
    betriebsrat: false, zweck: true, dienstleister: true,
  },
  {
    key: 'video',
    titel: 'Kameras und Videoaufnahmen',
    wofuer: 'Aufnahmen von Kameras auf dem Betriebsgelände, z. B. am Fahrzeughof.',
    warum: 'Kameras erfassen Mitarbeiter, Kunden und Besucher. Das braucht einen Zweck, sichtbare Hinweise, eine feste Speicherdauer und — wo es einen gibt — den Betriebsrat.',
    wo: 'Folgt über Partner',
    verfuegbar: false,
    fassung: 'rf1-2026-10',
    haken: [
      { key: 'zweck', text: 'Der Zweck ist festgelegt (z. B. Schutz vor Diebstahl).' },
      { key: 'schild', text: 'Hinweisschilder hängen gut sichtbar vor dem erfassten Bereich.', vorlage: INFO },
      { key: 'speicherdauer', text: 'Die Speicherdauer ist festgelegt und so kurz wie möglich.' },
      { key: 'informiert', text: 'Die Mitarbeiter sind informiert.', vorlage: INFO },
    ],
    betriebsrat: true, zweck: true, dienstleister: false,
  },
  {
    key: 'aufzeichnung',
    titel: 'Aufzeichnung von Telefongesprächen',
    wofuer: 'Mitschnitt oder Abschrift von Gesprächen, z. B. am KI-Telefon.',
    warum: 'Wer ein Gespräch aufzeichnet, braucht vorher die Einwilligung der Gesprächspartner. Für Mitarbeiter gelten zusätzlich Datenschutz und Mitbestimmung.',
    wo: 'Folgt mit dem KI-Telefon',
    verfuegbar: false,
    fassung: 'rf1-2026-10',
    haken: [
      { key: 'einwilligung', text: 'Anrufer werden zu Beginn informiert und können die Aufzeichnung ablehnen.', vorlage: INFO },
      { key: 'informiert', text: 'Die Mitarbeiter sind informiert.', vorlage: INFO },
      { key: 'avv', text: 'Mit dem Telefon-Anbieter besteht ein Vertrag zur Auftragsverarbeitung.' },
      { key: 'loeschung', text: 'Die Löschfrist für Aufzeichnungen ist festgelegt.' },
    ],
    betriebsrat: true, zweck: false, dienstleister: true,
  },
];

export function funktion(key: unknown): FreigabeFunktion | null {
  return FREIGABEN.find((f) => f.key === key) ?? null;
}

function zeitAus(roh: unknown): number | null {
  if (roh === null || roh === undefined || roh === '') return null;
  const t = new Date(String(roh)).getTime();
  return Number.isFinite(t) ? t : null;
}

function textAus(roh: unknown, max: number): string {
  return String(roh ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Gültig bis: gleicher Kalendertag in 12 Monaten (29.02. → 28.02.), Ende des Tages ist egal — Zeitpunkt + 12 Monate. */
export function gueltigBis(jetzt: Date, monate: number = GUELTIG_MONATE): string {
  const d = new Date(jetzt.getTime());
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + monate);
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return d.toISOString();
}

export type FreigabeZeile = {
  funktion?: string | null;
  fassung?: string | null;
  bestaetigt_am?: string | null;
  bestaetigt_name?: string | null;
  gueltig_bis?: string | null;
  widerrufen_am?: string | null;
  haken?: unknown;
  betriebsrat?: string | null;
  zweck?: string | null;
  dienstleister?: string | null;
};

export type FreigabeStufe = 'offen' | 'frei' | 'abgelaufen' | 'neue_fassung' | 'widerrufen';
export type FreigabeStand = { stufe: FreigabeStufe; aktiv: boolean; gueltigBis: string | null; restTage: number; bald: boolean };

/** Stand einer Freigabe. Aktiv nur: bestätigt, nicht widerrufen, aktuelle Fassung, nicht abgelaufen. */
export function freigabeStand(f: FreigabeFunktion, z: FreigabeZeile | null | undefined, jetzt: Date): FreigabeStand {
  const leer = { aktiv: false, gueltigBis: null, restTage: 0, bald: false };
  if (!z || zeitAus(z.bestaetigt_am) === null) return { stufe: 'offen', ...leer };
  if (zeitAus(z.widerrufen_am) !== null) return { stufe: 'widerrufen', ...leer };
  const bis = zeitAus(z.gueltig_bis);
  if (bis === null) return { stufe: 'offen', ...leer };
  const gueltig = new Date(bis).toISOString();
  if (z.fassung !== f.fassung) return { stufe: 'neue_fassung', aktiv: false, gueltigBis: gueltig, restTage: 0, bald: false };
  if (jetzt.getTime() >= bis) return { stufe: 'abgelaufen', aktiv: false, gueltigBis: gueltig, restTage: 0, bald: false };
  const restTage = Math.ceil((bis - jetzt.getTime()) / 86_400_000);
  return { stufe: 'frei', aktiv: true, gueltigBis: gueltig, restTage, bald: restTage <= BALD_TAGE };
}

export type FreigabeEingabe = { haken: string[]; betriebsrat: Betriebsrat | null; zweck: string | null; dienstleister: string | null };

/**
 * Darf dieser Zugang die Funktion freigeben — und sind alle Voraussetzungen
 * bestätigt? Nur die Geschäftsleitung. Unbekannte Häkchen werden verworfen,
 * fehlende benannt.
 */
export function freigabePruefen(o: { rolle: string; funktion: unknown; haken: unknown; betriebsrat?: unknown; zweck?: unknown; dienstleister?: unknown }):
  { ja: true; f: FreigabeFunktion; eingabe: FreigabeEingabe } | { ja: false; grund: string } {
  if (o.rolle !== 'chef') return { ja: false, grund: 'Rechtliche Freigaben bestätigt nur die Geschäftsleitung.' };
  const f = funktion(o.funktion);
  if (!f) return { ja: false, grund: 'Unbekannte Funktion.' };
  const roh = Array.isArray(o.haken) ? o.haken.map((h) => String(h)) : [];
  const bekannt = new Set(f.haken.map((h) => h.key));
  const haken = [...new Set(roh.filter((h) => bekannt.has(h)))];
  const fehlt = f.haken.filter((h) => !haken.includes(h.key));
  if (fehlt.length) return { ja: false, grund: `Bitte alle Voraussetzungen bestätigen — offen: ${fehlt.map((h) => h.text).join(' · ')}` };
  let betriebsrat: Betriebsrat | null = null;
  if (f.betriebsrat) {
    if (o.betriebsrat !== 'einbezogen' && o.betriebsrat !== 'keiner') return { ja: false, grund: 'Bitte angeben: Betriebsrat einbezogen oder kein Betriebsrat vorhanden.' };
    betriebsrat = o.betriebsrat;
  }
  let zweck: string | null = null;
  if (f.zweck) {
    zweck = textAus(o.zweck, ZWECK_MAX);
    if (zweck.length < 5) return { ja: false, grund: 'Bitte den Zweck kurz beschreiben.' };
  }
  let dienstleister: string | null = null;
  if (f.dienstleister) {
    dienstleister = textAus(o.dienstleister, DIENSTLEISTER_MAX);
    if (dienstleister.length < 2) return { ja: false, grund: 'Bitte den Anbieter bzw. Vertragspartner nennen.' };
  }
  return { ja: true, f, eingabe: { haken, betriebsrat, zweck, dienstleister } };
}

export function widerrufPruefen(o: { rolle: string; funktion: unknown }): { ja: true; f: FreigabeFunktion } | { ja: false; grund: string } {
  if (o.rolle !== 'chef') return { ja: false, grund: 'Freigaben widerruft nur die Geschäftsleitung.' };
  const f = funktion(o.funktion);
  if (!f) return { ja: false, grund: 'Unbekannte Funktion.' };
  return { ja: true, f };
}

/** Text, wenn eine Funktion gesperrt ist — für Mitarbeiter und Geschäftsleitung. */
export function sperrText(f: FreigabeFunktion, s: FreigabeStand, istChef: boolean): string {
  const was = `„${f.titel}"`;
  const weg = istChef ? ' Bestätigen Sie die Voraussetzungen unter „Rechtliche Freigaben".' : ' Die Geschäftsleitung kann sie unter „Rechtliche Freigaben" bestätigen.';
  if (s.stufe === 'abgelaufen') return `${was} ist gesperrt: Die Freigabe ist nach 12 Monaten abgelaufen.${weg}`;
  if (s.stufe === 'neue_fassung') return `${was} ist gesperrt: Die Voraussetzungen wurden überarbeitet und sind neu zu bestätigen.${weg}`;
  if (s.stufe === 'widerrufen') return `${was} ist gesperrt: Die Freigabe wurde widerrufen.${weg}`;
  return `${was} ist gesperrt, bis die rechtlichen Voraussetzungen bestätigt sind.${weg}`;
}

/** Datum für Texte: 09.10.2026 (Berliner Zeit). */
export function datumDe(iso: string | null | undefined): string {
  const t = zeitAus(iso);
  if (t === null) return '';
  return new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
}

// ── Paket 288 (RF1b): Erinnerung an die Geschäftsleitung ──────────────────────

export type ErinnerungZeile = FreigabeZeile & { owner_user_id?: string | null };
export type Erinnerung = { betrieb: string; titel: string[]; fruehesteBis: string; restTage: number };

/**
 * Welche Betriebe sind zu erinnern? Je Betrieb alle aktiven Freigaben, die in
 * höchstens 30 Tagen ablaufen (aktuelle Fassung, nicht widerrufen). Eine
 * Glocke je Betrieb, mit allen Titeln und dem frühesten Ablauf.
 */
export function erinnerungen(zeilen: ErinnerungZeile[], jetzt: Date): Erinnerung[] {
  const je = new Map<string, Erinnerung>();
  for (const z of zeilen) {
    const f = funktion(z.funktion);
    const betrieb = String(z.owner_user_id ?? '');
    if (!f || !/^[0-9a-f-]{36}$/i.test(betrieb)) continue;
    const st = freigabeStand(f, z, jetzt);
    if (!st.aktiv || !st.bald || !st.gueltigBis) continue;
    const e = je.get(betrieb);
    if (!e) { je.set(betrieb, { betrieb, titel: [f.titel], fruehesteBis: st.gueltigBis, restTage: st.restTage }); continue; }
    if (!e.titel.includes(f.titel)) e.titel.push(f.titel);
    if (st.gueltigBis < e.fruehesteBis) { e.fruehesteBis = st.gueltigBis; e.restTage = st.restTage; }
  }
  return [...je.values()].sort((a, b) => a.betrieb.localeCompare(b.betrieb));
}

/** Text der Glocke. */
export function erinnerungText(e: Erinnerung): { titel: string; nachricht: string } {
  const eine = e.titel.length === 1;
  return {
    titel: eine ? 'Rechtliche Freigabe läuft bald ab' : `${e.titel.length} rechtliche Freigaben laufen bald ab`,
    nachricht: `${e.titel.join(', ')} — ${eine ? 'gültig' : 'die erste gilt'} noch bis ${datumDe(e.fruehesteBis)}. Danach ist die Funktion gesperrt, bis Sie die Voraussetzungen neu bestätigen.`,
  };
}
