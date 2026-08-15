// ============================================================================
// ARGONAUT OS · lib/academyText.ts — Untertitel und Transkript
//
// WAS HIER EHRLICH GESAGT WERDEN MUSS
// Aus einer Videodatei automatisch den gesprochenen Text zu gewinnen
// (Spracherkennung) kann die KI-Anbindung dieses Systems NICHT: die
// Anthropic-Schnittstelle nimmt Text und Bilder entgegen, keinen Ton. Dafuer
// braeuchte es einen zusaetzlichen Dienst (Whisper, Deepgram o.ae.) — das ist
// eine Konto- und Kostenfrage, keine Code-Frage. Der Andockpunkt dafuer ist
// vorbereitet (siehe QUELLE unten), aber nichts wird hier vorgetaeuscht.
//
// WAS DAFUER GEHT — und im Alltag das meiste bringt:
// Der Betrieb gibt den Text ein (abgetippt, aus dem Handy-Notizzettel, aus
// dem Drehbuch). Daraus entstehen dann:
//   · eine Untertitel-Datei (WebVTT) mit Zeitmarken
//   · ein gegliedertes Transkript zum Nachlesen und Durchsuchen
//
// Die Zeitmarken werden aus Wortzahl und Videolaenge GESCHAETZT — deutsche
// Sprechgeschwindigkeit liegt bei rund 130 Woertern je Minute. Das ist genau
// genug, um mitzulesen, und wird in der Oberflaeche auch so benannt. Wer es
// framegenau braucht, korrigiert die Datei von Hand nach.
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

/** Woher der Text stammt. 'spracherkennung' ist der vorgesehene Platz fuer
 *  einen spaeteren Transkriptionsdienst — heute unbenutzt. */
export type TextQuelle = 'eingegeben' | 'ki_aufbereitet' | 'spracherkennung';

/** Deutsche Sprechgeschwindigkeit in Woertern je Minute (Erklaervideo-Tempo). */
export const WOERTER_JE_MINUTE = 130;

export type Untertitel = {
  nummer: number;
  von: number;      // Sekunden
  bis: number;      // Sekunden
  text: string;
};

// ---------------------------------------------------------------------------
// Text zerlegen
// ---------------------------------------------------------------------------

/**
 * Zerlegt den Text in Untertitel-Haeppchen. Geschnitten wird an Satzenden,
 * nicht mitten im Wort — ein Untertitel, der einen Satz zerreisst, ist
 * schlechter als gar keiner.
 */
export function inHaeppchen(text: string, maxZeichen = 90): string[] {
  const sauber = String(text || '').replace(/\s+/g, ' ').trim();
  if (!sauber) return [];

  // Erst an Satzenden trennen (Punkt, Frage-, Ausrufezeichen).
  const saetze = sauber.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const haeppchen: string[] = [];

  for (const satz of saetze) {
    if (satz.length <= maxZeichen) { haeppchen.push(satz.trim()); continue; }

    // Zu lange Saetze an Kommas teilen, sonst an Wortgrenzen.
    const teile = satz.split(/(?<=,)\s+/);
    let puffer = '';
    for (const teil of teile) {
      if (teil.length > maxZeichen) {
        if (puffer) { haeppchen.push(puffer.trim()); puffer = ''; }
        let rest = teil;
        while (rest.length > maxZeichen) {
          const schnitt = rest.lastIndexOf(' ', maxZeichen);
          const pos = schnitt > maxZeichen * 0.5 ? schnitt : maxZeichen;
          haeppchen.push(rest.slice(0, pos).trim());
          rest = rest.slice(pos).trim();
        }
        if (rest) puffer = rest;
        continue;
      }
      if ((puffer + ' ' + teil).trim().length > maxZeichen) {
        if (puffer) haeppchen.push(puffer.trim());
        puffer = teil;
      } else {
        puffer = (puffer ? puffer + ' ' : '') + teil;
      }
    }
    if (puffer.trim()) haeppchen.push(puffer.trim());
  }

  return haeppchen.filter((h) => h.length > 0);
}

export function zaehleWoerter(text: string): number {
  const sauber = String(text || '').trim();
  if (!sauber) return 0;
  return sauber.split(/\s+/).filter((w) => /[a-zA-Z0-9äöüÄÖÜß]/.test(w)).length;
}

/** Geschaetzte Sprechdauer eines Textes in Sekunden. */
export function geschaetzteDauer(text: string): number {
  return (zaehleWoerter(text) / WOERTER_JE_MINUTE) * 60;
}

// ---------------------------------------------------------------------------
// Zeitmarken verteilen
// ---------------------------------------------------------------------------

/**
 * Verteilt die Haeppchen ueber die Videolaenge — anteilig nach Wortzahl,
 * nicht gleichmaessig. Ein langer Satz steht laenger als ein kurzer.
 *
 * Ist die Videolaenge unbekannt (0), wird nach Sprechgeschwindigkeit gerechnet.
 */
