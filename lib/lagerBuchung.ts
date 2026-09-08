// ============================================================================
// ARGONAUT OS · lib/lagerBuchung.ts — Bestand je Filiale (D1)
//
// ▄▄▄ DER STAND AM 08.09.26 ▄▄▄
// Die Struktur fuer Bestand je Standort EXISTIERT bereits:
//   · artikel_bestand_standort (bestand, standort_id)
//   · lager_bewegung           (menge, standort_id)
//   · lager_umlagerung
// Benutzt wird sie aber von genau EINER Seite: /dashboard/erp/lager.
//
// Sieben andere Wege buchen weiter auf die alte, standortlose Tabelle
// `lagerbewegungen`: Kasse, Einkauf, Bestellungen, ERP-Artikelseite,
// Lager-Scanner, Material-Entnahme und die Lager-Auswertung.
//
// Damit kann heute Folgendes passieren: Filiale A verkauft an der Kasse,
// der Abgang landet im globalen Topf, und die Bestandsanzeige von Filiale B
// sinkt mit. Wer danach Inventur macht, findet eine Differenz, die niemand
// mehr zuordnen kann.
//
// ▄▄▄ DIE ZWEI REGELN, DIE HIER ALLES TRAGEN ▄▄▄
//
// 1. EINE BUCHUNG BRAUCHT EINEN KONKRETEN STANDORT — oder sie unterbleibt.
//    „Alle Standorte" ist eine Ansicht, kein Lagerort. Wer bei aktiver
//    Gesamtansicht bucht, muss gefragt werden, statt dass das System raet.
//    Ausnahme: Ein Betrieb mit genau einem (oder keinem) Standort hat keine
//    Wahl zu treffen — dort wird stillschweigend richtig gebucht.
//
// 2. EIN ABGANG WIRD NIE BLOCKIERT, NUR GEMELDET.
//    Wenn an der Kasse etwas verkauft wurde, ist es verkauft — auch wenn der
//    Bestand das nicht hergibt. Eine Buchung zu verweigern, aendert die
//    Wirklichkeit nicht, sie versteckt sie nur. Der Bestand darf also unter
//    null gehen, und genau das wird sichtbar gemeldet: Das ist ein
//    Zaehlfehler von frueher, den jemand suchen muss.
//
// KEINE Netzwerk-/Supabase-Aufrufe — pure, node-testbar.
// ============================================================================

export type BuchungsArt = 'zugang' | 'abgang' | 'korrektur' | 'umlagerung';

/** Woher kommt die Buchung? Steht in der Bewegung, damit man sie zurueckverfolgen kann. */
export type Herkunft =
  | 'kasse' | 'einkauf' | 'bestellung' | 'artikel' | 'scanner'
  | 'entnahme' | 'inventur' | 'umlagerung' | 'sonstige';

// ---------------------------------------------------------------------------
// Welcher Standort gilt?
// ---------------------------------------------------------------------------

export type StandortWahl =
  | { ok: true; standortId: string | null; grund: 'gewaehlt' | 'einziger' | 'ohne_standorte' }
  | { ok: false; fehler: string };

/**
 * Entscheidet, auf welchen Standort gebucht wird.
 *
 * @param gewaehlt      Der aktive Standort (aus dem Umschalter). null = „Alle".
 * @param alleStandorte Die Standorte des Betriebs.
 */
export function standortFuerBuchung(
  gewaehlt: string | null | undefined,
  alleStandorte: { id?: unknown }[] | null | undefined,
): StandortWahl {
  const gew = String(gewaehlt ?? '').trim();
  const liste = (alleStandorte || [])
    .map((s) => String(s?.id ?? '').trim())
    .filter(Boolean);

  if (gew) {
    // Ein Standort, den es nicht (mehr) gibt, wird NICHT stillschweigend
    // durch den ersten ersetzt — sonst bucht jemand in eine fremde Filiale.
    if (liste.length > 0 && !liste.includes(gew)) {
      return { ok: false, fehler: 'Die gewählte Filiale gibt es nicht mehr. Bitte wählen Sie oben eine andere.' };
    }
    return { ok: true, standortId: gew, grund: 'gewaehlt' };
  }

  if (liste.length === 0) return { ok: true, standortId: null, grund: 'ohne_standorte' };
  if (liste.length === 1) return { ok: true, standortId: liste[0], grund: 'einziger' };

  return {
    ok: false,
    fehler: 'Sie sehen gerade alle Filialen zusammen. Wählen Sie oben die Filiale aus, '
      + 'für die gebucht werden soll — sonst weiß niemand, wo die Ware liegt.',
  };
}

