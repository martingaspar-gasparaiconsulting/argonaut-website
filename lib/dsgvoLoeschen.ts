// ============================================================================
// ARGONAUT OS · lib/dsgvoLoeschen.ts — die Loeschung nach Art. 17 DSGVO
//
// WARUM DIESE DATEI SO VORSICHTIG GEBAUT IST
// Das hier ist der gefaehrlichste Knopf im ganzen System. Ein Fehler loescht
// keine Zeile zu wenig, sondern zu viel — und zwar unwiederbringlich, in der
// Produktivdatenbank eines echten Betriebs. Deshalb:
//
//   1. WHITELIST STATT BLACKLIST. Beim Anonymisieren wird nur angefasst, was
//      ausdruecklich als Personenfeld erkannt ist. Alles Unbekannte bleibt.
//      Ein nicht anonymisiertes Feld ist ein Maengel; ein geleertes Geldfeld
//      ist ein Schaden.
//   2. `_id`-SPALTEN SIND TABU — ausser kontakt_id. Sonst wuerde `firma_id`
//      ueber das Muster "firma" mitgeleert und der Datensatz haette keinen
//      Betrieb mehr.
//   3. AUFBEWAHRUNGSPFLICHTIGES WIRD GEPRUEFT, NICHT GEGLAUBT. `pruefePlan()`
//      faellt um, wenn jemals eine 'behalten'-Tabelle in den Loeschplan
//      geraet — auch wenn das nur durch einen Tippfehler in der Landkarte
//      passiert.
//   4. REIHENFOLGE. Erst die Namens-Schnappschuesse, dann anonymisieren, dann
//      loeschen, und die `kontakte`-Zeile ganz zuletzt: sie loest die
//      Fremdschluessel-Kaskaden aus. Wer sie zuerst loescht, verliert den
//      Namen, den er fuer die Schnappschuesse braucht.
//
// Keine Imports ausser der Landkarte, keine Hooks — node-testbar.
// ============================================================================

import { DATEN_ORTE, orteMitArt, type DatenOrt } from './dsgvoDaten';

/** Was in Namensfelder geschrieben wird, wenn die Person entfernt wird. */
export const ANONYM_TEXT = 'Gelöscht (DSGVO)';

// ---------------------------------------------------------------------------
// Der Plan
// ---------------------------------------------------------------------------

export type LoeschSchritt = {
  tabelle: string;
  label: string;
  spalte: string;
  art: 'loeschen' | 'anonymisieren';
  begruendung: string;
};

/**
 * Der Ablauf in der Reihenfolge, in der er ausgefuehrt werden MUSS.
 * Anonymisieren zuerst, loeschen danach, `kontakte` ganz zum Schluss.
 */
export function baueLoeschPlan(): LoeschSchritt[] {
  const anon = DATEN_ORTE.filter((o) => o.art === 'anonymisieren');
  const loesch = DATEN_ORTE.filter((o) => o.art === 'loeschen' && o.tabelle !== 'kontakte');
  const kontakt = DATEN_ORTE.filter((o) => o.tabelle === 'kontakte');

  return [...anon, ...loesch, ...kontakt].map((o) => ({
    tabelle: o.tabelle,
    label: o.label,
    spalte: o.spalte,
    art: o.art === 'anonymisieren' ? 'anonymisieren' : 'loeschen',
    begruendung: o.begruendung,
  }));
}

/**
 * Das Sicherheitsnetz. Laeuft im Test UND zur Laufzeit vor jeder Loeschung.
 * Gibt eine leere Liste zurueck, wenn alles in Ordnung ist.
 */
export function pruefePlan(plan: LoeschSchritt[]): string[] {
  const fehler: string[] = [];
  const geschuetzt = new Set(orteMitArt('behalten').map((o) => o.tabelle));
  const gesehen = new Set<string>();

  for (const s of plan) {
    if (geschuetzt.has(s.tabelle)) {
      fehler.push(`${s.tabelle} ist aufbewahrungspflichtig und darf nicht im Löschplan stehen.`);
    }
    if (gesehen.has(s.tabelle)) fehler.push(`${s.tabelle} steht doppelt im Plan.`);
    gesehen.add(s.tabelle);
    if (!s.spalte.trim()) fehler.push(`${s.tabelle}: keine Bezugsspalte.`);
  }

  // `kontakte` muss der letzte Schritt sein — sonst brechen die Kaskaden alles
  // Uebrige weg, bevor wir es sauber behandelt haben.
  const idx = plan.findIndex((s) => s.tabelle === 'kontakte');
  if (idx === -1) {
    fehler.push('Die Stammdaten (kontakte) fehlen im Plan.');
  } else if (idx !== plan.length - 1) {
    fehler.push('Die Stammdaten (kontakte) müssen der letzte Schritt sein.');
  }

  // Anonymisieren immer vor Loeschen.
  const ersterLoesch = plan.findIndex((s) => s.art === 'loeschen');
  const letzterAnon = plan.map((s) => s.art).lastIndexOf('anonymisieren');
  if (ersterLoesch !== -1 && letzterAnon !== -1 && letzterAnon > ersterLoesch) {
    fehler.push('Anonymisieren muss vor dem Löschen stehen.');
  }

  return fehler;
}

