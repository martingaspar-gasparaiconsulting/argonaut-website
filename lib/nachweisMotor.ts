// ============================================================================
// ARGONAUT OS · lib/nachweisMotor.ts — EIN Motor für Nachweise und Fristen (Paket PE)
//
//   B08 Arbeitsschutz        Unterweisung (mit Unterschrift), Gefährdungsbeurteilung,
//                            Betriebsanweisungen, Ersthelfer, Feuerlöscher, DGUV V3 …
//   B09 Pflichten je Branche  wiederkehrende Pflichten + Gesetzes-Radar
//   B17 Subunternehmer        Unbedenklichkeitsbescheinigungen, Haftpflicht, A1 …
//   B19 Versicherungen        Ablauf, Kündigungsfrist, Beitrag
//   B20 Entsorgung            Entsorgungsnachweise, Gewerbeabfall-Dokumentation
//
// EINE Tabelle (nachweis), EIN Katalog, EINE Ampel. Reine Logik: KEINE
// Supabase-Aufrufe, KEINE Hooks. Node-getestet in tests/nachweisMotorP74.test.mjs.
//
// ▄▄▄ WAS DIESE DATEI GARANTIERT ▄▄▄
// · Monatsrechnung ohne Überlauf: 31.01. + 1 Monat = 28.02. (nicht 03.03.),
//   und OHNE Zeitzonen-Verschiebung (Claude-Befund 24.09.: lib/pruefungen und
//   das Compliance-Center rechnen mit new Date(...T00:00:00).toISOString() —
//   im Browser in Deutschland ergibt das den VORTAG).
// · Grün ist die gefährliche Richtung: Ein Nachweis ohne Datum ist „fehlt"
//   (rot), nicht „ok". Wie in lib/fristen.ts.
// · Versicherungen: Die Kündigungsfrist wird ab Ablauf zurückgerechnet —
//   „kündigen bis" ist das Datum, das zählt, nicht der Ablauf.
//
// ▄▄▄ KEINE RECHTSBERATUNG ▄▄▄
// Die Intervalle im Katalog sind die üblichen Richtwerte aus Gesetz,
// DGUV-Regelwerk und Technischen Regeln. Sie ersetzen nicht die eigene
// Gefährdungsbeurteilung, die Fachkraft für Arbeitssicherheit oder den
// Versicherungsmakler. Der Hinweis HINWEIS_RICHTWERTE steht auf der Seite.
// ============================================================================

export type Mappe = 'arbeitsschutz' | 'pflichten' | 'subunternehmer' | 'versicherung' | 'entsorgung';

export const MAPPEN: { key: Mappe; label: string; icon: string; beschreibung: string }[] = [
  { key: 'arbeitsschutz', label: 'Arbeitsschutz', icon: '🦺', beschreibung: 'Unterweisungen mit Unterschrift, Gefährdungsbeurteilung, Prüfungen' },
  { key: 'pflichten', label: 'Pflichten der Branche', icon: '📅', beschreibung: 'Wiederkehrende Pflichten und kommende Gesetzesänderungen' },
  { key: 'subunternehmer', label: 'Subunternehmer', icon: '🤝', beschreibung: 'Nachweise je Partner — bevor Sie haften' },
  { key: 'versicherung', label: 'Versicherungen', icon: '🛡', beschreibung: 'Ablauf, Kündigungsfrist, Beitrag' },
  { key: 'entsorgung', label: 'Entsorgung', icon: '♻️', beschreibung: 'Nachweise und Dokumentation zur Abfallentsorgung' },
];

export function istMappe(m: unknown): m is Mappe {
  return typeof m === 'string' && MAPPEN.some((x) => x.key === m);
}

export const HINWEIS_RICHTWERTE =
  'Die Intervalle sind übliche Richtwerte aus Gesetz, DGUV-Regeln und Technischen Regeln. Maßgeblich sind Ihre Gefährdungsbeurteilung ' +
  'und die Vorgaben Ihrer Berufsgenossenschaft — im Zweifel mit der Fachkraft für Arbeitssicherheit abstimmen. Keine Rechtsberatung.';

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------

