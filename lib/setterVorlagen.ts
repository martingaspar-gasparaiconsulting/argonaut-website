// ============================================================================
// ARGONAUT OS · lib/setterVorlagen.ts — G3 Push 3: fertige Gespräche je Gewerk
//
// Der Kunde stellt nichts ein. Also stellt es der Betreiber ein — und zwar
// nicht jedes Mal von Null. Ein Dachdecker braucht andere Fragen als ein
// Steuerberater, aber ALLE Dachdecker brauchen dieselben. Hier stehen sie.
//
// Bewusst NICHT an lib/branchen.ts (202 KB, 205 Branchen) gekoppelt: Für die
// Gesprächsführung zählt nicht die Branche, sondern die ART des Geschäfts.
// „Wir kommen zu Ihnen und reparieren etwas" ist für Dachdecker, Sanitär und
// Elektro dasselbe Gespräch. Acht Vorlagen decken damit fast alles ab — und
// jede lässt sich danach von Hand anpassen.
//
// WAS HIER BEWUSST NICHT GEFRAGT WIRD
// Kein Symptom, keine Diagnose, keine Krankenkasse, keine Zahlungsdaten. Ein
// öffentlicher Chatbot, der so etwas abfragt, sammelt besondere Kategorien
// personenbezogener Daten (Art. 9 DSGVO) über einen Weg, auf dem niemand
// wirksam einwilligt. `heikleFragen()` warnt, wenn jemand so etwas von Hand
// nachträgt.
//
// Keine Imports außer Typen, keine Hooks — node-testbar.
// ============================================================================

import type { Frage, Ziel } from './setter';

export type Vorlage = {
  schluessel: string;
  name: string;
  /** Ein Satz für den Betreiber: Wann passt diese Vorlage? */
  beschreibung: string;
  ziel: Ziel;
  fragen: Frage[];
  uebergabeBei?: string[];
};

/** Immer als letztes: ohne Name und Rückweg ist das Gespräch wertlos. */
const ABSCHLUSS: Frage[] = [
  { schluessel: 'name', frage: 'Wie ist Ihr Name?', pflicht: true },
  { schluessel: 'kontakt', frage: 'Wie erreichen wir Sie am besten — E-Mail oder Telefon?', pflicht: true },
];