// ---------------------------------------------------------------------------
// Namens-Schnappschuesse fuer aufbewahrungspflichtige Belege
// ---------------------------------------------------------------------------

export type Schnappschuss = { tabelle: string; spalte: string; feld: string; label: string };

/**
 * Tabellen, die bleiben MUESSEN, aber keinen eigenen Namen tragen. Am 16.08.26
 * gegen die echte Datenbank geprueft: rechnungen/abo_rechnungen/gutschein/
 * spende/signatur_anfragen haben ihr eigenes Namensfeld — diese zwei nicht.
 * Ohne Schnappschuss waere ein SEPA-Mandat nach der Loeschung eine IBAN ohne
 * Kontoinhaber: als Nachweis wertlos, als Personendatum trotzdem vorhanden.
 */
export const SCHNAPPSCHUESSE: Schnappschuss[] = [
  { tabelle: 'kunden_mandate', spalte: 'kontakt_id', feld: 'kontakt_name', label: 'SEPA-Mandate' },
  { tabelle: 'buchungen', spalte: 'kontakt_id', feld: 'kontakt_name', label: 'Buchungen' },
];

// ---------------------------------------------------------------------------
// Anonymisieren: welche Felder werden angefasst?
// ---------------------------------------------------------------------------

/** Segmente, die ein Namensfeld kennzeichnen — werden mit ANONYM_TEXT ueberschrieben. */
const NAME_SEGMENTE = new Set([
  'name', 'vorname', 'nachname', 'kunde', 'kundenname', 'firma', 'ansprechpartner',
  'halter', 'inhaber', 'empfaenger', 'unterzeichner', 'auftraggeber', 'mieter',
  'eigentuemer', 'besitzer', 'patient', 'mandant', 'gast',
]);

/** Segmente, die ein Kontakt-/Adressfeld kennzeichnen — werden geleert (null). */
const LEER_SEGMENTE = new Set([
  'email', 'mail', 'telefon', 'tel', 'mobil', 'handy', 'fax',
  'strasse', 'hausnummer', 'plz', 'ort', 'adresse', 'anschrift', 'land',
  'iban', 'bic', 'kontonummer', 'steuernummer', 'ustid',
  'geburtsdatum', 'geburtstag', 'notiz', 'notizen', 'bemerkung', 'kommentar',
]);

/** Ganze Spaltennamen, die zusammengeschrieben sind und daher kein Segment ergeben. */
const GANZ_NAME = new Set(['kundenname', 'firmenname', 'personenname', 'nachnamen', 'vornamen']);
const GANZ_LEER = new Set(['wohnort', 'lieferort', 'rechnungsort', 'emailadresse', 'telefonnummer', 'mobilnummer', 'strassenname', 'postleitzahl']);

/**
 * Spalten, die NIEMALS angefasst werden — egal was die Muster sagen.
 * Das ist die Bremse gegen Kollateralschaden an Geld und Struktur.
 */
const TABU = new Set([
  'id', 'owner_user_id', 'created_at', 'updated_at', 'erstellt_am', 'aktualisiert_am',
  'nummer', 'status', 'betrag', 'summe', 'netto', 'brutto', 'mwst', 'menge',
  'preis', 'einzelpreis', 'gesamt', 'waehrung', 'steuersatz',
]);

type Aenderung = Record<string, string | null>;

/**
 * Bestimmt aus den TATSAECHLICH vorhandenen Spalten einer Zeile, was geaendert
 * wird. Es wird nichts geraten: die Spaltenliste kommt aus der gelesenen Zeile.
 */
export function anonymAenderung(spalten: string[]): Aenderung {
  const aenderung: Aenderung = {};

  for (const roh of spalten) {
    const spalte = String(roh);
    const klein = spalte.toLowerCase();

    // kontakt_id ist der eine Fremdschluessel, den wir bewusst loesen.
    if (klein === 'kontakt_id') { aenderung[spalte] = null; continue; }

    if (TABU.has(klein)) continue;
    // Alle uebrigen Verweis-Spalten bleiben unberuehrt: firma_id, standort_id,
    // auftrag_id, ... Ohne diese Regel wuerde "firma_id" ueber das Segment
    // "firma" als Namensfeld gelten und den Datensatz heimatlos machen.
    if (klein.endsWith('_id') || klein === 'uid') continue;

    if (GANZ_NAME.has(klein)) { aenderung[spalte] = ANONYM_TEXT; continue; }
    if (GANZ_LEER.has(klein)) { aenderung[spalte] = null; continue; }

    const segmente = klein.split('_').filter(Boolean);
    if (segmente.some((s) => LEER_SEGMENTE.has(s))) { aenderung[spalte] = null; continue; }
    if (segmente.some((s) => NAME_SEGMENTE.has(s))) { aenderung[spalte] = ANONYM_TEXT; continue; }
  }

  return aenderung;
}