export type KatalogArt = {
  key: string;
  mappe: Mappe;
  label: string;
  /** Richtwert in Monaten; null = anlassbezogen oder mit festem Ablaufdatum */
  intervall: number | null;
  /** Wie früh die Ampel gelb wird */
  vorwarnTage: number;
  grundlage: string;
  hinweis?: string;
  /** Braucht Unterschriften der Beschäftigten (Unterweisung) */
  unterschrift?: boolean;
  /** Gilt je Person/Partner/Objekt — Feld „Bezug" ausfüllen */
  jeBezug?: string;
  /** Versicherung: typische Kündigungsfrist in Monaten */
  kuendigung?: number;
  /** Nur für diese Branchen-Kategorien vorschlagen; fehlt = für alle */
  branchen?: string[];
};

const HANDWERK = 'Handwerk & Bau';
const INDUSTRIE = 'Industrie & Produktion';
const GASTRO = 'Gastronomie, Hotellerie & Tourismus';
const LEBENSMITTEL = 'Lebensmittel & Nahversorgung';
const LOGISTIK = 'Logistik & Transport';
const FAHRZEUGE = 'Fahrzeuge & Mobilität';
const IMMOBILIEN = 'Immobilien & Verwaltung';
const ENERGIE = 'Energie & Umwelt';
const GESUNDHEIT = 'Gesundheit & Wellness';
const BEAUTY = 'Sport, Beauty & Lifestyle';
const LAND = 'Landwirtschaft, Garten & Forst';
const DIENST = 'Dienstleistungen';

