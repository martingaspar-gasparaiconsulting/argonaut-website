// ============================================================================
// ARGONAUT OS · lib/ics.ts — Kalendereinträge (RFC 5545)
//
// Erzeugt den Inhalt einer .ics-Datei, die an eine Mail gehängt wird. Outlook,
// Apple Kalender, Google Kalender und Thunderbird bieten dann „In Kalender
// eintragen" an. Ohne das notiert sich niemand einen Termin, und die halbe
// Anmeldeliste ist am Tag X nicht da.
//
// ▄▄▄ WARUM METHOD:PUBLISH UND NICHT REQUEST ▄▄▄
// REQUEST macht aus dem Eintrag eine Einladung mit Zusagen/Absagen. Die
// Antworten landen dann im Postfach des Absenders — und liest sie niemand,
// stehen dort hunderte unbeantwortete Zusagen. ARGONAUT führt die Teilnehmer-
// liste selbst; der Kalendereintrag soll nur EINTRAGEN. PUBLISH tut genau das.
//
// ▄▄▄ DREI FALLEN, DIE HIER ENTSCHÄRFT SIND ▄▄▄
// 1) Zeilen dürfen höchstens 75 OKTETT lang sein, nicht 75 Zeichen. Ein „ä"
//    braucht zwei Oktett. Wer nach Zeichen faltet, zerschneidet Umlaute mitten
//    im Zeichen und Outlook zeigt Buchstabensalat.
// 2) Komma, Semikolon, Backslash und Zeilenumbruch MÜSSEN maskiert werden.
//    Ein unmaskiertes Komma im Titel beendet das Feld — der Rest verschwindet.
// 3) Zeilenenden sind CRLF, nicht LF. Manche Programme zeigen die Datei sonst
//    gar nicht erst an.
//
// Reine Zeichenketten-Arbeit, KEINE Netzwerk-/Supabase-Aufrufe. Node-getestet.
// ============================================================================

export type IcsTermin = {
  /** Eindeutig und STABIL — bei einer Änderung muss dieselbe uid kommen,
   *  sonst legt der Kalender einen zweiten Eintrag an statt zu ersetzen. */
  uid: string;
  beginn: unknown;
  ende: unknown;
  titel: unknown;
  beschreibung?: unknown;
  /** Ort oder Zugangslink — Kalender machen daraus meist einen Klick. */
  ort?: unknown;
  organisatorName?: unknown;
  organisatorMail?: unknown;
  /** Hochzählen, wenn sich etwas geändert hat. 0 ist der Erstversand. */
  sequenz?: number;
  /** Bei einer Absage: der Kalender streicht den Eintrag durch. */
  abgesagt?: boolean;
};

/** ISO-Zeit -> 20260922T120000Z (immer UTC, das versteht jeder Kalender). */
export function icsZeit(iso: unknown): string {
  const t = new Date(String(iso ?? '')).getTime();
  if (!Number.isFinite(t)) return '';
  return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Sonderzeichen maskieren. Reihenfolge ist wichtig: der Backslash ZUERST,
 * sonst maskiert man die eigenen Maskierungen gleich wieder mit.
 */
export function icsText(roh: unknown): string {
  return String(roh ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Länge in Oktett, nicht in Zeichen — ein „ä" zählt doppelt. */
function oktett(s: string): number {
  let n = 0;
  for (const z of s) {
    const c = z.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/**
 * Eine Zeile auf 75 Oktett falten. Folgezeilen beginnen mit einem Leerzeichen.
 * Gefaltet wird nie mitten in einem Zeichen — deshalb wird Zeichen für Zeichen
 * gezählt und nicht einfach nach 75 Stellen geschnitten.
 */
export function falte(zeile: string): string[] {
  const s = String(zeile ?? '');
  if (oktett(s) <= 75) return [s];
  const aus: string[] = [];
  let teil = '';
  let breite = 0;
  let erste = true;
  for (const z of s) {
    const b = oktett(z);
    // Folgezeilen tragen ein führendes Leerzeichen, das mitzählt.
    const grenze = erste ? 75 : 74;
    if (breite + b > grenze) {
      aus.push(erste ? teil : ' ' + teil);
      erste = false;
      teil = '';
      breite = 0;
    }
    teil += z;
    breite += b;
  }
  if (teil) aus.push(erste ? teil : ' ' + teil);
  return aus;
}

/**
 * Der vollständige Inhalt einer .ics-Datei für EINEN Termin.
 * Fehlt Beginn oder Ende, kommt eine leere Zeichenkette zurück — ein
 * Kalendereintrag ohne Zeit ist schlimmer als keiner.
 */
export function icsTermin(t: IcsTermin, jetzt: unknown = new Date().toISOString()): string {
  const beginn = icsZeit(t.beginn);
  const ende = icsZeit(t.ende);
  const uid = String(t.uid ?? '').trim();
  if (!beginn || !ende || !uid) return '';

  const stempel = icsZeit(jetzt) || icsZeit(new Date().toISOString());
  const zeilen: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ARGONAUT OS//Webinar//DE',
    'CALSCALE:GREGORIAN',
    t.abgesagt ? 'METHOD:CANCEL' : 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsText(uid)}`,
    `DTSTAMP:${stempel}`,
    `DTSTART:${beginn}`,
    `DTEND:${ende}`,
    `SEQUENCE:${Math.max(0, Math.floor(Number(t.sequenz)) || 0)}`,
    `SUMMARY:${icsText(t.titel)}`,
  ];
  if (String(t.beschreibung ?? '').trim()) zeilen.push(`DESCRIPTION:${icsText(t.beschreibung)}`);
  if (String(t.ort ?? '').trim()) zeilen.push(`LOCATION:${icsText(t.ort)}`);
  if (String(t.organisatorMail ?? '').trim()) {
    const name = String(t.organisatorName ?? '').trim();
    zeilen.push(`ORGANIZER${name ? `;CN=${icsText(name)}` : ''}:mailto:${String(t.organisatorMail).trim()}`);
  }
  zeilen.push(t.abgesagt ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED');
  zeilen.push('TRANSP:OPAQUE');
  zeilen.push('END:VEVENT', 'END:VCALENDAR');

  const gefaltet: string[] = [];
  for (const z of zeilen) for (const teil of falte(z)) gefaltet.push(teil);
  // CRLF, und am Ende noch eins — manche Programme verlangen den Abschluss.
  return gefaltet.join('\r\n') + '\r\n';
}

/** Dateiname entschärfen: keine Pfadtrenner, keine Umlaute, nie leer. */
export function icsDateiname(titel: unknown): string {
  const n = String(titel ?? '').trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return `${n || 'Termin'}.ics`;
}

/** Fertiger Anhang für sendeMail — passt auf den Typ MailAnhang aus lib/mail. */
export function icsAnhang(
  t: IcsTermin, jetzt?: unknown,
): { dateiname: string; inhalt: string; typ: string } | null {
  const inhalt = icsTermin(t, jetzt);
  if (!inhalt) return null;
  return {
    dateiname: icsDateiname(t.titel),
    inhalt,
    // Ohne „method=PUBLISH" behandelt Outlook die Datei als Einladung.
    typ: 'text/calendar; charset=utf-8; method=PUBLISH',
  };
}