// ---------------------------------------------------------------------------
// Freigabe: der Nutzer muss bestaetigen, was er tut
// ---------------------------------------------------------------------------

export const FREIGABE_WORT = 'LOESCHEN';

/**
 * Ein Knopf allein reicht bei diesem Vorgang nicht. Der Nutzer tippt das Wort
 * ab — das verhindert den versehentlichen Klick und ist zugleich der Beleg im
 * Protokoll, dass die Loeschung gewollt war.
 */
export function pruefeFreigabe(eingabe: unknown): { ok: boolean; fehler?: string } {
  const wort = String(eingabe ?? '').trim().toUpperCase();
  if (!wort) return { ok: false, fehler: `Bitte ${FREIGABE_WORT} eingeben, um die Löschung zu bestätigen.` };
  if (wort !== FREIGABE_WORT) return { ok: false, fehler: `Das Wort stimmt nicht. Bitte genau ${FREIGABE_WORT} eingeben.` };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Protokoll und Klartext
// ---------------------------------------------------------------------------

export type Zaehler = Record<string, number>;

export type LoeschErgebnis = {
  geloescht: Zaehler;
  anonymisiert: Zaehler;
  behalten: Zaehler;
  uebersprungen: string[];
  fehler: string[];
};

export function leeresErgebnis(): LoeschErgebnis {
  return { geloescht: {}, anonymisiert: {}, behalten: {}, uebersprungen: [], fehler: [] };
}

export function zaehleDazu(z: Zaehler, tabelle: string, anzahl: number): void {
  if (anzahl <= 0) return;
  z[tabelle] = (z[tabelle] ?? 0) + anzahl;
}

export function summe(z: Zaehler): number {
  return Object.values(z).reduce((a, b) => a + b, 0);
}

/** Ein Satz fuer die Oberflaeche und fuer die Antwort an die betroffene Person. */
export function fasseZusammen(e: LoeschErgebnis): string {
  const teile: string[] = [];
  const g = summe(e.geloescht);
  const a = summe(e.anonymisiert);
  const b = summe(e.behalten);

  if (g > 0) teile.push(`${g} ${g === 1 ? 'Eintrag' : 'Einträge'} gelöscht`);
  if (a > 0) teile.push(`${a} ${a === 1 ? 'Eintrag' : 'Einträge'} anonymisiert`);
  if (b > 0) teile.push(`${b} ${b === 1 ? 'Eintrag bleibt' : 'Einträge bleiben'} aus gesetzlichen Gründen erhalten`);

  if (teile.length === 0) return 'Zu diesem Kontakt waren keine weiteren Daten gespeichert.';
  if (teile.length === 1) return `${teile[0]}.`;
  return `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}.`;
}

/** Klartext-Bezeichnung statt Tabellenname — fuer Protokoll und Oberflaeche. */
export function labelFuer(tabelle: string): string {
  const o: DatenOrt | undefined = DATEN_ORTE.find((x) => x.tabelle === tabelle);
  return o ? o.label : tabelle;
}

/** Wandelt einen Zaehler in eine lesbare Liste: [{ label, anzahl }] */
export function alsListe(z: Zaehler): Array<{ tabelle: string; label: string; anzahl: number }> {
  return Object.entries(z)
    .filter(([, n]) => n > 0)
    .map(([tabelle, anzahl]) => ({ tabelle, label: labelFuer(tabelle), anzahl }))
    .sort((x, y) => y.anzahl - x.anzahl || x.label.localeCompare(y.label, 'de'));
}

/**
 * Die Erklaerung, die der Betrieb der betroffenen Person schickt. Ohne diesen
 * Text ist die Loeschung formal unvollstaendig: Art. 17 verlangt, dass die
 * Person erfaehrt, was NICHT geloescht wurde und warum.
 */
export function baueAntworttext(person: string, e: LoeschErgebnis, datum: string): string {
  const zeilen: string[] = [];
  zeilen.push(`Sehr geehrte Damen und Herren,`);
  zeilen.push('');
  zeilen.push(`Ihrem Antrag auf Löschung Ihrer personenbezogenen Daten haben wir am ${datum} entsprochen.`);
  zeilen.push('');
  zeilen.push(fasseZusammen(e));

  const behalten = alsListe(e.behalten);
  if (behalten.length > 0) {
    zeilen.push('');
    zeilen.push('Folgende Unterlagen müssen wir gesetzlich weiter aufbewahren (§ 147 Abgabenordnung, 10 Jahre). Art. 17 Abs. 3 lit. b DSGVO nimmt diesen Fall ausdrücklich von der Löschpflicht aus:');
    for (const b of behalten) {
      zeilen.push(`  · ${b.label} (${b.anzahl})`);
    }
    zeilen.push('');
    zeilen.push('Diese Unterlagen werden ausschließlich zur Erfüllung der Aufbewahrungspflicht vorgehalten und nach Ablauf der Frist gelöscht.');
  }

  zeilen.push('');
  zeilen.push('Mit freundlichen Grüßen');
  return zeilen.join('\n').replace(/\{person\}/g, person);
}
