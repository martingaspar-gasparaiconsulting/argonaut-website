// ============================================================================
// ARGONAUT OS · lib/einzelstueck.ts — Paket 332 (12.10.2026) · BV2b Teil 1
//
// Handel mit Einzelstücken: Das Kfz-Gerüst (Bestand, Akte, Ankauf, Kalkulation,
// § 25a, Börse, Anfragen, Preis-Cockpit, Marktvergleich) gilt künftig auch für
// Boote, Maschinen, Uhren und Schmuck, Kunst und Antiquitäten, Fahrräder und
// Second Hand. KEINE neue Tabelle („vierte Insel"), sondern kfz_bestand mit
//   art              — welche Sorte Einzelstück (kfz, boot, maschine …)
//   merkmale (jsonb) — die Merkmale der Art (Länge, Tiefgang, Gangwerk …)
//   betriebsstunden  — Zähler für Maschinen und Boote (filter- und sortierbar)
//   seriennr         — Kennung, wo es keine 17-stellige FIN gibt
//
// Diese Datei beschreibt je Art: Begriffe (Wort für ein Stück, Kennung, Zähler,
// Hersteller/Modell/Datum-Wörter), welche Kfz-Teile sichtbar sind, den
// Merkmal-Satz und die Geldwäsche-Schwelle. Merkmale werden NUR über die
// Definition gespeichert — unbekannte Schlüssel fallen weg, nichts Freies.
//
// GwG-Schwellen (vor dem Einschalten Anwalt, Kontrollgang):
//   Güterhändler allgemein: Bargeld ab 10.000 € (§ 4 Abs. 5 Nr. 1 a GwG)
//   Edelmetalle (Gold, Silber, Platin): Bargeld ab 2.000 € (§ 4 Abs. 5 Nr. 1 b)
//   Kunst (Kunstvermittler/-lagerhalter): ab 10.000 € unabhängig von der Zahlart
//
// Reine Logik (nur lib/zahlen), keine React-Imports, keine Systemuhr. Node-testbar.
// ============================================================================

import { leseZahl } from './zahlen';

export const ARTEN = ['kfz', 'boot', 'maschine', 'uhr_schmuck', 'kunst_antik', 'fahrrad', 'sonstig'] as const;
export type Art = typeof ARTEN[number];

export type MerkmalTyp = 'text' | 'zahl' | 'auswahl' | 'ja_nein';
export type MerkmalDef = {
  key: string;
  label: string;
  typ: MerkmalTyp;
  optionen?: string[];   // nur bei auswahl
  einheit?: string;      // Anzeige hinter Zahlen („m", „PS")
  min?: number;
  max?: number;
  oeffentlich?: boolean; // darf in Börse/Inserat erscheinen (Positivliste)
};

export type Begriffe = {
  einheit: string;          // „Boot"
  einheitPlural: string;    // „Boote"
  titel: string;            // „Bootsbestand"
  ident: string;            // „FIN" / „Rumpfnummer (HIN)" / „Seriennummer"
  zaehler: 'km' | 'betriebsstunden' | null;
  herstellerWort: string;   // „Marke" / „Hersteller" / „Künstler / Hersteller"
  modellWort: string;       // „Modell" / „Titel / Objekt"
  datumWort: string;        // „Erstzulassung" / „Baujahr" / „Entstehung"
};

export type ArtDef = {
  art: Art;
  label: string;
  begriffe: Begriffe;
  /** Teile des Kfz-Gerüsts, die nur für Straßenfahrzeuge Sinn ergeben. */
  kfzTeile: { probefahrt: boolean; briefTresor: boolean; zulassung: boolean; co2: boolean; fin: boolean };
  merkmale: MerkmalDef[];
  /** Geldwäsche: ab welchem Betrag Identifizierung, und ob nur bei Bargeld. */
  gwg: { ab: number; nurBar: boolean; hinweis: string };
};

const GWG_ALLGEMEIN = { ab: 10000, nurBar: true, hinweis: 'Güterhändler: Identifizierung bei Bargeld ab 10.000 € (§ 4 Abs. 5 GwG).' };

