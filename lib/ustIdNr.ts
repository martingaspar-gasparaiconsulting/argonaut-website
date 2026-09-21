// lib/ustIdNr.ts
// ============================================================================
// UMSATZSTEUER-IDENTIFIKATIONSNUMMER (Punkt 58 / R8, 21.09.2026)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Die USt-IdNr. wird im Haus an SECHZEHN Stellen VERWENDET — in den
// PDF-Fusszeilen (angebot-pdf, aboRechnungPdf, auftragsbestaetigung), im
// ZUGFeRD-XML als SpecifiedTaxRegistration schemeID="VA", beim Auslesen
// fremder E-Rechnungen — und an KEINER EINZIGEN geprueft. Nicht die
// Pruefziffer, nicht das Format, nicht einmal das Laenderkennzeichen.
//
// Der Validator verlangt zwar eine (BR-CO-26), nimmt aber jede Zeichenfolge:
// "keine" oder "folgt noch" haetten ihn genauso zufriedengestellt.
//
// ▄▄▄ DER UNTERSCHIED, AUF DEN ES STEUERLICH ANKOMMT ▄▄▄
// Diese Datei prueft das FORMAT. Das ist etwas ganz anderes als der Nachweis,
// den das Finanzamt sehen will:
//
//   FORMAT (hier)          — Sieht die Nummer aus wie eine USt-IdNr. dieses
//                            Landes, und stimmt bei DE die Pruefziffer?
//                            Faengt Tippfehler und Zahlendreher. Sofort,
//                            ohne Netz, ohne Wartezeit.
//
//   EINFACHE ABFRAGE       — § 18e Nr. 1 UStG: existiert die Nummer?
//   (BZSt)                   Sagt NICHTS darueber, wem sie gehoert.
//
//   QUALIFIZIERTE ABFRAGE  — § 18e Nr. 2 UStG: existiert sie UND gehoeren
//   (BZSt)                   Name, Ort, PLZ und Strasse dazu? NUR diese
//                            Abfrage, zusammen mit der Aufzeichnung des
//                            Ergebnisses, traegt die Steuerfreiheit einer
//                            innergemeinschaftlichen Lieferung.
//
// Eine bestandene Formatpruefung ist also KEIN Nachweis. Diese Datei sagt
// das an jeder Stelle, an der es zaehlt — damit niemand aus einem gruenen
// Haken schliesst, die Lieferung sei abgesichert.
//
// ▄▄▄ WAS HIER NICHT DRIN IST ▄▄▄
// Der Abruf beim BZSt selbst. Der braucht Netz und gehoert in eine Route,
// nicht in eine Formel-Datei. Diese Datei bereitet ihn vor (welche Felder,
// welche Art von Abfrage) und wertet sein Ergebnis aus.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln.
// Node-getestet: tests/ustIdNrP58.test.mjs
// ============================================================================

/** Die EU-Mitgliedstaaten plus XI (Nordirland, Warenlieferungen nach dem Protokoll). */
export const EU_LAENDER = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI',
] as const;
export type EuLand = (typeof EU_LAENDER)[number];

/**
 * Laenderweise Muster. GRIECHENLAND heisst hier EL, nicht GR — das ist der
 * haeufigste Irrtum, und eine griechische Nummer mit GR davor wird von jedem
 * Pruefdienst abgelehnt.
 */
const MUSTER: Record<EuLand, RegExp> = {
  AT: /^U[0-9]{8}$/,
  BE: /^[01][0-9]{9}$/,
  BG: /^[0-9]{9,10}$/,
  CY: /^[0-9]{8}[A-Z]$/,
  CZ: /^[0-9]{8,10}$/,
  DE: /^[0-9]{9}$/,
  DK: /^[0-9]{8}$/,
  EE: /^[0-9]{9}$/,
  EL: /^[0-9]{9}$/,
  ES: /^[A-Z0-9][0-9]{7}[A-Z0-9]$/,
  FI: /^[0-9]{8}$/,
  FR: /^[A-Z0-9]{2}[0-9]{9}$/,
  HR: /^[0-9]{11}$/,
  HU: /^[0-9]{8}$/,
  IE: /^([0-9]{7}[A-Z]{1,2}|[0-9][A-Z0-9+*][0-9]{5}[A-Z])$/,
  IT: /^[0-9]{11}$/,
  LT: /^([0-9]{9}|[0-9]{12})$/,
  LU: /^[0-9]{8}$/,
  LV: /^[0-9]{11}$/,
  MT: /^[0-9]{8}$/,
  NL: /^[0-9]{9}B[0-9]{2}$/,
  PL: /^[0-9]{10}$/,
  PT: /^[0-9]{9}$/,
  RO: /^[0-9]{2,10}$/,
  SE: /^[0-9]{12}$/,
  SI: /^[0-9]{8}$/,
  SK: /^[0-9]{10}$/,
  XI: /^([0-9]{9}|[0-9]{12}|(GD|HA)[0-9]{3})$/,
};

