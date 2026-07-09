// ============================================================================
// ARGONAUT OS · importLogik.ts
// Block 1 · I-1c-3 — Der Ablauf eines Imports
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Seiteneffekte.
// BRANCHENNEUTRAL. Kontakte, Lieferanten, Artikel — dieselbe Datei.
//
// DREI GRUNDSÄTZE
//
// 1. NICHTS WIRD AUTOMATISCH ZUSAMMENGEFÜHRT.
//    Auch nicht in der Zone "sicher". Das System hakt nichts vor.
//    Ein Mensch klickt, oder es passiert nichts.
//
// 2. DER IMPORT FÜHRT NICHT ZUSAMMEN.
//    Er legt an, überspringt, oder markiert. Das Verschmelzen ist ein eigener
//    Schritt danach. Ein Import, der gleichzeitig löscht, ist ein Import, den
//    man nicht rückgängig machen kann.
//
// 3. DOPPELTE INNERHALB DER DATEI BLOCKIEREN.
//    Stehen Kanban- und HubSpot-Zeile im selben Import, darf nur EINE angelegt
//    werden. Sonst erzeugt der Import genau das Problem, das er lösen soll.
//
// WIEDERHOLBARKEIT
//    Jede Zeile bekommt einen `import_schluessel`. Läuft derselbe Import
//    zweimal, entstehen keine Doppelten, sondern Aktualisierungen.
// ============================================================================

import {
  findeDubletten, vergleiche,
  type Kandidat, type Vergleich, type Zone,
} from './dublettenLogik';
import { zeileZuDatensatz, type ZielFeld } from './csvLogik';

// ----------------------------------------------------------------------------
// 1. TYPEN
// ----------------------------------------------------------------------------

export type ZeilenStatus =
  | 'neu'              // wird angelegt
  | 'dublette'         // Treffer im Bestand — Mensch entscheidet
  | 'intern_doppelt'   // Treffer INNERHALB der Datei
  | 'aktualisieren'    // gleicher import_schluessel -> Update
  | 'uebersprungen'    // vom Menschen abgewählt
  | 'fehler';          // unbrauchbar

export type ZeilenAktion = 'anlegen' | 'ueberspringen' | 'zusammenfuehren' | 'aktualisieren';

export interface ImportZeile {
  nr: number;
  roh: string[];
  daten: Kandidat & { notiz?: string | null; land?: string | null };
  importSchluessel: string | null;

  status: ZeilenStatus;
  fehler: string[];
  hinweise: string[];

  /** Bester Treffer im Bestand, falls vorhanden. */
  treffer: { kandidat: Kandidat; vergleich: Vergleich } | null;
  /** Zeilennummer des internen Doppelten, falls vorhanden. */
  internDoppeltZu: number | null;

  /** Was passieren soll. Vom Menschen änderbar. */
  aktion: ZeilenAktion;
}

export interface ImportBefund {
  zeilen: ImportZeile[];
  anzahl: {
    gesamt: number;
    neu: number;
    dubletten: number;
    internDoppelt: number;
    aktualisieren: number;
    fehler: number;
  };
  hinweise: string[];
}

// ----------------------------------------------------------------------------
// 2. PRÜFUNG EINER ZEILE
// ----------------------------------------------------------------------------

/**
 * Was macht eine Zeile unbrauchbar?
 *
 * Bewusst wenig: Ein Kontakt ohne E-Mail ist kein Fehler, ein Kontakt ohne
 * jeden Namen schon. Wer zu streng prüft, wirft echte Kunden weg.
 */
function pruefeZeile(d: Kandidat): { fehler: string[]; hinweise: string[] } {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  const hatNamen = Boolean((d.vorname ?? '').trim() || (d.nachname ?? '').trim());
  const hatFirma = Boolean((d.firmenname ?? '').trim());

  if (!hatNamen && !hatFirma) {
    fehler.push('Weder Name noch Firma — die Zeile lässt sich niemandem zuordnen.');
  }

  const email = (d.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    hinweise.push(`Die E-Mail „${email}" sieht ungewöhnlich aus.`);
  }

  const plz = (d.plz ?? '').trim();
  if (plz && !/^\d{4,5}$/.test(plz)) {
    hinweise.push(`Die PLZ „${plz}" sieht ungewöhnlich aus.`);
  }

  const hatAdresse = Boolean((d.strasse ?? '').trim() && plz && (d.ort ?? '').trim());
  if (!hatAdresse) {
    hinweise.push('Anschrift unvollständig — die Anfahrt lässt sich später nicht berechnen.');
  }

  return { fehler, hinweise };
}

// ----------------------------------------------------------------------------
// 3. DER BEFUND
// ----------------------------------------------------------------------------