export const KATALOG: KatalogArt[] = [
  // --- Arbeitsschutz (B08) ----------------------------------------------------
  { key: 'unterweisung', mappe: 'arbeitsschutz', label: 'Sicherheitsunterweisung', intervall: 12, vorwarnTage: 30,
    grundlage: '§ 12 ArbSchG, § 4 DGUV Vorschrift 1', unterschrift: true,
    hinweis: 'Mindestens jährlich und vor Aufnahme der Tätigkeit. Jugendliche halbjährlich (§ 29 JArbSchG).' },
  { key: 'gefaehrdungsbeurteilung', mappe: 'arbeitsschutz', label: 'Gefährdungsbeurteilung', intervall: 12, vorwarnTage: 30,
    grundlage: '§§ 5, 6 ArbSchG', hinweis: 'Pflicht ab dem ersten Beschäftigten, zu dokumentieren. Bei Änderungen sofort anpassen; jährliche Überprüfung ist Richtwert.' },
  { key: 'betriebsanweisung', mappe: 'arbeitsschutz', label: 'Betriebsanweisung', intervall: null, vorwarnTage: 0,
    grundlage: '§ 14 GefStoffV, § 12 BetrSichV', jeBezug: 'Maschine / Gefahrstoff', hinweis: 'Je Maschine bzw. Gefahrstoff; bei Änderungen anpassen und darin unterweisen.' },
  { key: 'ersthelfer', mappe: 'arbeitsschutz', label: 'Ersthelfer-Fortbildung', intervall: 24, vorwarnTage: 60,
    grundlage: '§ 26 DGUV Vorschrift 1', jeBezug: 'Person' },
  { key: 'brandschutzhelfer', mappe: 'arbeitsschutz', label: 'Brandschutzhelfer', intervall: 36, vorwarnTage: 60,
    grundlage: 'ASR A2.2', jeBezug: 'Person', hinweis: 'In der Regel 5 % der Beschäftigten. Wiederholung alle 3 bis 5 Jahre empfohlen.' },
  { key: 'feuerloescher', mappe: 'arbeitsschutz', label: 'Prüfung Feuerlöscher', intervall: 24, vorwarnTage: 30,
    grundlage: 'ASR A2.2, DIN 14406-4' },
  { key: 'dguv_v3', mappe: 'arbeitsschutz', label: 'Prüfung ortsveränderliche Elektrogeräte (DGUV V3)', intervall: 6, vorwarnTage: 30,
    grundlage: '§ 5 DGUV Vorschrift 3, TRBS 1201', hinweis: 'Richtwert 6 Monate, auf Baustellen 3 Monate. Bei niedriger Fehlerquote in Werkstätten bis 12, im Büro bis 24 Monate — nach Gefährdungsbeurteilung festlegen.' },
  { key: 'leitern', mappe: 'arbeitsschutz', label: 'Prüfung Leitern und Tritte', intervall: 12, vorwarnTage: 30,
    grundlage: 'BetrSichV, DGUV Information 208-016', branchen: [HANDWERK, INDUSTRIE, IMMOBILIEN, ENERGIE, DIENST, LAND] },
  { key: 'hebezeuge', mappe: 'arbeitsschutz', label: 'Prüfung Krane und Hebezeuge', intervall: 12, vorwarnTage: 30,
    grundlage: 'BetrSichV, DGUV Vorschrift 52', jeBezug: 'Gerät', branchen: [HANDWERK, INDUSTRIE, LOGISTIK] },
  { key: 'arbeitsmedizin', mappe: 'arbeitsschutz', label: 'Arbeitsmedizinische Vorsorge', intervall: null, vorwarnTage: 30,
    grundlage: 'ArbMedVV', jeBezug: 'Person', hinweis: 'Fristen je nach Tätigkeit — der Betriebsarzt nennt das Datum. Keine Befunde hier eintragen, nur den Termin.' },

  // --- Pflichten je Branche (B09) -------------------------------------------------
  { key: 'infektionsschutz', mappe: 'pflichten', label: 'Belehrung Infektionsschutz', intervall: 24, vorwarnTage: 30,
    grundlage: '§ 43 IfSG', jeBezug: 'Person', branchen: [GASTRO, LEBENSMITTEL],
    hinweis: 'Erstbelehrung durch das Gesundheitsamt vor Arbeitsbeginn, danach alle 2 Jahre durch den Arbeitgeber.' },
  { key: 'hygieneschulung', mappe: 'pflichten', label: 'Lebensmittelhygiene-Schulung', intervall: 12, vorwarnTage: 30,
    grundlage: 'VO (EG) 852/2004, § 4 LMHV', branchen: [GASTRO, LEBENSMITTEL] },
  { key: 'haccp_pruefung', mappe: 'pflichten', label: 'HACCP-Konzept überprüfen', intervall: 12, vorwarnTage: 30,
    grundlage: 'Art. 5 VO (EG) 852/2004', branchen: [GASTRO, LEBENSMITTEL] },
  { key: 'uvv_fahrzeug', mappe: 'pflichten', label: 'UVV-Prüfung Fahrzeug', intervall: 12, vorwarnTage: 30,
    grundlage: '§ 57 DGUV Vorschrift 70', jeBezug: 'Fahrzeug', branchen: [HANDWERK, LOGISTIK, FAHRZEUGE, DIENST, ENERGIE, LAND] },
  { key: 'berufskraftfahrer', mappe: 'pflichten', label: 'Weiterbildung Berufskraftfahrer', intervall: 60, vorwarnTage: 90,
    grundlage: 'BKrFQG', jeBezug: 'Person', branchen: [LOGISTIK], hinweis: '35 Stunden innerhalb von 5 Jahren.' },
  { key: 'rauchmelder', mappe: 'pflichten', label: 'Wartung Rauchwarnmelder', intervall: 12, vorwarnTage: 30,
    grundlage: 'Landesbauordnung, DIN 14676', jeBezug: 'Objekt', branchen: [IMMOBILIEN] },
  { key: 'legionellen', mappe: 'pflichten', label: 'Legionellen-Untersuchung Trinkwasser', intervall: 36, vorwarnTage: 60,
    grundlage: 'TrinkwV', jeBezug: 'Objekt', branchen: [IMMOBILIEN, GASTRO, BEAUTY],
    hinweis: 'Ob und wie oft untersucht werden muss, hängt von Anlage und Nutzung ab — mit Installateur oder Labor klären. 3 Jahre sind der häufigste Richtwert.' },
  { key: 'hygieneplan', mappe: 'pflichten', label: 'Hygieneplan aktualisieren', intervall: 12, vorwarnTage: 30,
    grundlage: 'IfSG, Hygieneverordnungen der Länder', branchen: [GESUNDHEIT, BEAUTY] },

  // --- Subunternehmer (B17) ------------------------------------------------------
  { key: 'unbedenklichkeit_kk', mappe: 'subunternehmer', label: 'Unbedenklichkeitsbescheinigung Krankenkasse', intervall: 3, vorwarnTage: 14,
    grundlage: '§ 28e Abs. 3a SGB IV (Generalunternehmerhaftung)', jeBezug: 'Subunternehmer' },
  { key: 'unbedenklichkeit_bg', mappe: 'subunternehmer', label: 'Unbedenklichkeitsbescheinigung Berufsgenossenschaft', intervall: 3, vorwarnTage: 14,
    grundlage: '§ 150 Abs. 3 SGB VII', jeBezug: 'Subunternehmer' },
  { key: 'mindestlohn_erklaerung', mappe: 'subunternehmer', label: 'Mindestlohn-Erklärung', intervall: 12, vorwarnTage: 30,
    grundlage: '§ 13 MiLoG, § 14 AEntG', jeBezug: 'Subunternehmer', hinweis: 'Sie haften wie ein Bürge für den Mindestlohn der Beschäftigten Ihres Subunternehmers.' },
  { key: 'haftpflicht_sub', mappe: 'subunternehmer', label: 'Betriebshaftpflicht des Partners', intervall: null, vorwarnTage: 30,
    grundlage: 'Vertrag', jeBezug: 'Subunternehmer', hinweis: 'Ablaufdatum der Police eintragen.' },
  { key: 'gewerbe', mappe: 'subunternehmer', label: 'Gewerbeanmeldung / Handwerksrolle', intervall: null, vorwarnTage: 0,
    grundlage: '§ 14 GewO, HwO', jeBezug: 'Subunternehmer' },
  { key: 'a1', mappe: 'subunternehmer', label: 'A1-Bescheinigung (Entsendung aus dem Ausland)', intervall: null, vorwarnTage: 30,
    grundlage: 'VO (EG) 883/2004', jeBezug: 'Person', hinweis: 'Gültig-bis-Datum der Bescheinigung eintragen.' },

  // --- Versicherungen (B19) ------------------------------------------------------
  { key: 'betriebshaftpflicht', mappe: 'versicherung', label: 'Betriebshaftpflicht', intervall: null, vorwarnTage: 30, grundlage: 'Vertrag', kuendigung: 3 },
  { key: 'inhaltsversicherung', mappe: 'versicherung', label: 'Inhalts-/Geschäftsversicherung', intervall: null, vorwarnTage: 30, grundlage: 'Vertrag', kuendigung: 3 },
  { key: 'kfz', mappe: 'versicherung', label: 'Kfz-Versicherung', intervall: null, vorwarnTage: 30, grundlage: 'Vertrag', kuendigung: 1, jeBezug: 'Fahrzeug',
    hinweis: 'Meist Ablauf zum 01.01., Kündigung bis 30.11.' },
  { key: 'rechtsschutz', mappe: 'versicherung', label: 'Firmen-Rechtsschutz', intervall: null, vorwarnTage: 30, grundlage: 'Vertrag', kuendigung: 3 },
  { key: 'cyber', mappe: 'versicherung', label: 'Cyber-Versicherung', intervall: null, vorwarnTage: 30, grundlage: 'Vertrag', kuendigung: 3 },
  { key: 'gebaeude', mappe: 'versicherung', label: 'Gebäudeversicherung', intervall: null, vorwarnTage: 30, grundlage: 'Vertrag', kuendigung: 3 },
  { key: 'sonstige_versicherung', mappe: 'versicherung', label: 'Sonstige Versicherung', intervall: null, vorwarnTage: 30, grundlage: 'Vertrag', kuendigung: 3 },

  // --- Entsorgung (B20) ----------------------------------------------------------
  { key: 'entsorgungsnachweis', mappe: 'entsorgung', label: 'Entsorgungsnachweis gefährliche Abfälle', intervall: 60, vorwarnTage: 90,
    grundlage: 'NachwV', jeBezug: 'Abfallart', hinweis: 'Gilt höchstens 5 Jahre. Ob und ab welcher Menge Sie nachweispflichtig sind, klärt Ihr Entsorger.' },
  { key: 'gewabfv_doku', mappe: 'entsorgung', label: 'Dokumentation Getrenntsammlung', intervall: 12, vorwarnTage: 30,
    grundlage: '§§ 3, 8 GewAbfV', hinweis: 'Getrennte Sammlung von Gewerbe- und Bauabfällen dokumentieren (Lagepläne, Lichtbilder, Praxisbelege).' },
  { key: 'entsorgungsvertrag', mappe: 'entsorgung', label: 'Entsorgungsvertrag', intervall: null, vorwarnTage: 60, grundlage: 'Vertrag', kuendigung: 3 },
  { key: 'register', mappe: 'entsorgung', label: 'Abfallregister führen', intervall: 12, vorwarnTage: 30,
    grundlage: '§ 49 KrWG, § 24 NachwV', hinweis: 'Belege mindestens 3 Jahre aufbewahren.' },
];