// ---------------------------------------------------------------------------
// Die Buchung selbst
// ---------------------------------------------------------------------------

export type Buchung = {
  artikelId: string;
  standortId: string | null;
  art: BuchungsArt;
  /** Immer positiv. Die Richtung steckt in `art`. */
  menge: number;
  herkunft: Herkunft;
  notiz?: string | null;
};

/**
 * Vorzeichen der Bewegung. `korrektur` ist bewusst NICHT dabei: Eine Korrektur
 * setzt den Bestand auf einen Zaehlwert, sie addiert nicht.
 */
export function vorzeichen(art: BuchungsArt): 1 | -1 {
  return art === 'zugang' ? 1 : -1;
}

/** Menge einlesen: immer positiv, nie NaN, sinnvoll gerundet. */
export function sichereMenge(roh: unknown): number {
  const n = Number(roh);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.abs(n) * 1000) / 1000;
}

export type BuchungsErgebnis = {
  neuerBestand: number;
  /** Warnung im Klartext — oder null. Blockiert nie. */
  warnung: string | null;
};

/**
 * Rechnet den neuen Bestand aus.
 *
 * Ein Abgang unter null wird ZUGELASSEN und gemeldet. Siehe Regel 2 oben:
 * Was verkauft ist, ist verkauft. Ein negativer Bestand ist ein sichtbarer
 * Hinweis auf einen alten Zaehlfehler — eine verweigerte Buchung waere ein
 * unsichtbarer.
 */
export function bucheBestand(
  alterBestand: unknown,
  art: BuchungsArt,
  menge: unknown,
): BuchungsErgebnis {
  const alt = Number(alterBestand);
  const basis = Number.isFinite(alt) ? alt : 0;
  const m = sichereMenge(menge);

  if (art === 'korrektur') {
    // Korrektur SETZT den Bestand (Inventur), sie verrechnet nicht.
    return {
      neuerBestand: m,
      warnung: null,
    };
  }

  const neu = Math.round((basis + vorzeichen(art) * m) * 1000) / 1000;

  if (neu < 0) {
    return {
      neuerBestand: neu,
      warnung: `Der Bestand rutscht auf ${neu.toLocaleString('de-DE')} — es wurde mehr entnommen, `
        + 'als verzeichnet war. Die Buchung ist trotzdem erfolgt; bitte prüfen Sie die letzte Zählung.',
    };
  }
  return { neuerBestand: neu, warnung: null };
}

/** Reicht der Bestand für diese Entnahme? Nur zur Anzeige VOR dem Buchen. */
export function reichtBestand(bestand: unknown, menge: unknown): boolean {
  const b = Number(bestand);
  return (Number.isFinite(b) ? b : 0) >= sichereMenge(menge);
}

// ---------------------------------------------------------------------------
// Umlagerung
// ---------------------------------------------------------------------------

export type Umlagerung = { vonId: string; nachId: string; menge: number };

export type UmlagerungsPlan =
  | { ok: true; abgang: Buchung; zugang: Buchung }
  | { ok: false; fehler: string };

/**
 * Eine Umlagerung ist ZWEI Bewegungen — nie eine.
 *
 * Wer nur „Bestand von A abziehen und bei B addieren" schreibt, hat bei einem
 * Abbruch zwischen den beiden Schritten Ware, die nirgends liegt. Deshalb
 * gibt diese Funktion beide Buchungen zusammen zurueck: Der Aufrufer schreibt
 * sie in EINEM Vorgang oder gar nicht.
 */
export function planeUmlagerung(
  artikelId: string,
  u: Umlagerung,
  notiz?: string | null,
): UmlagerungsPlan {
  const von = String(u?.vonId ?? '').trim();
  const nach = String(u?.nachId ?? '').trim();
  const menge = sichereMenge(u?.menge);

  if (!artikelId) return { ok: false, fehler: 'Kein Artikel angegeben.' };
  if (!von || !nach) return { ok: false, fehler: 'Bitte wählen Sie beide Filialen aus.' };
  if (von === nach) return { ok: false, fehler: 'Quelle und Ziel sind dieselbe Filiale.' };
  if (menge <= 0) return { ok: false, fehler: 'Bitte geben Sie eine Menge größer als null an.' };

  return {
    ok: true,
    abgang: { artikelId, standortId: von, art: 'umlagerung', menge, herkunft: 'umlagerung', notiz: notiz ?? null },
    zugang: { artikelId, standortId: nach, art: 'zugang', menge, herkunft: 'umlagerung', notiz: notiz ?? null },
  };
}

// ---------------------------------------------------------------------------
// Zusammenzaehlen
// ---------------------------------------------------------------------------

