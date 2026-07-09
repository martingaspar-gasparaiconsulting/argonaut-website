// ============================================================================
// ARGONAUT OS · verortungsLogik.ts
// Block 1 · I-1d — Viele Adressen auf einmal verorten
//
// Reine Funktionen (bis auf `warte`). Kein DB-Zugriff, kein React.
// BRANCHENNEUTRAL. Kontakte, Firmen, Objekte — dieselbe Datei.
//
// DIE HARTE GRENZE
//   OpenRouteService erlaubt rund 40 Anfragen pro Minute im gleitenden Fenster.
//   Bei 300 Kontakten sind das etwa 10 Minuten. Ohne Drosselung kommt nach 40
//   Adressen ein 429 — und die restlichen 260 bleiben unverortet.
//
// WARUM IM BROWSER UND NICHT AUF DEM SERVER
//   Eine Serverless-Funktion hat ein Zeitlimit. Zehn Minuten überlebt sie nicht.
//   Der Browser ruft /api/geocode einzeln auf, mit Pause dazwischen. Jede
//   einzelne Anfrage ist kurz.
//
// DER FEHLERFALL ENTSCHEIDET ÜBER DEN ERFOLG
//   429 = zu schnell        -> warten, dieselbe Adresse erneut
//   403 = Tageskontingent   -> abbrechen, morgen weiter
//   404 = nicht gefunden    -> überspringen, die anderen laufen
//   409 = Verortung veraltet-> überspringen, Mensch muss ran
//   401 = kein Schlüssel    -> abbrechen, es hat keinen Zweck
//
//   Ohne diese Unterscheidung bricht der ganze Lauf beim ersten Ausrutscher ab.
//
// WIEDERAUFNAHME IST KOSTENLOS
//   Der Verorter fragt bei jedem Start: "Wer hat eine Adresse, aber keine
//   Koordinaten?" Stürzt der Browser nach 40 ab, sind es beim nächsten Start
//   eben 260 statt 300. Kein Zustand nötig, keine Warteschlangen-Tabelle.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. DROSSELUNG
// ----------------------------------------------------------------------------

/**
 * Bewusst unter dem Limit von 40/Minute. Der Sicherheitsabstand kostet
 * zwei Minuten bei 300 Adressen und erspart eine ganze Fehlerklasse.
 */
export const ANFRAGEN_PRO_MINUTE = 30;

/** Millisekunden zwischen zwei Anfragen. */
export const PAUSE_MS = Math.ceil(60_000 / ANFRAGEN_PRO_MINUTE);

/** Wie lange warten, wenn ORS "zu schnell" sagt? Das Fenster ist gleitend. */
export const WARTEZEIT_429_MS = 65_000;

/** Wie oft dieselbe Adresse nach einem 429 erneut versuchen? */
export const MAX_WIEDERHOLUNGEN = 2;