const DEFS: Record<Art, ArtDef> = {
  kfz: {
    art: 'kfz', label: 'Fahrzeug',
    begriffe: { einheit: 'Fahrzeug', einheitPlural: 'Fahrzeuge', titel: 'Fahrzeugbestand', ident: 'FIN', zaehler: 'km', herstellerWort: 'Marke', modellWort: 'Modell', datumWort: 'Erstzulassung' },
    kfzTeile: { probefahrt: true, briefTresor: true, zulassung: true, co2: true, fin: true },
    merkmale: [],
    gwg: GWG_ALLGEMEIN,
  },
  boot: {
    art: 'boot', label: 'Boot',
    begriffe: { einheit: 'Boot', einheitPlural: 'Boote', titel: 'Bootsbestand', ident: 'Rumpfnummer (HIN/CIN)', zaehler: 'betriebsstunden', herstellerWort: 'Werft / Hersteller', modellWort: 'Modell', datumWort: 'Baujahr' },
    kfzTeile: { probefahrt: true, briefTresor: false, zulassung: false, co2: false, fin: false },
    merkmale: [
      { key: 'laenge_m', label: 'Länge', typ: 'zahl', einheit: 'm', min: 1, max: 100, oeffentlich: true },
      { key: 'breite_m', label: 'Breite', typ: 'zahl', einheit: 'm', min: 0.5, max: 30, oeffentlich: true },
      { key: 'tiefgang_m', label: 'Tiefgang', typ: 'zahl', einheit: 'm', min: 0, max: 10, oeffentlich: true },
      { key: 'rumpf', label: 'Rumpf', typ: 'auswahl', optionen: ['GFK', 'Holz', 'Stahl', 'Aluminium', 'Schlauch (PVC/Hypalon)'], oeffentlich: true },
      { key: 'antrieb', label: 'Antrieb', typ: 'auswahl', optionen: ['Außenborder', 'Innenborder', 'Z-Antrieb', 'Jet', 'Segel', 'Elektro', 'ohne'], oeffentlich: true },
      { key: 'motor', label: 'Motor', typ: 'text', max: 80, oeffentlich: true },
      { key: 'kojen', label: 'Kojen', typ: 'zahl', min: 0, max: 40, oeffentlich: true },
      { key: 'ce_kategorie', label: 'CE-Kategorie', typ: 'auswahl', optionen: ['A', 'B', 'C', 'D'], oeffentlich: true },
      { key: 'trailer', label: 'Mit Trailer', typ: 'ja_nein', oeffentlich: true },
      { key: 'liegeplatz', label: 'Liegeplatz', typ: 'text', max: 80 },
    ],
    gwg: GWG_ALLGEMEIN,
  },
  maschine: {
    art: 'maschine', label: 'Maschine',
    begriffe: { einheit: 'Maschine', einheitPlural: 'Maschinen', titel: 'Maschinenbestand', ident: 'Seriennummer', zaehler: 'betriebsstunden', herstellerWort: 'Hersteller', modellWort: 'Typ / Modell', datumWort: 'Baujahr' },
    kfzTeile: { probefahrt: true, briefTresor: true, zulassung: true, co2: false, fin: false },
    merkmale: [
      { key: 'maschinenart', label: 'Maschinenart', typ: 'auswahl', optionen: ['Traktor', 'Mähdrescher', 'Bodenbearbeitung', 'Bagger', 'Radlader', 'Teleskoplader', 'Gabelstapler', 'Arbeitsbühne', 'Kran', 'Sonstige'], oeffentlich: true },
      { key: 'leistung_ps', label: 'Leistung', typ: 'zahl', einheit: 'PS', min: 0, max: 2000, oeffentlich: true },
      { key: 'gewicht_kg', label: 'Eigengewicht', typ: 'zahl', einheit: 'kg', min: 0, max: 500000, oeffentlich: true },
      { key: 'tragkraft_kg', label: 'Tragkraft / Hubkraft', typ: 'zahl', einheit: 'kg', min: 0, max: 200000, oeffentlich: true },
      { key: 'hubhoehe_mm', label: 'Hubhöhe', typ: 'zahl', einheit: 'mm', min: 0, max: 50000, oeffentlich: true },
      { key: 'antrieb', label: 'Antrieb', typ: 'auswahl', optionen: ['Diesel', 'Elektro', 'Treibgas', 'Benzin', 'Hybrid'], oeffentlich: true },
      { key: 'reifen', label: 'Bereifung / Fahrwerk', typ: 'text', max: 80, oeffentlich: true },
      { key: 'uvv_bis', label: 'UVV-Prüfung bis (MM/JJJJ)', typ: 'text', max: 7, oeffentlich: true },
      { key: 'ce', label: 'CE-Kennzeichnung vorhanden', typ: 'ja_nein', oeffentlich: true },
    ],
    gwg: GWG_ALLGEMEIN,
  },
  uhr_schmuck: {
    art: 'uhr_schmuck', label: 'Uhr / Schmuck',
    begriffe: { einheit: 'Stück', einheitPlural: 'Stücke', titel: 'Uhren und Schmuck', ident: 'Seriennummer / Referenz', zaehler: null, herstellerWort: 'Hersteller / Marke', modellWort: 'Modell / Referenz', datumWort: 'Herstellungsjahr' },
    kfzTeile: { probefahrt: false, briefTresor: false, zulassung: false, co2: false, fin: false },
    merkmale: [
      { key: 'gattung', label: 'Gattung', typ: 'auswahl', optionen: ['Armbanduhr', 'Taschenuhr', 'Ring', 'Kette / Collier', 'Armband', 'Ohrschmuck', 'Brosche', 'Barren / Münze', 'Sonstiges'], oeffentlich: true },
      { key: 'material', label: 'Material', typ: 'text', max: 80, oeffentlich: true },
      { key: 'feingehalt', label: 'Feingehalt (z. B. 750)', typ: 'zahl', min: 0, max: 1000, oeffentlich: true },
      { key: 'gewicht_g', label: 'Gewicht', typ: 'zahl', einheit: 'g', min: 0, max: 100000, oeffentlich: true },
      { key: 'kaliber', label: 'Kaliber / Werk', typ: 'text', max: 60, oeffentlich: true },
      { key: 'gehaeuse_mm', label: 'Gehäusedurchmesser', typ: 'zahl', einheit: 'mm', min: 0, max: 100, oeffentlich: true },
      { key: 'box_papiere', label: 'Box und Papiere', typ: 'auswahl', optionen: ['Box und Papiere', 'nur Papiere', 'nur Box', 'ohne'], oeffentlich: true },
      { key: 'edelmetall', label: 'Edelmetall als Anlage (Barren, Münzen, Altgold)', typ: 'ja_nein' },
      { key: 'zertifikat', label: 'Zertifikat / Gutachten', typ: 'text', max: 120, oeffentlich: true },
    ],
    gwg: { ab: 10000, nurBar: true, hinweis: 'Güterhändler: Bargeld ab 10.000 €; bei Edelmetall (Barren, Münzen, Altgold) schon ab 2.000 € (§ 4 Abs. 5 GwG).' },
  },
  kunst_antik: {
    art: 'kunst_antik', label: 'Kunst / Antiquität',
    begriffe: { einheit: 'Objekt', einheitPlural: 'Objekte', titel: 'Kunst und Antiquitäten', ident: 'Inventar-/Werknummer', zaehler: null, herstellerWort: 'Künstler / Manufaktur', modellWort: 'Titel / Objekt', datumWort: 'Entstehung' },
    kfzTeile: { probefahrt: false, briefTresor: false, zulassung: false, co2: false, fin: false },
    merkmale: [
      { key: 'gattung', label: 'Gattung', typ: 'auswahl', optionen: ['Gemälde', 'Grafik', 'Skulptur', 'Fotografie', 'Möbel', 'Porzellan / Keramik', 'Silber', 'Glas', 'Teppich', 'Sonstiges'], oeffentlich: true },
      { key: 'technik', label: 'Technik / Material', typ: 'text', max: 120, oeffentlich: true },
      { key: 'masse', label: 'Maße (H × B × T)', typ: 'text', max: 60, oeffentlich: true },
      { key: 'epoche', label: 'Epoche / Datierung', typ: 'text', max: 60, oeffentlich: true },
      { key: 'signiert', label: 'Signiert', typ: 'ja_nein', oeffentlich: true },
      { key: 'zustand', label: 'Zustand', typ: 'text', max: 120, oeffentlich: true },
      { key: 'provenienz', label: 'Provenienz (intern)', typ: 'text', max: 500 },
      { key: 'kulturgut_pruefung', label: 'Kulturgutschutz geprüft (KGSG)', typ: 'ja_nein' },
    ],
    gwg: { ab: 10000, nurBar: false, hinweis: 'Kunsthandel: Identifizierung ab 10.000 € unabhängig von der Zahlungsart (§ 4 Abs. 5 GwG).' },
  },
  fahrrad: {
    art: 'fahrrad', label: 'Fahrrad',
    begriffe: { einheit: 'Rad', einheitPlural: 'Räder', titel: 'Radbestand', ident: 'Rahmennummer', zaehler: 'km', herstellerWort: 'Hersteller', modellWort: 'Modell', datumWort: 'Modelljahr' },
    kfzTeile: { probefahrt: true, briefTresor: false, zulassung: false, co2: false, fin: false },
    merkmale: [
      { key: 'radtyp', label: 'Typ', typ: 'auswahl', optionen: ['City / Trekking', 'Mountainbike', 'Rennrad / Gravel', 'Lastenrad', 'Kinderrad', 'S-Pedelec', 'Sonstiges'], oeffentlich: true },
      { key: 'e_bike', label: 'E-Bike / Pedelec', typ: 'ja_nein', oeffentlich: true },
      { key: 'akku_wh', label: 'Akku', typ: 'zahl', einheit: 'Wh', min: 0, max: 3000, oeffentlich: true },
      { key: 'akku_zyklen', label: 'Ladezyklen', typ: 'zahl', min: 0, max: 5000, oeffentlich: true },
      { key: 'rahmengroesse', label: 'Rahmengröße', typ: 'text', max: 20, oeffentlich: true },
      { key: 'laufrad_zoll', label: 'Laufradgröße', typ: 'zahl', einheit: 'Zoll', min: 10, max: 32, oeffentlich: true },
      { key: 'schaltung', label: 'Schaltung', typ: 'text', max: 60, oeffentlich: true },
    ],
    gwg: GWG_ALLGEMEIN,
  },
  sonstig: {
    art: 'sonstig', label: 'Gebrauchtware',
    begriffe: { einheit: 'Artikel', einheitPlural: 'Artikel', titel: 'Bestand Einzelstücke', ident: 'Seriennummer', zaehler: null, herstellerWort: 'Hersteller / Marke', modellWort: 'Bezeichnung', datumWort: 'Herstellungsjahr' },
    kfzTeile: { probefahrt: false, briefTresor: false, zulassung: false, co2: false, fin: false },
    merkmale: [
      { key: 'kategorie', label: 'Kategorie', typ: 'text', max: 60, oeffentlich: true },
      { key: 'groesse', label: 'Größe', typ: 'text', max: 30, oeffentlich: true },
      { key: 'material', label: 'Material', typ: 'text', max: 80, oeffentlich: true },
      { key: 'zustand', label: 'Zustand', typ: 'auswahl', optionen: ['neuwertig', 'sehr gut', 'gut', 'gebraucht', 'defekt / Bastler'], oeffentlich: true },
    ],
    gwg: GWG_ALLGEMEIN,
  },
};