export function baueUntertitel(text: string, laengeSekunden: number, maxZeichen = 90): Untertitel[] {
  const teile = inHaeppchen(text, maxZeichen);
  if (teile.length === 0) return [];

  const woerterJeTeil = teile.map((t) => Math.max(1, zaehleWoerter(t)));
  const woerterGesamt = woerterJeTeil.reduce((a, b) => a + b, 0);

  const laenge = Number(laengeSekunden) > 0
    ? Number(laengeSekunden)
    : (woerterGesamt / WOERTER_JE_MINUTE) * 60;

  // Untertitel sollen mindestens 1,2 s stehen bleiben — sonst kann sie
  // niemand lesen. ABER: passen die Mindestzeiten nicht ins Video (viele
  // kurze Saetze, kurzer Film), wird die Mindestdauer heruntergesetzt statt
  // ueber das Videoende hinauszulaufen. Sonst kollabieren die letzten
  // Untertitel auf Dauer null und jeder Abspieler stolpert darueber.
  const MINDEST_WUNSCH = 1.2;
  const mindest = Math.min(MINDEST_WUNSCH, laenge / teile.length);

  const untertitel: Untertitel[] = [];
  let position = 0;

  teile.forEach((t, i) => {
    const anteil = (woerterJeTeil[i] ?? 1) / woerterGesamt;
    const verbleibend = teile.length - i - 1;
    // Was nach diesem Haeppchen noch fuer die restlichen gebraucht wird.
    const reserviert = verbleibend * mindest;
    const hoechstens = Math.max(mindest, laenge - reserviert - position);
    const dauer = Math.min(hoechstens, Math.max(mindest, anteil * laenge));
    const von = position;
    const bis = von + dauer;
    untertitel.push({ nummer: i + 1, von, bis, text: t });
    position = bis;
  });

  // Rundungsreste: der letzte Untertitel laeuft bis zum Ende.
  const letzter = untertitel[untertitel.length - 1];
  if (letzter && laenge > 0) letzter.bis = laenge;

  return untertitel;
}

/** Sekunden im WebVTT-Format: 00:01:23.400 */
export function vttZeit(sekunden: number): string {
  const s = Math.max(0, Number(sekunden) || 0);
  const std = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sek = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${String(std).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sek).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Fertige WebVTT-Datei — das Format, das jeder Browser direkt versteht. */
export function alsVtt(untertitel: Untertitel[]): string {
  if (untertitel.length === 0) return 'WEBVTT\n\n';
  const bloecke = untertitel.map((u) =>
    `${u.nummer}\n${vttZeit(u.von)} --> ${vttZeit(u.bis)}\n${u.text}`
  );
  return 'WEBVTT\n\n' + bloecke.join('\n\n') + '\n';
}

/** Der ganze Weg in einem Aufruf. */
export function textZuVtt(text: string, laengeSekunden: number): string {
  return alsVtt(baueUntertitel(text, laengeSekunden));
}

// ---------------------------------------------------------------------------
// Transkript zum Nachlesen
// ---------------------------------------------------------------------------

export type Abschnitt = { zeit: number; text: string };

/**
 * Fasst die Untertitel zu lesbaren Abschnitten zusammen — mit Zeitmarke, damit
 * man im Video an die passende Stelle springen kann.
 */
export function alsAbschnitte(untertitel: Untertitel[], sekundenJeAbschnitt = 30): Abschnitt[] {
  if (untertitel.length === 0) return [];
  const abschnitte: Abschnitt[] = [];
  let start = untertitel[0]?.von ?? 0;
  let puffer: string[] = [];

  for (const u of untertitel) {
    if (puffer.length > 0 && u.von - start >= sekundenJeAbschnitt) {
      abschnitte.push({ zeit: start, text: puffer.join(' ') });
      start = u.von;
      puffer = [];
    }
    puffer.push(u.text);
  }
  if (puffer.length > 0) abschnitte.push({ zeit: start, text: puffer.join(' ') });
  return abschnitte;
}

export function zeitMarke(sekunden: number): string {
  const s = Math.max(0, Math.round(Number(sekunden) || 0));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Prüfung vor dem Speichern
// ---------------------------------------------------------------------------

export function pruefeText(text: string, laengeSekunden: number): { fehler: string[]; hinweise: string[] } {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const woerter = zaehleWoerter(text);

  if (woerter === 0) { fehler.push('Es ist noch kein Text da.'); return { fehler, hinweise }; }
  if (woerter < 10) fehler.push('Der Text ist sehr kurz — für Untertitel braucht es mindestens ein paar Sätze.');

  if (laengeSekunden > 0) {
    const gebraucht = geschaetzteDauer(text);
    const verhaeltnis = gebraucht / laengeSekunden;
    if (verhaeltnis > 1.6) {
      hinweise.push(`Der Text wäre gesprochen rund ${Math.round(gebraucht / 60)} Minuten lang, das Video dauert nur ${Math.round(laengeSekunden / 60)}. Die Untertitel laufen dann schneller als das Gesagte.`);
    } else if (verhaeltnis < 0.4) {
      hinweise.push('Der Text ist deutlich kürzer als das Video — vermutlich fehlt ein Teil, oder es wird viel gezeigt statt gesprochen.');
    }
  } else {
    hinweise.push('Die Videolänge ist nicht bekannt — die Zeitmarken werden allein aus der Sprechgeschwindigkeit geschätzt.');
  }

  return { fehler, hinweise };
}