const KATALOG_NACH: Record<string, KatalogArt> = Object.fromEntries(KATALOG.map((k) => [k.key, k]));

export function katalogArt(key: unknown): KatalogArt | null {
  return typeof key === 'string' ? KATALOG_NACH[key] ?? null : null;
}

export function katalogFuer(mappe: Mappe): KatalogArt[] {
  return KATALOG.filter((k) => k.mappe === mappe);
}

/**
 * Vorschläge für einen Betrieb: alles aus Arbeitsschutz und Pflichten, was
 * zur Branche passt und noch NICHT angelegt ist. Einträge ohne Branchenliste
 * gelten für alle. Einträge „je Bezug" werden trotzdem einmal vorgeschlagen.
 * Kein Betrieb mit Beschäftigten ist ohne Unterweisung und Gefährdungsbeurteilung.
 */
export function vorschlaege(kategorie: string | null | undefined, vorhandeneArten: string[]): KatalogArt[] {
  const da = new Set(vorhandeneArten ?? []);
  return KATALOG.filter((k) =>
    (k.mappe === 'arbeitsschutz' || k.mappe === 'pflichten')
    && !da.has(k.key)
    && (!k.branchen || (kategorie ? k.branchen.includes(kategorie) : false)));
}

// ---------------------------------------------------------------------------
// Datum (reine Kalendertage, keine Zeitzone)
// ---------------------------------------------------------------------------