export const VORLAGEN: Vorlage[] = [
  {
    schluessel: 'handwerk',
    name: 'Handwerk vor Ort',
    beschreibung: 'Dach, Sanitär, Elektro, Maler, Garten — der Betrieb fährt zum Kunden.',
    ziel: 'termin',
    fragen: [
      { schluessel: 'anliegen', frage: 'Worum geht es genau — was soll gemacht werden?', pflicht: true },
      { schluessel: 'ort', frage: 'In welchem Ort oder Postleitzahlgebiet liegt das Objekt?', pflicht: true },
      { schluessel: 'dringlichkeit', frage: 'Eilt es, oder haben wir etwas Zeit?' },
      ...ABSCHLUSS,
    ],
  },
  {
    schluessel: 'notdienst',
    name: 'Notdienst',
    beschreibung: 'Wasserschaden, Heizungsausfall, Schlüsseldienst — Tempo vor Vollständigkeit.',
    ziel: 'rueckruf',
    fragen: [
      { schluessel: 'anliegen', frage: 'Was ist passiert?', pflicht: true },
      { schluessel: 'ort', frage: 'Wo genau — Ort und Straße?', pflicht: true },
      { schluessel: 'kontakt', frage: 'Unter welcher Telefonnummer erreichen wir Sie sofort?', pflicht: true },
      { schluessel: 'name', frage: 'Und Ihr Name?', pflicht: true },
    ],
    // Bei einem Notfall wird nicht weiter abgefragt — da muss jemand ans Telefon.
    uebergabeBei: ['notfall', 'dringend', 'sofort', 'gefahr', 'brennt', 'läuft aus', 'laeuft aus'],
  },
  {
    schluessel: 'beratung',
    name: 'Beratung & Dienstleistung',
    beschreibung: 'Steuer, Recht, IT, Agentur, Coaching — es beginnt mit einem Erstgespräch.',
    ziel: 'termin',
    fragen: [
      { schluessel: 'anliegen', frage: 'Womit können wir Sie unterstützen?', pflicht: true },
      { schluessel: 'unternehmen', frage: 'Für welches Unternehmen fragen Sie an — oder privat?' },
      ...ABSCHLUSS,
    ],
  },
  {
    schluessel: 'praxis',
    name: 'Praxis & Termin',
    beschreibung: 'Physio, Zahnarzt, Tierarzt, Kosmetik. Fragt bewusst NICHT nach Beschwerden.',
    ziel: 'termin',
    fragen: [
      { schluessel: 'anliegen', frage: 'Was für einen Termin möchten Sie vereinbaren?', pflicht: true },
      { schluessel: 'wunschzeit', frage: 'Wann würde es Ihnen am besten passen?' },
      ...ABSCHLUSS,
    ],
    uebergabeBei: ['schmerzen', 'notfall', 'dringend'],
  },
  {
    schluessel: 'gastro',
    name: 'Gastronomie & Feier',
    beschreibung: 'Restaurant, Catering, Location — Anlass, Datum, wie viele Personen.',
    ziel: 'anfrage',
    fragen: [
      { schluessel: 'anlass', frage: 'Um welchen Anlass geht es?', pflicht: true },
      { schluessel: 'datum', frage: 'An welchem Tag ist es geplant?', pflicht: true },
      { schluessel: 'personen', frage: 'Mit wie vielen Personen rechnen Sie?', pflicht: true },
      ...ABSCHLUSS,
    ],
  },
  {
    schluessel: 'kfz',
    name: 'Kfz & Werkstatt',
    beschreibung: 'Werkstatt, Reifen, Lack — welches Fahrzeug, was soll gemacht werden.',
    ziel: 'termin',
    fragen: [
      { schluessel: 'fahrzeug', frage: 'Um welches Fahrzeug geht es — Marke, Modell, Baujahr?', pflicht: true },
      { schluessel: 'anliegen', frage: 'Was sollen wir machen?', pflicht: true },
      ...ABSCHLUSS,
    ],
  },
  {
    schluessel: 'immobilien',
    name: 'Immobilien',
    beschreibung: 'Makler, Hausverwaltung — kaufen, mieten oder verkaufen.',
    ziel: 'termin',
    fragen: [
      { schluessel: 'anliegen', frage: 'Möchten Sie kaufen, mieten oder verkaufen?', pflicht: true },
      { schluessel: 'objekt', frage: 'Um welche Art von Objekt geht es — und in welcher Lage?', pflicht: true },
      ...ABSCHLUSS,
    ],
  },
  {
    schluessel: 'handel',
    name: 'Handel & Shop',
    beschreibung: 'Ladengeschäft oder Onlineshop — welches Produkt, welche Menge.',
    ziel: 'anfrage',
    fragen: [
      { schluessel: 'produkt', frage: 'Für welches Produkt interessieren Sie sich?', pflicht: true },
      { schluessel: 'menge', frage: 'In welcher Menge oder Größe brauchen Sie es?' },
      ...ABSCHLUSS,
    ],
  },
];

export function vorlage(schluessel: string | null | undefined): Vorlage | null {
  const s = String(schluessel ?? '').trim().toLowerCase();
  return VORLAGEN.find((v) => v.schluessel === s) ?? null;
}

// ---------------------------------------------------------------------------
// Prüfung, bevor etwas in die Datenbank geht
// ---------------------------------------------------------------------------

/** Schlüssel, die die Gesprächs-Mechanik selbst benutzt. */
export const GESPERRTE_SCHLUESSEL = ['_lead'];

export const MAX_FRAGEN = 12;

/**
 * Räumt auf, BEVOR geprüft wird: Leerzeichen weg, Schlüssel klein.
 *
 * Ein Betreiber, der „Anliegen" tippt, soll keine Fehlermeldung bekommen —
 * er soll `anliegen` gespeichert bekommen. Was hier nicht zu retten ist,
 * fängt danach `pruefeFragen()`.
 */
export function normalisiereFragen(fragen: readonly Frage[] | null | undefined): Frage[] {
  return (Array.isArray(fragen) ? fragen : []).map((f) => ({
    schluessel: String(f?.schluessel ?? '').trim().toLowerCase(),
    frage: String(f?.frage ?? '').trim(),
    pflicht: f?.pflicht === true,
  }));
}

/**
 * Harte Fehler. Eine leere Liste heißt: darf gespeichert werden.
 *
 * Der Schlüssel ist kein Anzeigetext, sondern der Name, unter dem die Antwort
 * gemerkt wird — er muss zur Markierung passen (keine Semikolon, keine
 * Gleichheitszeichen, keine Klammern), sonst zerlegt er das Gedächtnis.
 *
 * Geprüft wird der Schlüssel, wie er DASTEHT. Wer Grossbuchstaben glattziehen
 * will, ruft vorher `normalisiereFragen()` — sonst wäre die Prüfung eine
 * Attrappe, die etwas anderes durchwinkt, als hinterher gespeichert wird.
 */
