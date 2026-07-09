// ============================================================================
// ARGONAUT OS · anfahrtLogik.ts
// Block 2 · Welle 1 · B3-2 — Anfahrt & Fahrtkosten
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Seiteneffekte.
//
// BRANCHENNEUTRAL. Kein Wort über Brennholz.
//   Dieselbe Datei trägt die KFZ-Werkstatt (Hol- und Bringservice), den
//   Aufmaß-Termin auf der Baustelle, die Objektfahrt im Wartungsvertrag.
//   Deshalb hängt sie nur an empfaengerLogik — nie an holzLogik.
//
// STANDARDMÄSSIG AUS.
//   `anfahrt_konfig.aktiv` ist in der DB auf false vorbelegt. Kein Betrieb
//   bekommt über Nacht Fahrtkosten auf die Rechnung, nur weil das Modul da ist.
//
// REIHENFOLGE DER RECHNUNG (wichtig, hier steckt die Fachlichkeit):
//   1. Rohentfernung in Metern (Route, Luftlinie oder von Hand)
//   2. Ist es Luftlinie? -> Aufschlag drauf, denn Luftlinie ist immer zu kurz
//   3. Hin und zurück? -> Entfernung verdoppeln
//   4. Runden (auf / kaufmännisch / keine)
//   5. Freigrenze prüfen -> darunter 0 €
//   6. Passende Staffel suchen
//   7. Mindestbetrag anwenden
//   8. Steuer drauf
//
// EHRLICHKEIT: Eine Luftlinie ist keine Fahrstrecke. Wird sie verwendet,
// setzt das Ergebnis `geschaetzt = true`. Die Oberfläche MUSS das zeigen.
// ============================================================================

import type { GeoPunkt, PruefErgebnis } from './empfaengerLogik';

// ----------------------------------------------------------------------------
// 1. TYPEN
// ----------------------------------------------------------------------------

export type Rundung = 'auf' | 'kaufmaennisch' | 'keine';

/** Woher kommt die Entfernung? Das entscheidet über Genauigkeit und Aufschlag. */
export type DistanzQuelle = 'route' | 'luftlinie' | 'manuell';

/** Entspricht einer Zeile in public.anfahrt_konfig. */
export interface AnfahrtKonfig {
  id: string;
  owner_user_id: string;
  firma_id: string | null;

  /** Der Ausschalter. Aus = kein Modul rechnet Fahrtkosten. */
  aktiv: boolean;

  frei_bis_km: number;
  hin_und_rueck: boolean;
  steuersatz_prozent: number;
  mindestbetrag_netto: number | null;
  rundung_km: Rundung;
  luftlinie_aufschlag_prozent: number;

  notiz: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
}

/** Entspricht einer Zeile in public.fahrtkosten_staffel. bis_km = null -> offen. */
export interface FahrtkostenStufe {
  id: string;
  owner_user_id: string;
  firma_id: string | null;

  von_km: number;
  bis_km: number | null;
  betrag_netto: number;

  aktiv: boolean;
  notiz: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
}

export interface StufenEntwurf {
  von_km: number;
  bis_km: number | null;
  betrag_netto: number;
}

/** Vorbelegung, solange kein Konfig-Datensatz existiert. */
export const STANDARD_KONFIG = {
  aktiv: false,
  frei_bis_km: 30,
  hin_und_rueck: false,
  steuersatz_prozent: 19,
  mindestbetrag_netto: null as number | null,
  rundung_km: 'auf' as Rundung,
  luftlinie_aufschlag_prozent: 25,
};

// ----------------------------------------------------------------------------
// 2. GELD & ZAHLEN
// ----------------------------------------------------------------------------

export function cent(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * 100) / 100;
}