/** Laender, fuer die hier auch die Pruefziffer gerechnet wird. */
export const MIT_PRUEFZIFFER: EuLand[] = ['DE'];

export type UstIdGrund =
  | 'ok'
  | 'leer'
  | 'kein-laenderkennzeichen'
  | 'land-nicht-eu'
  | 'format-falsch'
  | 'pruefziffer-falsch';

export interface UstIdErgebnis {
  /** Format (und bei DE die Pruefziffer) sind in Ordnung. KEIN Existenznachweis. */
  formatOk: boolean;
  grund: UstIdGrund;
  /** Normalisiert: ohne Leerzeichen und Punkte, in Grossbuchstaben. */
  normalisiert: string;
  land: string;
  /** Wurde die Pruefziffer wirklich gerechnet? Bei den meisten Laendern nein. */
  pruefzifferGerechnet: boolean;
  klartext: string;
}

/** Leerzeichen, Punkte und Bindestriche raus, alles gross. */
export function normalisiere(wert: unknown): string {
  return String(wert ?? '').replace(/[\s.\-/]/g, '').toUpperCase();
}

/**
 * Pruefziffer der deutschen USt-IdNr. nach ISO 7064 MOD 11,10.
 *
 * Faengt genau das, was beim Abtippen passiert: eine falsche Ziffer und den
 * Zahlendreher. Am echten Verfahren gegengeprueft — vier gueltige Nummern
 * bestehen, drei Verdreher fallen durch (siehe Tests).
 */
export function pruefzifferDe(neunZiffern: string): boolean {
  if (!/^[0-9]{9}$/.test(neunZiffern)) return false;
  let p = 10;
  for (let i = 0; i < 8; i++) {
    const z = Number(neunZiffern[i]);
    let m = (z + p) % 10;
    if (m === 0) m = 10;
    p = (2 * m) % 11;
  }
  let pz = 11 - p;
  if (pz === 10) pz = 0;
  return pz === Number(neunZiffern[8]);
}

/**
 * Prueft eine USt-IdNr. auf Format und — wo moeglich — Pruefziffer.
 *
 * DAS LAENDERKENNZEICHEN IST PFLICHT (BR-CO-9 der EN 16931). Eine Nummer
 * ohne Praefix wird NICHT stillschweigend um "DE" ergaenzt: eine
 * neunstellige Zahl kann auch estnisch, griechisch oder portugiesisch sein,
 * und ein geratenes Land macht aus einer gueltigen Nummer eine falsche.
 */
export function pruefeUstIdNr(wert: unknown): UstIdErgebnis {
  const n = normalisiere(wert);
  const leer = { formatOk: false, normalisiert: n, land: '', pruefzifferGerechnet: false };

  if (!n) {
    return { ...leer, grund: 'leer', klartext: 'Es ist keine USt-IdNr. eingetragen.' };
  }
  if (!/^[A-Z]{2}/.test(n)) {
    return {
      ...leer, grund: 'kein-laenderkennzeichen',
      klartext: 'Der USt-IdNr. fehlt das Laenderkennzeichen (z. B. DE). Es wird nicht ergaenzt — eine neunstellige Zahl koennte auch zu einem anderen Land gehoeren.',
    };
  }
  const land = n.slice(0, 2);
  const rest = n.slice(2);

  if (!(EU_LAENDER as readonly string[]).includes(land)) {
    const griechisch = land === 'GR'
      ? ' Fuer Griechenland lautet das Kennzeichen EL, nicht GR.'
      : '';
    return {
      formatOk: false, grund: 'land-nicht-eu', normalisiert: n, land, pruefzifferGerechnet: false,
      klartext: `"${land}" ist kein Laenderkennzeichen der EU.${griechisch}`,
    };
  }
  const l = land as EuLand;
  if (!MUSTER[l].test(rest)) {
    return {
      formatOk: false, grund: 'format-falsch', normalisiert: n, land, pruefzifferGerechnet: false,
      klartext: `Die Nummer passt nicht zum Aufbau einer USt-IdNr. aus ${land}.`,
    };
  }
  if (l === 'DE' && !pruefzifferDe(rest)) {
    return {
      formatOk: false, grund: 'pruefziffer-falsch', normalisiert: n, land, pruefzifferGerechnet: true,
      klartext: 'Die Pruefziffer stimmt nicht. Das deutet auf einen Tippfehler oder Zahlendreher hin.',
    };
  }
  const gerechnet = MIT_PRUEFZIFFER.includes(l);
  return {
    formatOk: true, grund: 'ok', normalisiert: n, land, pruefzifferGerechnet: gerechnet,
    klartext: gerechnet
      ? 'Aufbau und Pruefziffer stimmen. Das ist KEIN Nachweis, dass die Nummer vergeben ist — dafuer braucht es die Bestaetigungsabfrage beim BZSt.'
      : `Der Aufbau passt zu ${land}. Die Pruefziffer wird fuer dieses Land hier nicht gerechnet, und der Aufbau allein ist kein Nachweis — dafuer braucht es die Bestaetigungsabfrage beim BZSt.`,
  };
}

