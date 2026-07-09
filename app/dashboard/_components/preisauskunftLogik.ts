// ============================================================================
// ARGONAUT OS · preisauskunftLogik.ts
// Block 2 · Welle 1 · C4 — Die automatische Preisauskunft
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Seiteneffekte.
//
// DAS IST DER HEBEL.
//   Schäfers größter Schmerz ist nicht die Buchhaltung, sondern die Zeit
//   zwischen Anfrage und Antwort. Diese Datei erzeugt in Millisekunden den
//   Satz, für den er sonst abends an den Schreibtisch müsste:
//
//     "8 SRM Buche 33 cm lufttrocken = 760 €, Anfahrt 42 km = 50 €,
//      gesamt 810 € brutto"
//
// WARUM EINE EIGENE SUMMIERUNG?
//   `summiere()` aus preisLogik verlangt eine HolzEinheit je Position. Eine
//   Anfahrt in Schüttraummetern wäre Unsinn. Deshalb rechnet hier eine kleine
//   Funktion, die nur Netto und Steuersatz kennt. Sie trägt später auch die
//   Pakete (A3b) und jede andere Mischposition.
//
// EHRLICHKEIT ÜBER GENAUIGKEIT:
//   Beruht die Entfernung auf einer Luftlinie, trägt die ganze Auskunft
//   `geschaetzt = true`, und der Kundentext sagt "ca." statt exakter Zahlen.
//   Ein Preis, der sich später ändert, kostet mehr Vertrauen als ein Preis,
//   der von vornherein als Schätzung ausgewiesen war.
// ============================================================================

import { formatZahl, einheitKurz, type HolzEinheit } from './holzLogik';
import { sortimentBezeichnungPdf, type Sortiment } from './sortimentLogik';
import {
  berechnePosition, eur, eurJeEinheit, cent,
  type Preis, type Mengenrabatt, type PositionsErgebnis,
  type GesamtSumme, type SteuerGruppe,
} from './preisLogik';
import {
  berechneAnfahrt, formatKm,
  type AnfahrtKonfig, type FahrtkostenStufe, type AnfahrtErgebnis, type DistanzQuelle,
} from './anfahrtLogik';

// ----------------------------------------------------------------------------
// 1. TYPEN
// ----------------------------------------------------------------------------

export interface AuskunftEingabe {
  menge: number;
  einheit: HolzEinheit;
  sortiment: Sortiment;
  preise: readonly Preis[];
  rabatte?: readonly Mengenrabatt[];

  /** Entfernung in Metern. null = keine Anfahrt berechnen. */
  distanzMeter?: number | null;
  distanzQuelle?: DistanzQuelle;

  /** null = Fahrtkosten nicht eingerichtet. */
  konfig?: AnfahrtKonfig | null;
  stufen?: readonly FahrtkostenStufe[];
}

export interface Preisauskunft {
  ok: boolean;
  fehler: string[];
  hinweise: string[];

  ware: PositionsErgebnis;
  /** null, wenn keine Entfernung übergeben oder Fahrtkosten ausgeschaltet. */
  anfahrt: AnfahrtErgebnis | null;

  gesamt: GesamtSumme;

  /** true, sobald irgendein Teil geschätzt ist (Luftlinie). */
  geschaetzt: boolean;
}

// ----------------------------------------------------------------------------
// 2. SUMMIERUNG NACH STEUERSATZ
// ----------------------------------------------------------------------------

interface Steuerposten {
  netto: number;
  steuersatzProzent: number;
}

/**
 * Fasst Nettobeträge nach Steuersatz zusammen.
 *
 * Eine Rechnung mit 7 % Holz und 19 % Anfahrt braucht ZWEI Steuerzeilen,
 * keine gemittelte. Sonst stimmt die Umsatzsteuer nicht — und das fällt
 * spätestens der Betriebsprüfung auf.
 */
export function summiereSteuer(posten: readonly Steuerposten[]): GesamtSumme {
  const nachSatz = new Map<number, SteuerGruppe>();

  for (const p of posten) {
    if (!Number.isFinite(p.netto) || p.netto === 0) continue;
    const g = nachSatz.get(p.steuersatzProzent) ?? {
      steuersatzProzent: p.steuersatzProzent, netto: 0, steuerBetrag: 0, brutto: 0,
    };
    g.netto = cent(g.netto + p.netto);
    nachSatz.set(p.steuersatzProzent, g);
  }

  // Steuer erst auf die GRUPPENSUMME rechnen, nicht je Position aufaddieren.
  // Sonst weicht die Rechnung um Cents ab.
  const gruppen = [...nachSatz.values()]
    .map((g) => {
      const steuer = cent(g.netto * (g.steuersatzProzent / 100));
      return { ...g, steuerBetrag: steuer, brutto: cent(g.netto + steuer) };
    })
    .sort((a, b) => a.steuersatzProzent - b.steuersatzProzent);

  return {
    netto: cent(gruppen.reduce((s, g) => s + g.netto, 0)),
    steuerBetrag: cent(gruppen.reduce((s, g) => s + g.steuerBetrag, 0)),
    brutto: cent(gruppen.reduce((s, g) => s + g.brutto, 0)),
    gruppen,
  };
}