export interface PruefOptionen {
  /** Woher stammt die Datei? Bildet den Präfix des import_schluessel. */
  quelle?: string;
  /** Welche Spalte trägt die Fremd-ID? Dann ist der Import wiederholbar. */
  idSpalte?: number | null;
  /** Ab wie vielen Punkten gilt etwas als Dublette? */
  schwelle?: number;
}

/**
 * Nimmt die geparsten CSV-Zeilen, die Spaltenzuordnung und den Bestand —
 * und liefert für jede Zeile eine Empfehlung.
 *
 * Die Reihenfolge der Prüfungen ist wichtig:
 *   1. Ist die Zeile überhaupt brauchbar?
 *   2. Gibt es sie schon (gleicher import_schluessel)? -> aktualisieren
 *   3. Steht sie doppelt IN DER DATEI? -> nur die erste anlegen
 *   4. Gibt es einen Treffer im Bestand? -> Mensch entscheidet
 *   5. Sonst: neu
 */
export function pruefeImport(
  csvZeilen: readonly string[][],
  zuordnung: readonly ZielFeld[],
  bestand: readonly Kandidat[],
  opt: PruefOptionen = {},
): ImportBefund {
  const quelle = opt.quelle ?? 'csv';
  const schwelle = opt.schwelle ?? 50;
  const hinweise: string[] = [];

  // --- Schritt 1: Rohdaten in Kandidaten überführen --------------------
  const zeilen: ImportZeile[] = csvZeilen.map((roh, i) => {
    const d = zeileZuDatensatz(roh, zuordnung) as Kandidat & { notiz?: string; land?: string };
    const { fehler, hinweise: hw } = pruefeZeile(d);

    const fremdId = opt.idSpalte != null ? (roh[opt.idSpalte] ?? '').trim() : '';
    const importSchluessel = fremdId ? `${quelle}:${fremdId}` : null;

    return {
      nr: i + 1,
      roh: [...roh],
      daten: d,
      importSchluessel,
      status: fehler.length > 0 ? 'fehler' : 'neu',
      fehler,
      hinweise: hw,
      treffer: null,
      internDoppeltZu: null,
      aktion: fehler.length > 0 ? 'ueberspringen' : 'anlegen',
    };
  });

  // --- Schritt 2: bereits importiert? (gleicher Schlüssel) -------------
  const bestandNachSchluessel = new Map<string, Kandidat>();
  for (const b of bestand) {
    const k = (b as Kandidat & { import_schluessel?: string | null }).import_schluessel;
    if (k) bestandNachSchluessel.set(k, b);
  }

  for (const z of zeilen) {
    if (z.status === 'fehler' || !z.importSchluessel) continue;
    const vorhanden = bestandNachSchluessel.get(z.importSchluessel);
    if (vorhanden) {
      z.status = 'aktualisieren';
      z.aktion = 'aktualisieren';
      z.treffer = { kandidat: vorhanden, vergleich: vergleiche(z.daten, vorhanden) };
      z.hinweise.push('Dieser Datensatz wurde schon einmal importiert und wird aktualisiert.');
    }
  }

  // --- Schritt 3: doppelt innerhalb der Datei? -------------------------
  // Der Erste gewinnt. Jeder weitere wird markiert, nicht angelegt.
  const brauchbar = zeilen.filter((z) => z.status === 'neu');
  for (let i = 0; i < brauchbar.length; i++) {
    if (brauchbar[i].internDoppeltZu !== null) continue;
    for (let j = i + 1; j < brauchbar.length; j++) {
      if (brauchbar[j].internDoppeltZu !== null) continue;
      const v = vergleiche(brauchbar[i].daten, brauchbar[j].daten);
      if (v.punkte >= schwelle && !v.emailKonflikt) {
        brauchbar[j].status = 'intern_doppelt';
        brauchbar[j].internDoppeltZu = brauchbar[i].nr;
        brauchbar[j].aktion = 'ueberspringen';
        brauchbar[j].hinweise.push(
          `Steht bereits in Zeile ${brauchbar[i].nr} dieser Datei (${v.punkte} Punkte). ` +
            'Es wird nur der erste Datensatz angelegt.',
        );
      }
    }
  }

  // --- Schritt 4: Treffer im Bestand ------------------------------------
  for (const z of zeilen) {
    if (z.status !== 'neu') continue;
    const treffer = findeDubletten(z.daten, bestand, schwelle);
    if (treffer.length === 0) continue;

    const bester = treffer[0];
    z.treffer = bester;
    z.status = 'dublette';
    // ⚠️ NIE vorangehakt. Auch nicht in der Zone "sicher".
    z.aktion = 'ueberspringen';
    z.hinweise.push(
      `Möglicher Doppelter im Bestand (${bester.vergleich.punkte} Punkte): ${bester.vergleich.begruendung}`,
    );
  }

  // --- Zusammenfassung ---------------------------------------------------
  const anzahl = {
    gesamt: zeilen.length,
    neu: zeilen.filter((z) => z.status === 'neu').length,
    dubletten: zeilen.filter((z) => z.status === 'dublette').length,
    internDoppelt: zeilen.filter((z) => z.status === 'intern_doppelt').length,
    aktualisieren: zeilen.filter((z) => z.status === 'aktualisieren').length,
    fehler: zeilen.filter((z) => z.status === 'fehler').length,
  };

  if (anzahl.internDoppelt > 0) {
    hinweise.push(
      `${anzahl.internDoppelt} Zeile(n) stehen doppelt in dieser Datei. ` +
        'Nur der jeweils erste Datensatz wird angelegt.',
    );
  }
  if (anzahl.dubletten > 0) {
    hinweise.push(
      `${anzahl.dubletten} Zeile(n) könnten schon im Bestand stehen. ` +
        'Sie werden standardmäßig übersprungen — bitte einzeln prüfen.',
    );
  }
  if (anzahl.fehler > 0) {
    hinweise.push(`${anzahl.fehler} Zeile(n) sind unbrauchbar und werden nicht angelegt.`);
  }
  if (opt.idSpalte == null) {
    hinweise.push(
      'Keine ID-Spalte gewählt. Ein erneuter Import derselben Datei würde die Datensätze ' +
        'ein zweites Mal anlegen.',
    );
  }

  return { zeilen, anzahl, hinweise };
}