// ─── Die Bestaetigungsabfrage beim BZSt (§ 18e UStG) ───

export type Abfrageart = 'einfach' | 'qualifiziert';

export interface AbfrageAuftrag {
  art: Abfrageart;
  /** Die eigene Nummer des Anfragenden — ohne sie nimmt das BZSt keine Abfrage an. */
  eigeneUstIdNr: string;
  /** Die zu pruefende Nummer. */
  fremdeUstIdNr: string;
  /** Nur bei der qualifizierten Abfrage: die Angaben, die bestaetigt werden sollen. */
  firmenname?: string;
  ort?: string;
  plz?: string;
  strasse?: string;
}

/**
 * Baut den Auftrag fuer die Bestaetigungsabfrage — und entscheidet, WELCHE
 * Art gebraucht wird.
 *
 * Fuer eine steuerfreie innergemeinschaftliche Lieferung reicht die einfache
 * Abfrage NICHT. Verlangt wird die qualifizierte, samt Aufzeichnung des
 * Ergebnisses; sie ist Teil des Buch- und Belegnachweises.
 *
 * Gibt null zurueck, wenn eine der beiden Nummern das Format nicht besteht —
 * das BZSt wuerde die Abfrage ohnehin ablehnen, und ein Fehlversuch sieht im
 * Protokoll aus wie eine gescheiterte Pruefung.
 */
export function baueAbfrage(
  eigene: unknown,
  fremde: unknown,
  fuerSteuerfreieLieferung: boolean,
  angaben?: { firmenname?: unknown; ort?: unknown; plz?: unknown; strasse?: unknown },
): AbfrageAuftrag | null {
  const e = pruefeUstIdNr(eigene);
  const f = pruefeUstIdNr(fremde);
  if (!e.formatOk || !f.formatOk) return null;

  const art: Abfrageart = fuerSteuerfreieLieferung ? 'qualifiziert' : 'einfach';
  const auftrag: AbfrageAuftrag = { art, eigeneUstIdNr: e.normalisiert, fremdeUstIdNr: f.normalisiert };
  if (art === 'qualifiziert') {
    auftrag.firmenname = String(angaben?.firmenname ?? '').trim();
    auftrag.ort = String(angaben?.ort ?? '').trim();
    auftrag.plz = String(angaben?.plz ?? '').trim();
    auftrag.strasse = String(angaben?.strasse ?? '').trim();
  }
  return auftrag;
}

/** Was das BZSt je Angabe zurueckmeldet: A = stimmt ueberein, B = nicht, C/D = nicht geprueft. */
export type BzstMerkmal = 'A' | 'B' | 'C' | 'D';

export interface BzstAntwort {
  /** Rueckmeldecode des BZSt. 200 = Nummer ist gueltig. */
  code: string;
  name?: BzstMerkmal;
  ort?: BzstMerkmal;
  plz?: BzstMerkmal;
  strasse?: BzstMerkmal;
}

export interface AbfrageBefund {
  nummerGueltig: boolean;
  /** Alle abgefragten Angaben mit "A" bestaetigt? Nur dann traegt der Nachweis. */
  angabenBestaetigt: boolean;
  /** Taugt das Ergebnis als Nachweis fuer eine steuerfreie ig. Lieferung? */
  alsNachweisGeeignet: boolean;
  abweichungen: string[];
  klartext: string;
}