export function warte(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Grobe Schätzung der Laufzeit — damit niemand den Browser zumacht. */
export function geschaetzteDauer(anzahl: number): { minuten: number; text: string } {
  const sekunden = (anzahl * PAUSE_MS) / 1000;
  const minuten = Math.ceil(sekunden / 60);
  if (anzahl === 0) return { minuten: 0, text: 'nichts zu tun' };
  if (minuten <= 1) return { minuten: 1, text: 'unter einer Minute' };
  return { minuten, text: `etwa ${minuten} Minuten` };
}

// ----------------------------------------------------------------------------
// 2. FEHLERKLASSIFIKATION
// ----------------------------------------------------------------------------

export type Ausgang =
  | 'verortet'      // Koordinaten gesetzt
  | 'ungenau'       // Koordinaten gesetzt, aber nur ungefähr
  | 'nicht_gefunden'// Adresse gibt es nicht — überspringen
  | 'veraltet'      // Verortung veraltet — Mensch muss ran
  | 'zu_schnell'    // 429 — warten, erneut
  | 'kontingent'    // 403 — abbrechen
  | 'kein_schluessel' // 401/400 — abbrechen
  | 'fehler';       // sonstiges — überspringen

export type Weitermachen = 'weiter' | 'wiederholen' | 'abbrechen';

export interface AntwortDeutung {
  ausgang: Ausgang;
  weitermachen: Weitermachen;
  meldung: string;
}

/**
 * Übersetzt die Antwort von /api/geocode in eine Entscheidung.
 * Das ist der Kern: Was ein Ausrutscher ist und was ein Grund zum Aufhören.
 */
export function deuteAntwort(status: number, daten: unknown): AntwortDeutung {
  const d = (daten ?? {}) as { ok?: boolean; genauigkeit?: string; code?: string; error?: string };

  if (status === 200 && d.ok) {
    return d.genauigkeit === 'ungenau'
      ? { ausgang: 'ungenau', weitermachen: 'weiter', meldung: 'Nur ungefähr verortet.' }
      : { ausgang: 'verortet', weitermachen: 'weiter', meldung: 'Verortet.' };
  }

  const text = (d.error ?? '').toLowerCase();

  // ⚠️ /api/geocode gibt BEIDES als 429 zurück: Minutenlimit und erschöpftes
  // Tageskontingent. Der Statuscode allein genügt nicht.
  //   Minutenlimit  -> 65 Sekunden warten, erneut versuchen
  //   Tageskontingent -> abbrechen, morgen weiter
  // Ohne diese Unterscheidung wartet der Verorter zweimal vergeblich und
  // meldet am Ende den falschen Grund.
  const tageslimit =
    text.includes('tageskontingent') ||
    text.includes('kontingent ist erschöpft') ||
    text.includes('24 stunden');

  if (status === 403 || tageslimit) {
    return {
      ausgang: 'kontingent', weitermachen: 'abbrechen',
      meldung: 'Das Tageskontingent ist erschöpft. Morgen geht es weiter — der Fortschritt bleibt erhalten.',
    };
  }

  if (status === 429) {
    return {
      ausgang: 'zu_schnell', weitermachen: 'wiederholen',
      meldung: 'Zu viele Anfragen — es wird eine Minute gewartet.',
    };
  }

  if (status === 404) {
    return {
      ausgang: 'nicht_gefunden', weitermachen: 'weiter',
      meldung: d.error ?? 'Adresse nicht gefunden.',
    };
  }

  if (status === 409 || d.code === 'verortung_veraltet') {
    return {
      ausgang: 'veraltet', weitermachen: 'weiter',
      meldung: 'Anschrift wurde geändert — bitte im Kontakt neu verorten.',
    };
  }

  if (d.code === 'kein_schluessel' || status === 401) {
    return {
      ausgang: 'kein_schluessel', weitermachen: 'abbrechen',
      meldung: d.error ?? 'Kein Kartendienst hinterlegt.',
    };
  }

  return {
    ausgang: 'fehler', weitermachen: 'weiter',
    meldung: d.error ?? `Unerwartete Antwort (${status}).`,
  };
}

// ----------------------------------------------------------------------------
// 3. FORTSCHRITT
// ----------------------------------------------------------------------------

export interface Zwischenstand {
  gesamt: number;
  erledigt: number;
  verortet: number;
  ungenau: number;
  nichtGefunden: number;
  veraltet: number;
  fehler: number;

  laeuft: boolean;
  wartetBis: number | null;   // Zeitstempel, während der 429-Pause
  abgebrochen: string | null; // Grund
}

export function leererStand(gesamt = 0): Zwischenstand {
  return {
    gesamt, erledigt: 0, verortet: 0, ungenau: 0,
    nichtGefunden: 0, veraltet: 0, fehler: 0,
    laeuft: false, wartetBis: null, abgebrochen: null,
  };
}

/** Zählt einen Ausgang mit. Reiner Zustandsübergang, gut testbar. */
export function zaehle(stand: Zwischenstand, ausgang: Ausgang): Zwischenstand {
  const s = { ...stand };
  switch (ausgang) {
    case 'verortet': s.verortet++; s.erledigt++; break;
    case 'ungenau': s.ungenau++; s.erledigt++; break;
    case 'nicht_gefunden': s.nichtGefunden++; s.erledigt++; break;
    case 'veraltet': s.veraltet++; s.erledigt++; break;
    case 'fehler': s.fehler++; s.erledigt++; break;
    // 'zu_schnell', 'kontingent', 'kein_schluessel' zählen nicht als erledigt.
    default: break;
  }
  return s;
}

export function fortschrittProzent(s: Zwischenstand): number {
  if (s.gesamt === 0) return 0;
  return Math.min(100, Math.round((s.erledigt / s.gesamt) * 100));
}

/** Ein Satz für die Oberfläche. Ehrlich, auch wenn er unangenehm ist. */
export function standKlartext(s: Zwischenstand): string {
  if (s.abgebrochen) return s.abgebrochen;
  if (s.gesamt === 0) return 'Alle Kontakte mit Anschrift sind verortet.';
  if (!s.laeuft && s.erledigt === 0) return `${s.gesamt} Kontakt(e) warten auf Koordinaten.`;
  if (s.laeuft && s.wartetBis) return 'Wartet auf den Kartendienst …';

  const teile: string[] = [`${s.erledigt} von ${s.gesamt}`];
  if (s.verortet) teile.push(`${s.verortet} verortet`);
  if (s.ungenau) teile.push(`${s.ungenau} ungenau`);
  if (s.nichtGefunden) teile.push(`${s.nichtGefunden} nicht gefunden`);
  if (s.veraltet) teile.push(`${s.veraltet} veraltet`);
  if (s.fehler) teile.push(`${s.fehler} Fehler`);
  return teile.join(' · ');
}

// ----------------------------------------------------------------------------
// 4. WAS ÜBERHAUPT VERORTET WERDEN KANN
// ----------------------------------------------------------------------------

export interface VerortbarKandidat {
  id: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  geo_lat: number | null;
  geo_lon: number | null;
}

export interface AuswahlBefund<T> {
  offen: T[];
  schonVerortet: number;
  ohneAdresse: number;
}

/**
 * Wer kommt in die Warteschlange?
 *   - hat Straße, PLZ und Ort
 *   - hat noch keine Koordinaten
 *
 * Wer schon Koordinaten hat, wird NICHT erneut verortet. Das spart Kontingent
 * und verhindert, dass eine von Hand gesetzte Koordinate überschrieben wird.
 */
export function waehleOffene<T extends VerortbarKandidat>(liste: readonly T[]): AuswahlBefund<T> {
  let schonVerortet = 0;
  let ohneAdresse = 0;
  const offen: T[] = [];

  for (const k of liste) {
    const hatKoord = k.geo_lat != null && k.geo_lon != null;
    const hatAdresse = Boolean((k.strasse ?? '').trim() && (k.plz ?? '').trim() && (k.ort ?? '').trim());

    if (hatKoord) { schonVerortet++; continue; }
    if (!hatAdresse) { ohneAdresse++; continue; }
    offen.push(k);
  }

  return { offen, schonVerortet, ohneAdresse };
}