// ----------------------------------------------------------------------------
// 3. DIE AUSKUNFT
// ----------------------------------------------------------------------------

export function erstellePreisauskunft(e: AuskunftEingabe): Preisauskunft {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  // --- Ware -------------------------------------------------------------
  const ware = berechnePosition(e.menge, e.einheit, e.sortiment.id, e.preise, e.rabatte ?? []);
  fehler.push(...ware.fehler);
  hinweise.push(...ware.hinweise);

  if (!e.sortiment.aktiv) {
    hinweise.push('Diese Variante ist derzeit nicht im Verkauf.');
  }

  // --- Anfahrt ----------------------------------------------------------
  let anfahrt: AnfahrtErgebnis | null = null;

  if (e.distanzMeter !== null && e.distanzMeter !== undefined) {
    const quelle: DistanzQuelle = e.distanzQuelle ?? 'route';
    const erg = berechneAnfahrt(e.distanzMeter, quelle, e.konfig ?? null, e.stufen ?? []);

    // "deaktiviert" ist kein Fehler — der Betrieb will schlicht keine Fahrtkosten.
    if (!erg.deaktiviert) {
      anfahrt = erg;
      fehler.push(...erg.fehler);
      hinweise.push(...erg.hinweise);
    }
  } else if (e.konfig?.aktiv) {
    hinweise.push('Keine Entfernung übergeben — die Anfahrt ist in diesem Preis nicht enthalten.');
  }

  // --- Summe ------------------------------------------------------------
  const posten: Steuerposten[] = [];
  if (ware.ok) posten.push({ netto: ware.netto, steuersatzProzent: ware.steuersatzProzent });
  if (anfahrt?.ok && anfahrt.betragNetto > 0) {
    posten.push({ netto: anfahrt.betragNetto, steuersatzProzent: anfahrt.steuersatzProzent });
  }

  const gesamt = summiereSteuer(posten);
  const geschaetzt = anfahrt?.geschaetzt ?? false;

  return {
    ok: fehler.length === 0 && ware.ok,
    fehler,
    hinweise,
    ware,
    anfahrt,
    gesamt,
    geschaetzt,
  };
}

// ----------------------------------------------------------------------------
// 4. ZEILEN FÜR DIE ANZEIGE
// ----------------------------------------------------------------------------

export interface AuskunftZeile {
  bezeichnung: string;
  detail: string | null;
  nettoText: string;
  /** Für Hervorhebung in der Oberfläche. */
  istRabatt?: boolean;
}

export function auskunftZeilen(a: Preisauskunft, s: Sortiment): AuskunftZeile[] {
  const zeilen: AuskunftZeile[] = [];
  if (!a.ware.ok) return zeilen;

  zeilen.push({
    bezeichnung: `${formatZahl(a.ware.menge, 2)} ${einheitKurz(a.ware.einheit)} ${sortimentBezeichnungPdf(s.holzart, s.scheitlaenge_cm, s.trocknungsgrad)}`,
    detail: eurJeEinheit(a.ware.einzelpreisNetto, a.ware.einheit),
    nettoText: eur(a.ware.grundNetto),
  });

  if (a.ware.rabattProzent > 0) {
    zeilen.push({
      bezeichnung: `Mengenrabatt ${formatZahl(a.ware.rabattProzent, 0)} %`,
      detail: null,
      nettoText: `− ${eur(a.ware.rabattBetrag)}`,
      istRabatt: true,
    });
  }

  if (a.anfahrt?.ok && !a.anfahrt.imFreibereich && a.anfahrt.betragNetto > 0) {
    const km = formatKm(a.anfahrt.distanz.kmAbgerechnet, 0);
    zeilen.push({
      bezeichnung: a.anfahrt.geschaetzt ? `Anfahrtspauschale (ca. ${km})` : `Anfahrtspauschale (${km})`,
      detail: a.anfahrt.mindestbetragGriff ? 'Mindestbetrag' : null,
      nettoText: eur(a.anfahrt.betragNetto),
    });
  } else if (a.anfahrt?.ok && a.anfahrt.imFreibereich) {
    zeilen.push({
      bezeichnung: `Anfahrt ${formatKm(a.anfahrt.distanz.kmAbgerechnet, 0)}`,
      detail: 'innerhalb der Freigrenze',
      nettoText: eur(0),
    });
  }

  return zeilen;
}