/**
 * Wertet die Antwort des BZSt aus.
 *
 * DER PUNKT, AN DEM ES IN DER PRAXIS SCHIEFGEHT: Der Code 200 heisst nur,
 * dass die NUMMER gueltig ist. Kommt bei einer qualifizierten Abfrage
 * gleichzeitig ein "B" beim Namen zurueck, gehoert die gueltige Nummer einem
 * ANDEREN — und der Nachweis traegt nicht. Wer nur auf den Code schaut,
 * haelt genau diesen Fall fuer bestanden.
 */
export function werteAbfrageAus(antwort: BzstAntwort, art: Abfrageart): AbfrageBefund {
  const gueltig = String(antwort?.code ?? '').trim() === '200';
  if (!gueltig) {
    return {
      nummerGueltig: false, angabenBestaetigt: false, alsNachweisGeeignet: false, abweichungen: [],
      klartext: `Das BZSt meldet Ruecknummer ${antwort?.code ?? '(keine)'} — die USt-IdNr. ist nicht gueltig. Die Lieferung darf nicht als steuerfrei behandelt werden.`,
    };
  }
  if (art === 'einfach') {
    return {
      nummerGueltig: true, angabenBestaetigt: false, alsNachweisGeeignet: false, abweichungen: [],
      klartext: 'Die Nummer ist gueltig. Das war die EINFACHE Abfrage — sie sagt nichts darueber, wem die Nummer gehoert, und traegt keine steuerfreie Lieferung.',
    };
  }
  const felder: Array<[keyof BzstAntwort, string]> = [
    ['name', 'Firmenname'], ['ort', 'Ort'], ['plz', 'PLZ'], ['strasse', 'Strasse'],
  ];
  const abweichungen: string[] = [];
  for (const [schluessel, label] of felder) {
    const m = antwort[schluessel] as BzstMerkmal | undefined;
    if (m === 'B') abweichungen.push(`${label}: stimmt NICHT ueberein`);
    else if (m === 'C' || m === 'D') abweichungen.push(`${label}: nicht geprueft (${m})`);
  }
  const bestaetigt = abweichungen.length === 0 && antwort.name === 'A';
  return {
    nummerGueltig: true,
    angabenBestaetigt: bestaetigt,
    alsNachweisGeeignet: bestaetigt,
    abweichungen,
    klartext: bestaetigt
      ? 'Nummer gueltig und alle Angaben bestaetigt. Das Ergebnis mit Datum aufbewahren — es ist Teil des Nachweises fuer die steuerfreie Lieferung.'
      : `Die NUMMER ist zwar gueltig, aber die Angaben wurden nicht vollstaendig bestaetigt (${abweichungen.join(' · ')}). Der Nachweis traegt damit NICHT. Vor einer steuerfreien Lieferung klaeren, wem die Nummer gehoert.`,
  };
}

export type UstIdHinweis = { feld: 'nummer' | 'abfrage' | 'nachweis'; text: string };

/**
 * Was vor einer innergemeinschaftlichen Lieferung vorliegen muss.
 * Blockiert nichts.
 */
export function pruefeVorLieferung(
  fremdeUstIdNr: unknown,
  eigeneUstIdNr: unknown,
  letzteQualifizierteAbfrage?: { am: unknown; bestaetigt: boolean },
): UstIdHinweis[] {
  const hinweise: UstIdHinweis[] = [];
  const f = pruefeUstIdNr(fremdeUstIdNr);
  const e = pruefeUstIdNr(eigeneUstIdNr);

  if (!f.formatOk) hinweise.push({ feld: 'nummer', text: `USt-IdNr. des Kunden: ${f.klartext}` });
  if (!e.formatOk) hinweise.push({ feld: 'nummer', text: `Eigene USt-IdNr.: ${e.klartext} Ohne sie nimmt das BZSt keine Abfrage an.` });

  if (!letzteQualifizierteAbfrage) {
    hinweise.push({
      feld: 'abfrage',
      text: 'Es liegt keine qualifizierte Bestaetigungsabfrage vor (§ 18e Nr. 2 UStG). Fuer eine steuerfreie innergemeinschaftliche Lieferung gehoert sie zum Nachweis — die einfache Abfrage genuegt dafuer nicht.',
    });
    return hinweise;
  }
  if (!letzteQualifizierteAbfrage.bestaetigt) {
    hinweise.push({
      feld: 'nachweis',
      text: 'Die letzte qualifizierte Abfrage wurde NICHT bestaetigt. Bis das geklaert ist, traegt der Nachweis fuer eine steuerfreie Lieferung nicht.',
    });
  }
  return hinweise;
}