export function istArt(x: unknown): x is Art {
  return typeof x === 'string' && (ARTEN as readonly string[]).includes(x);
}

/** Definition einer Art; Unbekanntes und null fallen auf „kfz" (alter Bestand). */
export function artDef(art: unknown): ArtDef {
  return DEFS[istArt(art) ? art : 'kfz'];
}

// Umlautfeste Wortgrenzen: (^|[^a-zäöüß]) statt \b
const W = (s: string) => new RegExp(`(^|[^a-zäöüß])(${s})`, 'i');
const RX: [Art, RegExp][] = [
  ['boot', W('boot(e|s|shandel|sh[aä]ndler|sbau|sservice)?([^a-zäöüß]|$)|yacht|werft|marine([^a-zäöüß]|$)')],
  ['maschine', /landmaschin|baumaschin|stapler|flurf[öo]rder|landtechnik|kommunaltechnik|forsttechnik|arbeitsb[üu]hne|baumaschinenhandel/i],
  ['uhr_schmuck', /juwelier|uhrmacher|uhrenhandel|(^|[^a-zäöüß])uhren([^a-zäöüß]|$)|schmuck|goldankauf|edelmetall|goldschmied/i],
  ['kunst_antik', /antiquit|kunsthandel|kunsthändler|galerie|kunstauktion|auktionshaus|(^|[^a-zäöüß])antik([^a-zäöüß]|$)/i],
  ['fahrrad', /fahrrad|e-bike|ebike|radsport|radhandel|pedelec|lastenrad/i],
  ['sonstig', /second.?hand|gebrauchtwaren|vintage|trödel|sozialkaufhaus/i],
];