// ----------------------------------------------------------------------------
// 5. DER TEXT FÜR DEN KUNDEN
// ----------------------------------------------------------------------------

export interface TextOptionen {
  /** z. B. "Guten Tag Frau Weber," — aus empfaengerLogik.anrede(). */
  anrede?: string | null;
  /** Wie der Betrieb sich nennt. Niemals ein KI-Name. */
  absender?: string | null;
  /** Freibleibend-Hinweis anhängen? Standard: ja. */
  mitVorbehalt?: boolean;
}

/**
 * Der fertige Text, den Schäfer als Antwort verschickt.
 * Sie-Form, keine Fachbegriffe, keine Abkürzungen ohne Erklärung.
 *
 * Enthält NIE einen KI-Namen — nur den Betrieb.
 */
export function preisauskunftText(
  a: Preisauskunft,
  s: Sortiment,
  opt: TextOptionen = {},
): string {
  if (!a.ok) {
    return a.fehler.join(' ');
  }

  const zeilen: string[] = [];
  if (opt.anrede) zeilen.push(opt.anrede, '');

  zeilen.push('gern nenne ich Ihnen den Preis für Ihre Anfrage:', '');

  const ware = `${formatZahl(a.ware.menge, 2)} ${einheitKurz(a.ware.einheit)} ` +
    sortimentBezeichnungPdf(s.holzart, s.scheitlaenge_cm, s.trocknungsgrad);
  zeilen.push(`${ware}`);
  zeilen.push(`  ${eurJeEinheit(a.ware.einzelpreisNetto, a.ware.einheit)} = ${eur(a.ware.grundNetto)} netto`);

  if (a.ware.rabattProzent > 0) {
    zeilen.push(`  abzüglich ${formatZahl(a.ware.rabattProzent, 0)} % Mengenrabatt = − ${eur(a.ware.rabattBetrag)}`);
    zeilen.push(`  Zwischensumme: ${eur(a.ware.netto)} netto`);
  }

  if (a.anfahrt?.ok) {
    zeilen.push('');
    const km = formatKm(a.anfahrt.distanz.kmAbgerechnet, 0);
    if (a.anfahrt.imFreibereich) {
      zeilen.push(`Anlieferung ${a.anfahrt.geschaetzt ? 'ca. ' : ''}${km}: kostenfrei`);
    } else {
      zeilen.push(`Anlieferung ${a.anfahrt.geschaetzt ? 'ca. ' : ''}${km}: ${eur(a.anfahrt.betragNetto)} netto`);
    }
  }

  zeilen.push('', `Summe netto: ${eur(a.gesamt.netto)}`);
  for (const g of a.gesamt.gruppen) {
    zeilen.push(`zzgl. ${formatZahl(g.steuersatzProzent, 0)} % USt. auf ${eur(g.netto)}: ${eur(g.steuerBetrag)}`);
  }
  zeilen.push(`Gesamtbetrag: ${eur(a.gesamt.brutto)} brutto`);

  if (a.geschaetzt) {
    zeilen.push('', 'Die Entfernung ist ein Schätzwert. Der endgültige Anfahrtsbetrag kann geringfügig abweichen.');
  }

  if (opt.mitVorbehalt !== false) {
    zeilen.push('', 'Dieses Angebot ist freibleibend. Verfügbarkeit und Liefertermin stimmen wir gern telefonisch ab.');
  }

  if (opt.absender) zeilen.push('', 'Mit freundlichen Grüßen', opt.absender);

  return zeilen.join('\n');
}

/** Die Kurzfassung — eine Zeile, für Telefon, SMS oder das Cockpit. */
export function preisauskunftKurz(a: Preisauskunft, s: Sortiment): string {
  if (!a.ok) return a.fehler.join(' ');

  const teile: string[] = [
    `${formatZahl(a.ware.menge, 2)} ${einheitKurz(a.ware.einheit)} ` +
      `${sortimentBezeichnungPdf(s.holzart, s.scheitlaenge_cm, s.trocknungsgrad)} = ${eur(a.ware.netto)} netto`,
  ];

  if (a.anfahrt?.ok && a.anfahrt.betragNetto > 0) {
    const km = formatKm(a.anfahrt.distanz.kmAbgerechnet, 0);
    teile.push(`Anfahrt ${a.anfahrt.geschaetzt ? 'ca. ' : ''}${km} = ${eur(a.anfahrt.betragNetto)}`);
  }

  teile.push(`gesamt ${eur(a.gesamt.brutto)} brutto`);
  return teile.join(', ');
}