function zwei(n: number): string { return n < 10 ? `0${n}` : String(n); }

export function istIsoDatum(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [j, m, t] = s.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

/** Datum + Monate. Monatsende wird festgehalten: 31.01. + 1 = 28.02. (Schaltjahr 29.02.). */
export function plusMonate(iso: string, monate: number): string | null {
  if (!istIsoDatum(iso)) return null;
  const [j, m, t] = iso.split('-').map(Number);
  const gesamt = (m - 1) + Math.round(Number(monate) || 0);
  const zj = j + Math.floor(gesamt / 12);
  const zm = ((gesamt % 12) + 12) % 12;
  const letzter = new Date(Date.UTC(zj, zm + 1, 0)).getUTCDate();
  return `${zj}-${zwei(zm + 1)}-${zwei(Math.min(t, letzter))}`;
}

export function tageBis(von: string, bis: string): number {
  const [a, b, c] = von.split('-').map(Number);
  const [d, e, f] = bis.split('-').map(Number);
  return Math.round((Date.UTC(d, e - 1, f) - Date.UTC(a, b - 1, c)) / 86_400_000);
}

/** Heute als YYYY-MM-DD in deutscher Zeit. */
export function heuteIso(jetzt: Date): string {
  const t = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(jetzt);
  const w = (x: string) => t.find((p) => p.type === x)?.value ?? '';
  return `${w('year')}-${w('month')}-${w('day')}`;
}

export function datumDe(iso: string | null | undefined): string {
  if (!iso || !istIsoDatum(iso)) return '—';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

// ---------------------------------------------------------------------------
// Ampel
// ---------------------------------------------------------------------------

export type NachweisZeile = {
  id?: string;
  mappe?: string | null;
  art?: string | null;
  bezeichnung?: string | null;
  bezug?: string | null;
  letzte_am?: string | null;
  intervall_monate?: number | null;
  gueltig_bis?: string | null;
  kuendigungsfrist_monate?: number | null;
};

export type Status = 'fehlt' | 'ueberfaellig' | 'bald' | 'ok' | 'anlass';

export type Bewertung = {
  status: Status;
  /** Das Datum, an dem gehandelt werden muss */
  faellig: string | null;
  /** Tage bis faellig (negativ = drüber) */
  rest: number | null;
  /** Versicherung: letzter Tag für die Kündigung */
  kuendigenBis: string | null;
  text: string;
};

/**
 * Fälligkeit und Ampel eines Nachweises.
 *   gueltig_bis gesetzt           -> dieses Datum zählt
 *   sonst letzte_am + Intervall   -> berechnet
 *   anlassbezogen (kein Intervall, kein Ablauf) und einmal erledigt -> 'anlass' (neutral)
 *   gar kein Datum                -> 'fehlt' (rot) — nie still grün
 * Versicherung: gelb/rot richtet sich nach „kündigen bis", nicht nach dem Ablauf.
 */
export function bewerte(z: NachweisZeile, heute: string): Bewertung {
  const art = katalogArt(z.art);
  const vorwarn = art?.vorwarnTage ?? 30;
  const intervall = z.intervall_monate ?? null;

  let faellig: string | null = null;
  if (z.gueltig_bis && istIsoDatum(z.gueltig_bis)) faellig = z.gueltig_bis;
  else if (z.letzte_am && istIsoDatum(z.letzte_am) && intervall && intervall > 0) faellig = plusMonate(z.letzte_am, intervall);

  if (!faellig) {
    if (z.letzte_am && istIsoDatum(z.letzte_am) && !intervall) {
      return { status: 'anlass', faellig: null, rest: null, kuendigenBis: null, text: `erledigt am ${datumDe(z.letzte_am)} · bei Änderungen erneuern` };
    }
    return { status: 'fehlt', faellig: null, rest: null, kuendigenBis: null, text: 'Kein Datum hinterlegt — Nachweis fehlt' };
  }

  let kuendigenBis: string | null = null;
  const frist = z.kuendigungsfrist_monate ?? null;
  if (frist && frist > 0 && z.gueltig_bis) kuendigenBis = plusMonate(z.gueltig_bis, -frist);

  const stichtag = kuendigenBis ?? faellig;
  const rest = tageBis(heute, stichtag);
  let status: Status = 'ok';
  if (rest < 0) status = kuendigenBis && tageBis(heute, faellig) >= 0 ? 'bald' : 'ueberfaellig';
  else if (rest <= vorwarn) status = 'bald';

  let text: string;
  if (kuendigenBis) {
    text = rest < 0
      ? `Kündigungsfrist verpasst — verlängert sich zum ${datumDe(faellig)}`
      : `kündigen bis ${datumDe(kuendigenBis)} (Ablauf ${datumDe(faellig)})`;
  } else {
    text = rest < 0 ? `seit ${-rest} Tagen überfällig (${datumDe(faellig)})` : rest === 0 ? 'heute fällig' : `fällig am ${datumDe(faellig)} · in ${rest} Tagen`;
  }
  return { status, faellig, rest, kuendigenBis, text };
}

export type Zahlen = { gesamt: number; fehlt: number; ueberfaellig: number; bald: number; ok: number };

export function zaehle(zeilen: NachweisZeile[], heute: string): Zahlen {
  const z: Zahlen = { gesamt: 0, fehlt: 0, ueberfaellig: 0, bald: 0, ok: 0 };
  for (const r of zeilen ?? []) {
    z.gesamt++;
    const s = bewerte(r, heute).status;
    if (s === 'anlass') z.ok++;
    else z[s]++;
  }
  return z;
}

/** Dringendste zuerst: fehlt, überfällig, bald, dann nach Datum. */
export function sortiere<T extends NachweisZeile>(zeilen: T[], heute: string): T[] {
  const rang: Record<Status, number> = { fehlt: 0, ueberfaellig: 1, bald: 2, ok: 3, anlass: 4 };
  return [...(zeilen ?? [])].sort((a, b) => {
    const ba = bewerte(a, heute), bb = bewerte(b, heute);
    if (rang[ba.status] !== rang[bb.status]) return rang[ba.status] - rang[bb.status];
    return (ba.rest ?? 99999) - (bb.rest ?? 99999);
  });
}

/** „Heute erledigt": neues letzte_am. Bei festem Ablauf (gueltig_bis) wird nichts verschoben. */
export function erledigtHeute(z: NachweisZeile, heute: string): { letzte_am: string } {
  void z;
  return { letzte_am: heute };
}

// ---------------------------------------------------------------------------
// Unterweisung: wer hat unterschrieben?
// ---------------------------------------------------------------------------

export type Person = { id: string; name: string };
export type Unterschrift = { mitarbeiter_id?: string | null; name: string; unterschrieben_am: string };

/**
 * Unterschriften-Stand einer Unterweisung. Gezählt wird nur, wer NACH dem
 * Unterweisungsdatum (letzte_am) unterschrieben hat — eine Unterschrift vom
 * letzten Jahr gilt für die neue Unterweisung nicht.
 */
export function unterschriftenStand(unterweisungAm: string | null | undefined, personen: Person[], unterschriften: Unterschrift[]) {
  const ab = unterweisungAm && istIsoDatum(unterweisungAm) ? unterweisungAm : null;
  const gueltig = (unterschriften ?? []).filter((u) => !ab || String(u.unterschrieben_am).slice(0, 10) >= ab);
  const ids = new Set(gueltig.map((u) => u.mitarbeiter_id).filter(Boolean));
  const namen = new Set(gueltig.map((u) => u.name.trim().toLowerCase()));
  const fehlend = (personen ?? []).filter((p) => !ids.has(p.id) && !namen.has(p.name.trim().toLowerCase()));
  return { unterschrieben: (personen ?? []).length - fehlend.length, gesamt: (personen ?? []).length, fehlend };
}

/** Eine Unterschrift als PNG-Data-URL darf nicht beliebig groß sein. */
export const MAX_UNTERSCHRIFT_ZEICHEN = 200_000;

export function unterschriftGueltig(dataUrl: unknown): boolean {
  return typeof dataUrl === 'string'
    && dataUrl.startsWith('data:image/png;base64,')
    && dataUrl.length > 200
    && dataUrl.length <= MAX_UNTERSCHRIFT_ZEICHEN;
}

// ---------------------------------------------------------------------------
// Gesetzes-Radar (B09) — gepflegte Liste, geprüft am RADAR_STAND
// ---------------------------------------------------------------------------

export const RADAR_STAND = '2026-09-24';

export type RadarEintrag = { ab: string; titel: string; wen: string; tun: string; quelle: string; branchen?: string[] };

export const RADAR: RadarEintrag[] = [
  { ab: '2027-01-01', titel: 'Mindestlohn steigt auf 14,60 € je Stunde', wen: 'Alle Betriebe mit Beschäftigten',
    tun: 'Löhne, Minijob-Stunden und Kalkulationssätze prüfen. Die Minijob-Grenze folgt dem Mindestlohn (§ 8 Abs. 1a SGB IV).',
    quelle: 'Fünfte Mindestlohnanpassungsverordnung (BMAS)' },
  { ab: '2027-01-01', titel: 'E-Rechnung: Ausstellungspflicht bei mehr als 800.000 € Vorjahresumsatz', wen: 'Betriebe mit Vorjahresumsatz über 800.000 €',
    tun: 'Rechnungen an Unternehmen nur noch als E-Rechnung (XRechnung/ZUGFeRD) — ARGONAUT erzeugt beides.',
    quelle: 'BMF, FAQ zur E-Rechnung' },
  { ab: '2028-01-01', titel: 'E-Rechnung: Ausstellungspflicht für alle', wen: 'Alle Betriebe, die an Unternehmen im Inland rechnen',
    tun: 'Papier- und PDF-Rechnungen an Unternehmen sind dann nicht mehr erlaubt (Ausnahmen: Kleinbetragsrechnungen bis 250 €).',
    quelle: 'BMF, FAQ zur E-Rechnung' },
];

export function radarKommend(heute: string, kategorie?: string | null): RadarEintrag[] {
  return RADAR
    .filter((r) => r.ab >= heute)
    .filter((r) => !r.branchen || (kategorie ? r.branchen.includes(kategorie) : true))
    .sort((a, b) => a.ab.localeCompare(b.ab));
}