/**
 * Art aus der Branche des Betriebs. Kfz-Branchen (Autohaus, Motorrad, Wohnmobil,
 * Nutzfahrzeug) bleiben „kfz" — sie haben Straßenzulassung, FIN und km.
 * „Zweirad" bleibt Kfz (Motorradhandel), wie im Feinschliff seit P259.
 */
export function artFuerBranche(branche: string | null | undefined): Art {
  const b = String(branche ?? '').trim();
  if (!b) return 'kfz';
  if (/motorrad|roller|zweirad|caravan|wohnmobil|wohnwagen|autohaus|autohandel|kfz|automobil|nutzfahrzeug|pkw|oldtimer/i.test(b)) return 'kfz';
  for (const [art, rx] of RX) if (rx.test(b)) return art;
  return 'kfz';
}

// ---------------------------------------------------------------------------
// Merkmale prüfen und säubern
// ---------------------------------------------------------------------------

export type Merkmale = Record<string, string | number | boolean>;

/**
 * Merkmale für die Datenbank: nur Schlüssel der Art, je Typ geprüft.
 * Leere Werte fallen weg. Fehler werden gesammelt (nichts still verwerfen,
 * was der Nutzer eingetippt hat — außer unbekannte Schlüssel).
 */
export function merkmaleSauber(art: unknown, roh: Record<string, unknown> | null | undefined): { werte: Merkmale; fehler: string[] } {
  const def = artDef(art);
  const werte: Merkmale = {};
  const fehler: string[] = [];
  if (!roh || typeof roh !== 'object') return { werte, fehler };
  for (const m of def.merkmale) {
    const v = (roh as Record<string, unknown>)[m.key];
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) continue;
    if (m.typ === 'ja_nein') {
      if (typeof v === 'boolean') werte[m.key] = v;
      else if (v === 'ja' || v === 'true') werte[m.key] = true;
      else if (v === 'nein' || v === 'false') werte[m.key] = false;
      else fehler.push(`${m.label}: bitte ja oder nein.`);
      continue;
    }
    if (m.typ === 'zahl') {
      const n = typeof v === 'number' ? (Number.isFinite(v) ? v : null) : leseZahl(v);
      if (n === null) { fehler.push(`${m.label}: bitte eine Zahl eintragen.`); continue; }
      if ((m.min !== undefined && n < m.min) || (m.max !== undefined && n > m.max)) {
        fehler.push(`${m.label}: zwischen ${m.min ?? 0} und ${m.max} ${m.einheit ?? ''}`.trim() + '.');
        continue;
      }
      werte[m.key] = n;
      continue;
    }
    const t = String(v).replace(/\s+/g, ' ').trim();
    if (m.typ === 'auswahl') {
      if (!m.optionen?.includes(t)) { fehler.push(`${m.label}: bitte aus der Liste wählen.`); continue; }
      werte[m.key] = t;
      continue;
    }
    const max = m.max ?? 200;
    if (t.length > max) { fehler.push(`${m.label}: höchstens ${max} Zeichen.`); continue; }
    werte[m.key] = t;
  }
  return { werte, fehler };
}