export function pruefeFragen(fragen: readonly Frage[] | null | undefined): string[] {
  const liste = Array.isArray(fragen) ? fragen : [];
  const fehler: string[] = [];

  if (!liste.length) return ['Mindestens eine Frage wird gebraucht.'];
  if (liste.length > MAX_FRAGEN) fehler.push(`Höchstens ${MAX_FRAGEN} Fragen — sonst wird es ein Verhör.`);

  const gesehen = new Set<string>();
  for (const [i, f] of liste.entries()) {
    const nr = i + 1;
    const s = String(f?.schluessel ?? '').trim();
    const t = String(f?.frage ?? '').trim();

    // Die Sperrliste steht VOR der Formatprüfung. Sonst wäre sie toter Code:
    // `_lead` scheitert schon am Format, und ein später ergänzter gesperrter
    // Schlüssel ohne Unterstrich käme nie bei ihr an.
    if (!s) fehler.push(`Frage ${nr}: Der Schlüssel fehlt.`);
    else if (GESPERRTE_SCHLUESSEL.includes(s.toLowerCase())) {
      fehler.push(`Frage ${nr}: „${s}" ist für die Technik reserviert.`);
    } else if (!/^[a-z][a-z0-9_]{0,29}$/.test(s)) {
      fehler.push(`Frage ${nr}: Der Schlüssel „${s}" darf nur Kleinbuchstaben, Ziffern und _ enthalten und muss mit einem Buchstaben beginnen.`);
    } else if (gesehen.has(s)) {
      fehler.push(`Frage ${nr}: Den Schlüssel „${s}" gibt es schon — die zweite Antwort würde die erste überschreiben.`);
    }
    if (s) gesehen.add(s);

    if (!t) fehler.push(`Frage ${nr}: Der Fragetext fehlt.`);
    else if (t.length > 200) fehler.push(`Frage ${nr}: Der Fragetext ist zu lang (${t.length} Zeichen, erlaubt sind 200).`);
  }

  if (!liste.some((f) => f?.pflicht)) {
    fehler.push('Mindestens eine Frage muss eine Pflichtfrage sein — sonst gilt das Gespräch sofort als fertig.');
  }
  return fehler;
}

/**
 * Weiche Warnungen. Kein Verbot — der Betreiber sieht sie und entscheidet.
 *
 * Ein öffentlicher Chatbot ohne Login ist der falsche Ort für Gesundheits-
 * und Zahlungsdaten: Der Besucher willigt dort in nichts wirksam ein, und die
 * Antworten landen anschließend im CRM.
 */
export function heikleFragen(fragen: readonly Frage[] | null | undefined): string[] {
  const warnungen: string[] = [];
  const felder: Array<{ woerter: string[]; text: string }> = [
    {
      woerter: ['gesundheit', 'krankheit', 'symptom', 'beschwerde', 'diagnose', 'medikament', 'schwanger',
        'krankenkasse', 'versichertennummer', 'behandlung', 'allergie'],
      text: 'Gesundheitsdaten (Art. 9 DSGVO) gehören nicht in einen offenen Chat — die Frage besser im persönlichen Gespräch stellen.',
    },
    {
      woerter: ['iban', 'kontonummer', 'kreditkarte', 'bankverbindung', 'zahlungsdaten', 'bic'],
      text: 'Zahlungsdaten gehören nicht in einen Chat, der als Text im Verlauf steht.',
    },
    {
      woerter: ['ausweis', 'personalausweis', 'steuernummer', 'steuer-id', 'sozialversicherung', 'geburtsdatum'],
      text: 'Ausweis- und Identifikationsnummern sollten nicht über den Chat erfasst werden.',
    },
  ];

  for (const f of Array.isArray(fragen) ? fragen : []) {
    const text = `${String(f?.schluessel ?? '')} ${String(f?.frage ?? '')}`.toLowerCase();
    for (const feld of felder) {
      if (feld.woerter.some((w) => text.includes(w))) {
        const marke = `${String(f?.schluessel ?? '?')}|${feld.text}`;
        if (!warnungen.includes(marke)) warnungen.push(marke);
      }
    }
  }
  return warnungen.map((m) => {
    const i = m.indexOf('|');
    return `„${m.slice(0, i)}": ${m.slice(i + 1)}`;
  });
}