export function eur(betrag: number): string {
  if (!Number.isFinite(betrag)) return '—';
  return `${betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatKm(km: number, stellen = 1): string {
  if (!Number.isFinite(km)) return '—';
  return `${km.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen })} km`;
}

function runde(km: number, art: Rundung): number {
  if (!Number.isFinite(km)) return 0;
  switch (art) {
    case 'auf': return Math.ceil(km);
    case 'kaufmaennisch': return Math.round(km);
    case 'keine': return Math.round((km + Number.EPSILON) * 100) / 100;
  }
}

// ----------------------------------------------------------------------------
// 3. ENTFERNUNG AUFBEREITEN
// ----------------------------------------------------------------------------

export interface DistanzAufbereitung {
  /** Die reine Entfernung zum Kunden, einfache Strecke, in km. */
  kmEinfach: number;
  /** Nach Luftlinien-Aufschlag und Hin-und-Rück, vor der Rundung. */
  kmRoh: number;
  /** Der Wert, mit dem gerechnet wird. */
  kmAbgerechnet: number;
  /** true, wenn die Grundlage eine Luftlinie war. */
  geschaetzt: boolean;
  quelle: DistanzQuelle;
}

/**
 * Bringt eine Rohentfernung in die Form, mit der die Staffel arbeitet.
 * Der Luftlinien-Aufschlag greift NUR bei quelle = 'luftlinie'. Eine echte
 * Route oder ein von Hand gesetzter Wert werden nicht künstlich erhöht.
 */
export function bereiteDistanzAuf(
  distanzMeter: number,
  quelle: DistanzQuelle,
  konfig: Pick<AnfahrtKonfig, 'hin_und_rueck' | 'rundung_km' | 'luftlinie_aufschlag_prozent'>,
): DistanzAufbereitung {
  const kmEinfach = Math.max(0, distanzMeter) / 1000;

  let km = kmEinfach;
  if (quelle === 'luftlinie') {
    const auf = Math.max(0, konfig.luftlinie_aufschlag_prozent);
    km = km * (1 + auf / 100);
  }
  if (konfig.hin_und_rueck) km = km * 2;

  return {
    kmEinfach: Math.round((kmEinfach + Number.EPSILON) * 100) / 100,
    kmRoh: Math.round((km + Number.EPSILON) * 100) / 100,
    kmAbgerechnet: runde(km, konfig.rundung_km),
    geschaetzt: quelle === 'luftlinie',
    quelle,
  };
}

// ----------------------------------------------------------------------------
// 4. STAFFEL
// ----------------------------------------------------------------------------

/** Trifft diese Stufe auf die Entfernung zu? Grenzen: [von_km, bis_km) */
export function stufePasst(s: FahrtkostenStufe, km: number): boolean {
  if (!s.aktiv) return false;
  if (km < s.von_km) return false;
  return s.bis_km === null || km < s.bis_km;
}

/**
 * Findet die zutreffende Stufe. Dank der Überlappungssperre in der Datenbank
 * kann es höchstens eine geben — hier wird trotzdem defensiv die engste
 * gewählt, falls Altdaten anders aussehen.
 */
export function findeStufe(stufen: readonly FahrtkostenStufe[], km: number): FahrtkostenStufe | null {
  const treffer = stufen.filter((s) => stufePasst(s, km));
  if (treffer.length === 0) return null;
  return treffer.reduce((a, b) => (b.von_km > a.von_km ? b : a));
}

/** Aufsteigend sortiert — für die Anzeige. */
export function sortiereStufen(stufen: readonly FahrtkostenStufe[]): FahrtkostenStufe[] {
  return [...stufen].filter((s) => s.aktiv).sort((a, b) => a.von_km - b.von_km);
}

/**
 * Findet Lücken in der Staffel.
 *
 * Das ist wichtiger, als es klingt: Wer "30–50 km" und "60–80 km" anlegt,
 * hat für einen Kunden bei 55 km KEINEN Preis. Das fällt im Alltag erst auf,
 * wenn die Preisauskunft schweigt. Hier fällt es beim Anlegen auf.
 */
export interface StaffelPruefung extends PruefErgebnis {
  /** Unabgedeckte Bereiche, z. B. "50–60 km". */
  luecken: Array<{ vonKm: number; bisKm: number }>;
  /** Gibt es eine Stufe ohne Obergrenze? Sonst endet die Staffel im Nichts. */
  nachObenOffen: boolean;
}

export function pruefeStaffel(
  stufen: readonly FahrtkostenStufe[],
  freiBisKm: number,
): StaffelPruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const luecken: Array<{ vonKm: number; bisKm: number }> = [];

  const sortiert = sortiereStufen(stufen);

  if (sortiert.length === 0) {
    hinweise.push('Es ist noch keine Stufe hinterlegt — jede Entfernung ist damit kostenfrei.');
    return { ok: true, fehler, hinweise, luecken, nachObenOffen: false };
  }

  // Beginnt die Staffel dort, wo die Freigrenze endet?
  const erste = sortiert[0];
  if (erste.von_km > freiBisKm) {
    luecken.push({ vonKm: freiBisKm, bisKm: erste.von_km });
    hinweise.push(
      `Zwischen ${formatKm(freiBisKm, 0)} (Ende der Freigrenze) und ${formatKm(erste.von_km, 0)} ` +
        'ist keine Stufe hinterlegt. Dort werden 0 € berechnet.',
    );
  } else if (erste.von_km < freiBisKm) {
    hinweise.push(
      `Die erste Stufe beginnt bei ${formatKm(erste.von_km, 0)}, die Freigrenze reicht aber bis ` +
        `${formatKm(freiBisKm, 0)}. Bis dahin gilt die Freigrenze — die Stufe greift erst danach.`,
    );
  }

  // Lücken zwischen den Stufen
  for (let i = 0; i < sortiert.length - 1; i++) {
    const a = sortiert[i];
    const b = sortiert[i + 1];
    if (a.bis_km === null) {
      fehler.push(
        `Die Stufe ab ${formatKm(a.von_km, 0)} ist nach oben offen, aber danach folgt noch eine weitere. ` +
          'Bitte eine Obergrenze setzen.',
      );
      continue;
    }
    if (a.bis_km < b.von_km) {
      luecken.push({ vonKm: a.bis_km, bisKm: b.von_km });
      hinweise.push(`Lücke: zwischen ${formatKm(a.bis_km, 0)} und ${formatKm(b.von_km, 0)} gilt keine Stufe.`);
    }
  }

  const letzte = sortiert[sortiert.length - 1];
  const nachObenOffen = letzte.bis_km === null;
  if (!nachObenOffen) {
    hinweise.push(
      `Über ${formatKm(letzte.bis_km as number, 0)} hinaus ist keine Stufe hinterlegt. ` +
        'Lass die Obergrenze der letzten Stufe leer, damit sie für alle weiteren Entfernungen gilt.',
    );
  }

  return { ok: fehler.length === 0, fehler, hinweise, luecken, nachObenOffen };
}

/** Prüft eine neue Stufe, bevor die DB-Sperre zuschlägt. */
export function pruefeStufe(
  e: StufenEntwurf,
  vorhandene: readonly FahrtkostenStufe[],
  ausserId?: string,
): PruefErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!Number.isFinite(e.von_km) || e.von_km < 0) {
    fehler.push('„von km" muss 0 oder größer sein.');
  }
  if (e.bis_km !== null && (!Number.isFinite(e.bis_km) || e.bis_km <= e.von_km)) {
    fehler.push('„bis km" muss größer als „von km" sein — oder leer für „nach oben offen".');
  }
  if (!Number.isFinite(e.betrag_netto) || e.betrag_netto < 0) {
    fehler.push('Der Betrag darf nicht negativ sein.');
  } else if (e.betrag_netto === 0) {
    hinweise.push('Betrag 0 € — diese Stufe wäre kostenfrei. Absicht?');
  }

  if (fehler.length > 0) return { ok: false, fehler, hinweise };

  // Überlappung: [von, bis) gegen [von, bis)
  const neuBis = e.bis_km ?? Number.POSITIVE_INFINITY;
  const kollision = vorhandene.find((s) => {
    if (!s.aktiv || s.id === ausserId) return false;
    const sBis = s.bis_km ?? Number.POSITIVE_INFINITY;
    return e.von_km < sBis && s.von_km < neuBis;
  });

  if (kollision) {
    const bis = kollision.bis_km === null ? 'offen' : formatKm(kollision.bis_km, 0);
    fehler.push(
      `Diese Stufe überschneidet sich mit einer vorhandenen (${formatKm(kollision.von_km, 0)} bis ${bis}). ` +
        'Zwei Preise für dieselbe Entfernung sind nicht möglich.',
    );
  }

  const offene = vorhandene.filter((s) => s.aktiv && s.bis_km === null && s.id !== ausserId);
  if (e.bis_km === null && offene.length > 0) {
    fehler.push('Es gibt bereits eine nach oben offene Stufe. Es kann nur eine geben.');
  }

  return { ok: fehler.length === 0, fehler, hinweise };
}

// ----------------------------------------------------------------------------
// 5. DIE BERECHNUNG
// ----------------------------------------------------------------------------

export interface AnfahrtErgebnis {
  ok: boolean;
  fehler: string[];
  hinweise: string[];

  /** Modul ist ausgeschaltet — es fallen grundsätzlich keine Fahrtkosten an. */
  deaktiviert: boolean;
  /** Innerhalb der Freigrenze. */
  imFreibereich: boolean;
  /** Grundlage war eine Luftlinie. Die Oberfläche MUSS das kennzeichnen. */
  geschaetzt: boolean;

  distanz: DistanzAufbereitung;
  stufe: FahrtkostenStufe | null;

  betragNetto: number;
  mindestbetragGriff: boolean;
  steuersatzProzent: number;
  steuerBetrag: number;
  betragBrutto: number;
}

function leer(distanz: DistanzAufbereitung, teil: Partial<AnfahrtErgebnis>): AnfahrtErgebnis {
  return {
    ok: true, fehler: [], hinweise: [],
    deaktiviert: false, imFreibereich: false, geschaetzt: distanz.geschaetzt,
    distanz, stufe: null,
    betragNetto: 0, mindestbetragGriff: false,
    steuersatzProzent: 0, steuerBetrag: 0, betragBrutto: 0,
    ...teil,
  };
}

/**
 * Rechnet die Fahrtkosten für eine Entfernung durch.
 * `konfig = null` bedeutet: noch nicht eingerichtet -> keine Fahrtkosten.
 */
export function berechneAnfahrt(
  distanzMeter: number,
  quelle: DistanzQuelle,
  konfig: AnfahrtKonfig | null,
  stufen: readonly FahrtkostenStufe[] = [],
): AnfahrtErgebnis {
  const wirkKonfig = konfig ?? ({ ...STANDARD_KONFIG } as unknown as AnfahrtKonfig);
  const distanz = bereiteDistanzAuf(distanzMeter, quelle, wirkKonfig);

  if (!konfig || !konfig.aktiv) {
    return leer(distanz, {
      deaktiviert: true,
      hinweise: ['Fahrtkosten sind für diesen Betrieb nicht aktiviert.'],
    });
  }

  if (!Number.isFinite(distanzMeter) || distanzMeter < 0) {
    return leer(distanz, { ok: false, fehler: ['Die Entfernung ist keine gültige Zahl.'] });
  }

  const hinweise: string[] = [];
  if (distanz.geschaetzt) {
    hinweise.push(
      `Geschätzte Entfernung: Luftlinie zuzüglich ${konfig.luftlinie_aufschlag_prozent} % Aufschlag. ` +
        'Mit hinterlegtem Kartendienst wird die echte Fahrstrecke verwendet.',
    );
  }
  if (konfig.hin_und_rueck) {
    hinweise.push(`Hin- und Rückfahrt: ${formatKm(distanz.kmEinfach)} einfach, ${formatKm(distanz.kmAbgerechnet, 0)} gefahren.`);
  }

  // Freigrenze
  if (distanz.kmAbgerechnet <= konfig.frei_bis_km) {
    return leer(distanz, {
      imFreibereich: true,
      hinweise: [...hinweise, `Innerhalb der Freigrenze von ${formatKm(konfig.frei_bis_km, 0)} — keine Fahrtkosten.`],
      steuersatzProzent: konfig.steuersatz_prozent,
    });
  }

  // Staffel
  const stufe = findeStufe(stufen, distanz.kmAbgerechnet);
  if (!stufe) {
    return leer(distanz, {
      ok: false,
      hinweise,
      fehler: [
        `Für ${formatKm(distanz.kmAbgerechnet, 0)} ist keine Fahrtkosten-Stufe hinterlegt. ` +
          'Bitte in den Einstellungen eine passende Stufe ergänzen.',
      ],
      steuersatzProzent: konfig.steuersatz_prozent,
    });
  }

  let betragNetto = cent(stufe.betrag_netto);
  let mindestbetragGriff = false;

  if (konfig.mindestbetrag_netto !== null && betragNetto < konfig.mindestbetrag_netto) {
    betragNetto = cent(konfig.mindestbetrag_netto);
    mindestbetragGriff = true;
    hinweise.push(`Mindestbetrag von ${eur(konfig.mindestbetrag_netto)} angewendet.`);
  }

  const steuerBetrag = cent(betragNetto * (konfig.steuersatz_prozent / 100));

  return {
    ok: true, fehler: [], hinweise,
    deaktiviert: false, imFreibereich: false, geschaetzt: distanz.geschaetzt,
    distanz, stufe,
    betragNetto, mindestbetragGriff,
    steuersatzProzent: konfig.steuersatz_prozent,
    steuerBetrag,
    betragBrutto: cent(betragNetto + steuerBetrag),
  };
}

// ----------------------------------------------------------------------------
// 6. KLARTEXT — für Preisauskunft, Rechnung und PDF
// ----------------------------------------------------------------------------

/** Die Positionsbezeichnung auf Angebot und Rechnung. */
export function anfahrtBezeichnung(e: AnfahrtErgebnis): string {
  const km = formatKm(e.distanz.kmAbgerechnet, 0);
  return e.geschaetzt ? `Anfahrtspauschale (ca. ${km})` : `Anfahrtspauschale (${km})`;
}

/**
 * Der Satz für den Kunden.
 * "Anfahrt 42 km = 50,00 € netto (59,50 € brutto, 19 % USt.)"
 */
export function anfahrtKlartext(e: AnfahrtErgebnis): string {
  if (e.deaktiviert) return 'Es werden keine Fahrtkosten berechnet.';
  if (!e.ok) return e.fehler.join(' ');

  const km = formatKm(e.distanz.kmAbgerechnet, 0);
  const vorsatz = e.geschaetzt ? 'Geschätzte Anfahrt' : 'Anfahrt';

  if (e.imFreibereich) return `${vorsatz} ${km} — innerhalb der Freigrenze, keine Fahrtkosten.`;

  return (
    `${vorsatz} ${km} = ${eur(e.betragNetto)} netto · ` +
    `${eur(e.betragBrutto)} brutto (${e.steuersatzProzent} % USt.)`
  );
}

/** Die Staffel als lesbare Zeilen — für Einstellungen und Kundenauskunft. */
export function staffelZeilen(stufen: readonly FahrtkostenStufe[], freiBisKm: number): string[] {
  const zeilen: string[] = [`bis ${formatKm(freiBisKm, 0)}: kostenfrei`];
  for (const s of sortiereStufen(stufen)) {
    const bis = s.bis_km === null ? 'und weiter' : `bis ${formatKm(s.bis_km, 0)}`;
    zeilen.push(`ab ${formatKm(s.von_km, 0)} ${bis}: ${eur(s.betrag_netto)} netto`);
  }
  return zeilen;
}

// ----------------------------------------------------------------------------
// 7. LUFTLINIE (Notnagel, wenn keine Route verfügbar ist)
// ----------------------------------------------------------------------------

/**
 * Haversine. Liefert Meter.
 * Bewusst hier dupliziert und nicht aus lib/ors.ts importiert: diese Datei
 * läuft im Browser, lib/ors.ts ist serverseitig und fasst Schlüssel an.
 */
export function luftlinieMeter(start: GeoPunkt, ziel: GeoPunkt): number {
  const R = 6371000;
  const bog = (g: number) => (g * Math.PI) / 180;
  const dLat = bog(ziel.lat - start.lat);
  const dLon = bog(ziel.lon - start.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(bog(start.lat)) * Math.cos(bog(ziel.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