// ----------------------------------------------------------------------------
// 4. WAS TATSÄCHLICH GESCHRIEBEN WIRD
// ----------------------------------------------------------------------------

export interface Uebernahme {
  anlegen: ImportZeile[];
  aktualisieren: ImportZeile[];
  zusammenfuehren: ImportZeile[];
  uebersprungen: ImportZeile[];
}

/**
 * Teilt die Zeilen nach der gewählten Aktion auf.
 * Was hier nicht in `anlegen` oder `aktualisieren` landet, berührt die
 * Datenbank nicht.
 */
export function planeUebernahme(zeilen: readonly ImportZeile[]): Uebernahme {
  return {
    anlegen: zeilen.filter((z) => z.aktion === 'anlegen' && z.status !== 'fehler'),
    aktualisieren: zeilen.filter((z) => z.aktion === 'aktualisieren' && z.status !== 'fehler'),
    zusammenfuehren: zeilen.filter((z) => z.aktion === 'zusammenfuehren' && z.treffer !== null),
    uebersprungen: zeilen.filter((z) => z.aktion === 'ueberspringen' || z.status === 'fehler'),
  };
}

/** Ein Satz für den Bestätigungsdialog. Kein Import ohne diesen Satz. */
export function uebernahmeKlartext(u: Uebernahme): string {
  const teile: string[] = [];
  if (u.anlegen.length) teile.push(`${u.anlegen.length} neu anlegen`);
  if (u.aktualisieren.length) teile.push(`${u.aktualisieren.length} aktualisieren`);
  if (u.zusammenfuehren.length) teile.push(`${u.zusammenfuehren.length} zusammenführen`);
  if (u.uebersprungen.length) teile.push(`${u.uebersprungen.length} überspringen`);
  return teile.length > 0 ? teile.join(' · ') : 'Nichts ausgewählt.';
}

// ----------------------------------------------------------------------------
// 5. ANZEIGE-HILFEN
// ----------------------------------------------------------------------------

export function statusFarbe(s: ZeilenStatus): 'gruen' | 'gelb' | 'rot' | 'grau' {
  switch (s) {
    case 'neu': return 'gruen';
    case 'aktualisieren': return 'gruen';
    case 'dublette': return 'gelb';
    case 'intern_doppelt': return 'gelb';
    case 'fehler': return 'rot';
    case 'uebersprungen': return 'grau';
  }
}

export function statusText(s: ZeilenStatus): string {
  switch (s) {
    case 'neu': return 'neu';
    case 'aktualisieren': return 'wird aktualisiert';
    case 'dublette': return 'möglicher Doppelter';
    case 'intern_doppelt': return 'doppelt in der Datei';
    case 'fehler': return 'unbrauchbar';
    case 'uebersprungen': return 'übersprungen';
  }
}

export function zonenText(z: Zone): string {
  switch (z) {
    case 'sicher': return 'sehr wahrscheinlich dieselbe Person';
    case 'pruefen': return 'könnte dieselbe Person sein';
    case 'getrennt': return 'vermutlich verschieden';
  }
}

/** Kurzform eines Kandidaten für Listen. */
export function kandidatKurz(k: Kandidat): string {
  const name = [k.vorname, k.nachname].filter(Boolean).join(' ') || k.firmenname || '—';
  const zusatz = [k.email, [k.plz, k.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  return zusatz ? `${name} (${zusatz})` : name;
}