export type BestandZeile = { artikel_id?: unknown; standort_id?: unknown; bestand?: unknown };

/** Gesamtbestand eines Artikels über alle Filialen. */
export function gesamtBestand(zeilen: BestandZeile[] | null | undefined, artikelId: string): number {
  let summe = 0;
  for (const z of zeilen || []) {
    if (String(z?.artikel_id ?? '') !== artikelId) continue;
    const b = Number(z?.bestand);
    if (Number.isFinite(b)) summe += b;
  }
  return Math.round(summe * 1000) / 1000;
}

/** Bestand eines Artikels in EINER Filiale. Fehlt die Zeile, ist er null — nicht 0. */
export function bestandIn(
  zeilen: BestandZeile[] | null | undefined,
  artikelId: string,
  standortId: string | null,
): number | null {
  for (const z of zeilen || []) {
    if (String(z?.artikel_id ?? '') !== artikelId) continue;
    const s = z?.standort_id == null ? null : String(z.standort_id);
    if (s === standortId) {
      const b = Number(z?.bestand);
      return Number.isFinite(b) ? b : 0;
    }
  }
  // Bewusst null statt 0: „hier ist nichts gezaehlt worden" ist etwas
  // anderes als „hier sind null Stueck".
  return null;
}

/** Die Verteilung eines Artikels über die Filialen — für die Anzeige. */
export function verteilung(
  zeilen: BestandZeile[] | null | undefined,
  artikelId: string,
): { standortId: string | null; bestand: number }[] {
  const raus: { standortId: string | null; bestand: number }[] = [];
  for (const z of zeilen || []) {
    if (String(z?.artikel_id ?? '') !== artikelId) continue;
    const b = Number(z?.bestand);
    raus.push({
      standortId: z?.standort_id == null ? null : String(z.standort_id),
      bestand: Number.isFinite(b) ? b : 0,
    });
  }
  return raus.sort((a, b) => b.bestand - a.bestand);
}

/**
 * Liegt Ware unter dem Mindestbestand? Geprueft wird die SUMME, nicht die
 * einzelne Filiale: Zwei halbvolle Regale sind zusammen ein volles, und eine
 * Warnung je Filiale wuerde nur Laerm machen.
 */
export function unterMindest(gesamt: unknown, mindest: unknown): boolean {
  const m = Number(mindest);
  if (!Number.isFinite(m) || m <= 0) return false;
  const g = Number(gesamt);
  return (Number.isFinite(g) ? g : 0) < m;
}

// ---------------------------------------------------------------------------
// Klartext
// ---------------------------------------------------------------------------

export function artText(art: BuchungsArt): string {
  switch (art) {
    case 'zugang': return 'Zugang';
    case 'abgang': return 'Abgang';
    case 'korrektur': return 'Korrektur';
    case 'umlagerung': return 'Umlagerung';
    default: return 'Bewegung';
  }
}

export function herkunftText(h: Herkunft): string {
  switch (h) {
    case 'kasse': return 'Kasse';
    case 'einkauf': return 'Einkauf';
    case 'bestellung': return 'Bestellung';
    case 'artikel': return 'Artikelseite';
    case 'scanner': return 'Scanner';
    case 'entnahme': return 'Material-Entnahme';
    case 'inventur': return 'Inventur';
    case 'umlagerung': return 'Umlagerung';
    default: return 'Sonstiges';
  }
}

/** Der Satz nach einer Buchung. Nennt die Filiale, wenn es mehrere gibt. */
export function buchungsSatz(
  art: BuchungsArt,
  menge: unknown,
  neuerBestand: unknown,
  filialName?: string | null,
): string {
  const m = sichereMenge(menge).toLocaleString('de-DE');
  // ▄▄▄ Number(null) IST 0 ▄▄▄
  // Ein unbekannter Bestand darf NICHT als „0" erscheinen — das ist eine
  // Aussage ueber die Wirklichkeit, die wir nicht treffen koennen. Deshalb
  // wird leer/null/undefined VOR der Umwandlung abgefangen.
  const leer = neuerBestand === null || neuerBestand === undefined || neuerBestand === '';
  const b = leer ? NaN : Number(neuerBestand);
  const bestandText = Number.isFinite(b) ? b.toLocaleString('de-DE') : '—';
  const wo = String(filialName ?? '').trim();
  const inFiliale = wo ? ` in ${wo}` : '';
  if (art === 'korrektur') return `Bestand${inFiliale} auf ${bestandText} gesetzt.`;
  return `${artText(art)} von ${m}${inFiliale} gebucht. Neuer Bestand: ${bestandText}.`;
}