/** Anzeige eines Merkmals („12,5 m", „ja"). */
export function merkmalText(m: MerkmalDef, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (m.typ === 'ja_nein') return v === true ? 'ja' : v === false ? 'nein' : '—';
  if (m.typ === 'zahl' && typeof v === 'number') return `${v.toLocaleString('de-DE')}${m.einheit ? ' ' + m.einheit : ''}`;
  return String(v);
}

/** Nur die öffentlichen Merkmale (Börse, Inserat) — Positivliste aus der Definition. */
export function oeffentlicheMerkmale(art: unknown, werte: Record<string, unknown> | null | undefined): { label: string; text: string }[] {
  const def = artDef(art);
  if (!werte || typeof werte !== 'object') return [];
  return def.merkmale
    .filter((m) => m.oeffentlich && (werte as Record<string, unknown>)[m.key] !== undefined && (werte as Record<string, unknown>)[m.key] !== null && (werte as Record<string, unknown>)[m.key] !== '')
    .map((m) => ({ label: m.label, text: merkmalText(m, (werte as Record<string, unknown>)[m.key]) }));
}

// ---------------------------------------------------------------------------
// Kennung, Zähler, Geldwäsche
// ---------------------------------------------------------------------------

/** Seriennummer o. ä.: 1–60 Zeichen, Buchstaben, Ziffern, Leerzeichen, - / . */
export function seriennrPruefen(roh: string | null | undefined): { ok: true; wert: string | null } | { ok: false; fehler: string } {
  const t = String(roh ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { ok: true, wert: null };
  if (t.length > 60) return { ok: false, fehler: 'Die Kennung ist zu lang (höchstens 60 Zeichen).' };
  if (!/^[A-Za-z0-9ÄÖÜäöüß .\/-]+$/.test(t)) return { ok: false, fehler: 'Die Kennung darf nur Buchstaben, Ziffern, Leerzeichen und - / . enthalten.' };
  return { ok: true, wert: t };
}

/** Betriebsstunden: ganze Zahl 0–200.000. */
export function betriebsstundenPruefen(n: number | null): { ok: true; wert: number | null } | { ok: false; fehler: string } {
  if (n === null) return { ok: true, wert: null };
  if (!Number.isFinite(n) || n < 0 || n > 200000) return { ok: false, fehler: 'Betriebsstunden zwischen 0 und 200.000.' };
  return { ok: true, wert: Math.round(n) };
}

export type GwgPruefung = { pflicht: boolean; grenze: number; text: string };

/**
 * Muss beim Verkauf identifiziert werden? Schwelle je Art; Edelmetall (Merkmal
 * „edelmetall") senkt die Bargeld-Schwelle auf 2.000 €, Kunst zählt jede Zahlart.
 * Betrag = Kaufpreis brutto der Transaktion; bar = Teil, der bar gezahlt wird.
 */
export function gwgPruefung(art: unknown, merkmale: Record<string, unknown> | null | undefined, betrag: number, bar: number): GwgPruefung {
  const def = artDef(art);
  const edel = def.art === 'uhr_schmuck' && !!merkmale && (merkmale as Record<string, unknown>).edelmetall === true;
  const grenze = edel ? 2000 : def.gwg.ab;
  const massgeblich = def.gwg.nurBar ? bar : betrag;
  const pflicht = Number.isFinite(massgeblich) && massgeblich >= grenze;
  const art_ = def.gwg.nurBar ? 'Barzahlung' : 'Kaufpreis';
  const text = pflicht
    ? `${art_} ab ${grenze.toLocaleString('de-DE')} € — Käufer identifizieren (GwG). ${edel ? 'Edelmetall: Grenze 2.000 € bar.' : def.gwg.hinweis}`
    : `Keine Identifizierungspflicht nach GwG (${art_} unter ${grenze.toLocaleString('de-DE')} €).`;
  return { pflicht, grenze, text };
}
