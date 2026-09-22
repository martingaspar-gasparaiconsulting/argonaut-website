// ============================================================================
// ARGONAUT OS · lib/verarbeitungsverzeichnis.ts — Verzeichnis nach Art. 30 DSGVO
//
// ▄▄▄ WAS PUNKT 43 WIRKLICH IST (22.09.2026) ▄▄▄
// Am echten Code nachgesehen: Das Modul gibt es SEIT DEM 15.08. Die Seite
// app/dashboard/dsgvo/page.tsx hat alle neun Pflichtfelder aus Art. 30 Abs. 1.
// Punkt 43 heisst also NICHT "erstellen". Es fehlten drei Sachen:
//   1. Das leere Blatt. Ein Betrieb, der die Seite zum ersten Mal oeffnet,
//      sieht neun leere Felder und weiss nicht, was hineingehoert.
//   2. Der KOPF nach Art. 30 Abs. 1 lit. a — Verantwortlicher und
//      Datenschutzbeauftragter. Den gab es gar nicht; ein Verzeichnis ohne
//      Kopf ist unvollstaendig, egal wie gut die Eintraege sind.
//   3. Der Ausdruck. Art. 30 Abs. 4: das Verzeichnis ist der Aufsichtsbehoerde
//      auf Anfrage VORZULEGEN. Ohne Ausdruck mit Stand-Datum geht das nicht.
//
// ▄▄▄ WORTLAUT ▄▄▄
// Zweck und Rechtsgrundlage stehen hier als PLATZHALTER-Mustertexte. Die
// endgueltigen sechs kommen vom Anwalt (Punkt B8, Termin Anfang Oktober).
// Jeder Vorschlag ist ein VORSCHLAG: der Betrieb aendert ihn, bevor er ihn
// uebernimmt — und muss das auch, denn niemand kennt seinen Betrieb besser.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln, node-getestet.
// ============================================================================

/** Die neun Pflichtangaben nach Art. 30 Abs. 1 lit. b-g DSGVO, wie sie im Formular heissen. */
export interface VerfahrenVorschlag {
  /** Modul-Schluessel, der diesen Vorschlag ausloest. 'immer' = fuer jeden Betrieb. */
  wenn: string | 'immer';
  name: string;
  zweck: string;
  rechtsgrundlage: string;
  kategorien_betroffene: string;
  kategorien_daten: string;
  empfaenger: string;
  drittland: string;
  loeschfrist: string;
  tom: string;
}

/** Die Felder, die jeder Vorschlag tragen MUSS — der Waechter prueft darauf. */
export const PFLICHTFELDER = [
  'name', 'zweck', 'rechtsgrundlage', 'kategorien_betroffene', 'kategorien_daten',
  'empfaenger', 'drittland', 'loeschfrist', 'tom',
] as const;

/** Wiederkehrende Bausteine — einmal geschrieben, ueberall gleich. */
const TOM_STANDARD =
  'Zugriff nur mit persoenlichem Login und Rollenrechten; Verschluesselung bei Uebertragung (TLS) '
  + 'und im Ruhezustand; taegliche Sicherung; Protokollierung der Zugriffe; Auftragsverarbeitung '
  + 'nach Art. 28 DSGVO mit allen Dienstleistern.';
const KEIN_DRITTLAND = 'Keine Uebermittlung in ein Drittland.';
const EMPF_BASIS = 'IT-Dienstleister (Hosting, E-Mail-Versand) als Auftragsverarbeiter';

/**
 * DER VORSCHLAGS-KATALOG.
 * Ausgeloest wird ein Vorschlag durch ein aktives Modul — oder er gilt fuer
 * jeden Betrieb ('immer'). Die Modul-Schluessel sind dieselben wie in
 * lib/rechte.ts; ein Waechter-Test prueft, dass hier kein erfundener steht.
 */
export const VERFAHREN_KATALOG: VerfahrenVorschlag[] = [
  {
    wenn: 'immer',
    name: 'Kundenverwaltung und Geschaeftsanbahnung',
    zweck: 'Betreuung von Kunden und Interessenten, Abwicklung von Auftraegen, Beantwortung von Anfragen.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. b DSGVO (Vertrag oder vorvertragliche Massnahmen)',
    kategorien_betroffene: 'Kunden, Interessenten, Ansprechpartner bei Geschaeftskunden',
    kategorien_daten: 'Name, Anschrift, Telefon, E-Mail, Auftrags- und Kommunikationsdaten',
    empfaenger: EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: 'Handelsbriefe 6 Jahre (§ 257 HGB), danach Loeschung; reine Interessentendaten 3 Jahre nach letztem Kontakt.',
    tom: TOM_STANDARD,
  },
  {
    wenn: 'immer',
    name: 'Website und Kontaktformular',
    zweck: 'Bereitstellung der Website, Beantwortung von Anfragen ueber das Kontaktformular, Abwehr von Angriffen.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren Betrieb) und lit. b bei Anfragen',
    kategorien_betroffene: 'Besucher der Website, Anfragende',
    kategorien_daten: 'IP-Adresse, Zeitpunkt, aufgerufene Seite, Angaben aus dem Formular',
    empfaenger: 'Hosting-Anbieter als Auftragsverarbeiter',
    drittland: KEIN_DRITTLAND,
    loeschfrist: 'Server-Protokolle 7 Tage; Anfragen 6 Monate nach Erledigung, sofern kein Vertrag folgt.',
    tom: TOM_STANDARD,
  },
  {
    wenn: 'rechnungen',
    name: 'Rechnungsstellung und Buchfuehrung',
    zweck: 'Abrechnung erbrachter Leistungen, Erfuellung handels- und steuerrechtlicher Aufbewahrungspflichten.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. b DSGVO (Vertrag) und lit. c (rechtliche Verpflichtung, §§ 147 AO, 257 HGB)',
    kategorien_betroffene: 'Kunden, Lieferanten',
    kategorien_daten: 'Name, Anschrift, Leistungs- und Zahlungsdaten, Steuernummer bzw. USt-IdNr.',
    empfaenger: 'Steuerberater, Finanzbehoerden bei Pruefungen, ' + EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: 'Rechnungen und Buchungsbelege 10 Jahre (§ 147 Abs. 3 AO), danach Loeschung.',
    tom: TOM_STANDARD,
  },
  {
    wenn: 'mahnwesen',
    name: 'Forderungseinzug und Mahnwesen',
    zweck: 'Beitreibung offener Forderungen, Berechnung von Verzugszinsen, Vorbereitung gerichtlicher Schritte.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. b DSGVO (Vertrag) und lit. f (Durchsetzung eigener Anspruechhe)',
    kategorien_betroffene: 'Saeumige Kunden',
    kategorien_daten: 'Name, Anschrift, offene Betraege, Mahnstufe, Zahlungsverhalten',
    empfaenger: 'Rechtsanwalt oder Inkassodienstleister bei Beauftragung, ' + EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: 'Mit der zugrunde liegenden Rechnung: 10 Jahre (§ 147 Abs. 3 AO).',
    tom: TOM_STANDARD,
  },
  {
    wenn: 'zahlungen',
    name: 'Zahlungsverkehr und Lastschriften',
    zweck: 'Abwicklung von Zahlungen, Erstellung von SEPA-Dateien, Zuordnung von Kontoumsaetzen.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. b DSGVO (Vertrag); SEPA-Mandat als gesonderte Erklaerung',
    kategorien_betroffene: 'Zahlungspflichtige, Zahlungsempfaenger',
    kategorien_daten: 'Name, IBAN, BIC, Mandatsreferenz, Betrag, Verwendungszweck',
    empfaenger: 'Kreditinstitut des Betriebs, ' + EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: 'Mandate 14 Monate nach dem letzten Einzug; Zahlungsbelege 10 Jahre (§ 147 AO).',
    tom: TOM_STANDARD + ' Bankverbindungen sind nur den dafuer freigegebenen Personen zugaenglich.',
  },
  {
    wenn: 'mitglieder',
    name: 'Mitglieder- und Beitragsverwaltung',
    zweck: 'Verwaltung von Mitgliedschaften und wiederkehrenden Beitraegen, Einzug per Lastschrift.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. b DSGVO (Mitgliedschaftsverhaeltnis)',
    kategorien_betroffene: 'Mitglieder, Abonnenten',
    kategorien_daten: 'Name, Kontaktdaten, Beitrag, Laufzeit, IBAN, Mandatsdaten',
    empfaenger: 'Kreditinstitut des Betriebs, ' + EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: 'Beitragsbelege 10 Jahre (§ 147 AO); Stammdaten 3 Jahre nach Ende der Mitgliedschaft.',
    tom: TOM_STANDARD,
  },
  {
    wenn: 'personal',
    name: 'Personalverwaltung und Entgeltabrechnung',
    zweck: 'Durchfuehrung des Beschaeftigungsverhaeltnisses, Lohn- und Gehaltsabrechnung, Meldungen an Sozialversicherung und Finanzamt.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. b und lit. c DSGVO, § 26 Abs. 1 BDSG',
    kategorien_betroffene: 'Beschaeftigte, Auszubildende, Aushilfen',
    kategorien_daten: 'Stammdaten, Bankverbindung, Steuer-ID, Sozialversicherungsnummer, Entgeltdaten, Fehlzeiten',
    empfaenger: 'Steuerberater bzw. Lohnbuero, Sozialversicherungstraeger, Finanzamt, ' + EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: 'Lohnkonten 6 Jahre (§ 41 Abs. 1 EStG); Beitragsunterlagen bis Ende des auf die letzte Pruefung folgenden Jahres (§ 28f SGB IV).',
    tom: TOM_STANDARD + ' Personaldaten sind gesondert freizugeben und nicht Teil der allgemeinen Nutzung.',
  },
  {
    wenn: 'personal',
    name: 'Bewerbermanagement',
    zweck: 'Durchfuehrung von Bewerbungsverfahren und Auswahl von Beschaeftigten.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. b DSGVO, § 26 Abs. 1 BDSG (Begruendung eines Beschaeftigungsverhaeltnisses)',
    kategorien_betroffene: 'Bewerberinnen und Bewerber',
    kategorien_daten: 'Bewerbungsunterlagen, Lebenslauf, Zeugnisse, Kontaktdaten, Gespraechsnotizen',
    empfaenger: 'Am Auswahlverfahren beteiligte Personen im Betrieb, ' + EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: '6 Monate nach Abschluss des Verfahrens (Frist des § 15 Abs. 4 AGG); laenger nur mit Einwilligung fuer einen Bewerberpool.',
    tom: TOM_STANDARD,
  },
  {
    wenn: 'zeit-nachweis',
    name: 'Arbeitszeiterfassung',
    zweck: 'Erfassung der geleisteten Arbeitszeit, Einhaltung des Arbeitszeitgesetzes, Grundlage der Entgeltabrechnung.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. c DSGVO (§ 16 Abs. 2 ArbZG), § 26 Abs. 1 BDSG',
    kategorien_betroffene: 'Beschaeftigte',
    kategorien_daten: 'Beginn, Ende und Dauer der Arbeitszeit, Pausen, Zuordnung zu Auftraegen',
    empfaenger: 'Lohnbuero bzw. Steuerberater, ' + EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: '2 Jahre (§ 16 Abs. 2 Satz 2 ArbZG); soweit Grundlage der Abrechnung, 6 Jahre.',
    tom: TOM_STANDARD + ' Auswertungen erfolgen nicht zur Verhaltens- oder Leistungskontrolle.',
  },
  {
    wenn: 'marketing',
    name: 'Newsletter und Direktwerbung',
    zweck: 'Versand von Informationen und Angeboten an Interessenten und Kunden, Messung der Wirkung.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. a DSGVO (Einwilligung); bei Bestandskunden Art. 6 Abs. 1 lit. f i. V. m. § 7 Abs. 3 UWG',
    kategorien_betroffene: 'Abonnenten, Kunden, Interessenten',
    kategorien_daten: 'E-Mail-Adresse, Name, Anmeldezeitpunkt und -nachweis, Oeffnungs- und Klickdaten',
    empfaenger: 'Versanddienstleister fuer E-Mail als Auftragsverarbeiter',
    drittland: KEIN_DRITTLAND,
    loeschfrist: 'Bis zum Widerruf; der Nachweis der Einwilligung danach 3 Jahre zur Rechtsverteidigung.',
    tom: TOM_STANDARD + ' Jede Werbe-Mail traegt einen Abmeldeweg, der sofort wirkt.',
  },
  {
    wenn: 'termine',
    name: 'Terminvereinbarung',
    zweck: 'Vereinbarung, Bestaetigung und Erinnerung an Termine.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. b DSGVO (Vertrag oder vorvertragliche Massnahmen)',
    kategorien_betroffene: 'Kunden, Interessenten',
    kategorien_daten: 'Name, Kontaktdaten, Terminzeitpunkt, Anlass des Termins',
    empfaenger: EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: '2 Jahre nach dem Termin, soweit keine laengere Pflicht aus dem Auftrag folgt.',
    tom: TOM_STANDARD,
  },
  {
    wenn: 'kasse',
    name: 'Kassenfuehrung',
    zweck: 'Erfassung von Barumsaetzen, Erstellung von Belegen, Erfuellung der Aufzeichnungspflichten.',
    rechtsgrundlage: 'Art. 6 Abs. 1 lit. c DSGVO (§ 146a AO, GoBD)',
    kategorien_betroffene: 'Kunden, Kassenpersonal',
    kategorien_daten: 'Belegdaten, Zahlungsart, Bedienerkennung, Zeitstempel der TSE',
    empfaenger: 'Steuerberater, Finanzbehoerden bei Pruefungen, ' + EMPF_BASIS,
    drittland: KEIN_DRITTLAND,
    loeschfrist: '10 Jahre (§ 147 Abs. 3 AO), unveraenderbar aufzubewahren.',
    tom: TOM_STANDARD + ' Kassendaten sind nach der Festschreibung nicht mehr aenderbar.',
  },
];

/**
 * Welche Vorschlaege passen zu diesem Betrieb?
 * Grundlage sind die AKTIVEN Module. Ein Vorschlag erscheint hoechstens
 * einmal, auch wenn mehrere Module ihn ausloesen wuerden.
 */
export function vorschlaegeFuer(aktiveModule: Iterable<string> | null | undefined): VerfahrenVorschlag[] {
  const aktiv = new Set<string>();
  for (const m of aktiveModule || []) if (typeof m === 'string' && m) aktiv.add(m);
  const raus: VerfahrenVorschlag[] = [];
  const gesehen = new Set<string>();
  for (const v of VERFAHREN_KATALOG) {
    if (v.wenn !== 'immer' && !aktiv.has(v.wenn)) continue;
    if (gesehen.has(v.name)) continue;
    gesehen.add(v.name);
    raus.push(v);
  }
  return raus;
}

// ---------------------------------------------------------------------------
// DER KOPF — Art. 30 Abs. 1 lit. a
// ---------------------------------------------------------------------------

export interface VerzeichnisKopf {
  verantwortlicher: string;
  anschrift: string;
  telefon: string;
  email: string;
  dsbName: string;
  dsbKontakt: string;
}

export interface KopfProfil {
  firma_name?: string | null;
  firma_strasse?: string | null;
  firma_plz?: string | null;
  firma_ort?: string | null;
  firma_telefon?: string | null;
  firma_email?: string | null;
  dsb_name?: string | null;
  dsb_kontakt?: string | null;
}

function t(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

/** Baut den Kopf aus dem Betriebsprofil. Leere Felder bleiben leer — nie erfunden. */
export function verzeichnisKopf(p: KopfProfil | null | undefined): VerzeichnisKopf {
  const q = p || {};
  const ort = [t(q.firma_plz), t(q.firma_ort)].filter(Boolean).join(' ');
  return {
    verantwortlicher: t(q.firma_name),
    anschrift: [t(q.firma_strasse), ort].filter(Boolean).join(', '),
    telefon: t(q.firma_telefon),
    email: t(q.firma_email),
    dsbName: t(q.dsb_name),
    dsbKontakt: t(q.dsb_kontakt),
  };
}

/**
 * Was im Kopf noch fehlt — im Klartext, damit der Betrieb es ergaenzen kann.
 * Der Datenschutzbeauftragte ist NICHT fuer jeden Betrieb Pflicht (§ 38 BDSG:
 * in der Regel ab 20 Personen, die staendig personenbezogene Daten
 * verarbeiten). Deshalb wird er als Hinweis gefuehrt, nicht als Luecke.
 */
export function kopfLuecken(k: VerzeichnisKopf): string[] {
  const fehlt: string[] = [];
  if (!k.verantwortlicher) fehlt.push('Name des Verantwortlichen (Firmenname)');
  if (!k.anschrift) fehlt.push('Anschrift des Verantwortlichen');
  if (!k.email && !k.telefon) fehlt.push('Kontaktdaten (E-Mail oder Telefon)');
  return fehlt;
}

/** Ist ein Datenschutzbeauftragter benannt? Nur ein Hinweis, keine Luecke. */
export function hatDsb(k: VerzeichnisKopf): boolean {
  return !!(k.dsbName || k.dsbKontakt);
}

// ---------------------------------------------------------------------------
// DER AUSDRUCK — Art. 30 Abs. 4
// ---------------------------------------------------------------------------

export interface VerzeichnisEintrag {
  name: string;
  zweck?: string | null;
  rechtsgrundlage?: string | null;
  kategorien_betroffene?: string | null;
  kategorien_daten?: string | null;
  empfaenger?: string | null;
  drittland?: string | null;
  loeschfrist?: string | null;
  tom?: string | null;
}

export interface VerzeichnisDruckdaten {
  kopf: VerzeichnisKopf;
  /** 'YYYY-MM-DD' — das Stand-Datum gehoert auf jedes Blatt. */
  stand: string;
  eintraege: Array<{ name: string; zeilen: Array<{ label: string; wert: string }> }>;
  /** Felder, die in den Eintraegen fehlen — die Behoerde sieht sie sonst zuerst. */
  luecken: string[];
}

const FELD_LABEL: Array<[keyof VerzeichnisEintrag, string]> = [
  ['zweck', 'Zweck der Verarbeitung'],
  ['rechtsgrundlage', 'Rechtsgrundlage'],
  ['kategorien_betroffene', 'Kategorien betroffener Personen'],
  ['kategorien_daten', 'Kategorien personenbezogener Daten'],
  ['empfaenger', 'Kategorien von Empfaengern'],
  ['drittland', 'Uebermittlung in Drittlaender'],
  ['loeschfrist', 'Loeschfristen'],
  ['tom', 'Technisch-organisatorische Massnahmen'],
];

/**
 * Bereitet den Ausdruck vor — reine Daten, kein PDF. So laesst sich pruefen,
 * was auf dem Blatt steht, ohne ein PDF erzeugen zu muessen.
 */
export function verzeichnisDruckdaten(
  kopf: VerzeichnisKopf,
  eintraege: VerzeichnisEintrag[],
  stand: string,
): VerzeichnisDruckdaten {
  const luecken: string[] = [];
  for (const f of kopfLuecken(kopf)) luecken.push(`Kopf: ${f}`);

  const aufbereitet = (eintraege || []).map((e) => {
    const zeilen: Array<{ label: string; wert: string }> = [];
    for (const [feld, label] of FELD_LABEL) {
      const wert = t(e[feld]);
      zeilen.push({ label, wert: wert || '— nicht ausgefuellt —' });
      if (!wert) luecken.push(`${t(e.name) || 'Eintrag ohne Namen'}: ${label}`);
    }
    return { name: t(e.name) || 'Eintrag ohne Namen', zeilen };
  });

  if (aufbereitet.length === 0) luecken.push('Das Verzeichnis enthaelt noch keine Verarbeitungstaetigkeit.');

  return { kopf, stand, eintraege: aufbereitet, luecken };
}

/**
 * Vorschlaege anhand der GEBUCHTEN Module (lib/tenantModule.ts).
 *
 * WICHTIG, am echten Code geprueft (22.09.): gebuchteModulKeys() liefert null,
 * wenn der Betrieb "nie scharf konfiguriert" wurde — dann ist im ganzen System
 * ALLES sichtbar (fail-open). Genau dann waere es falsch, nur die zwei
 * Grundverfahren vorzuschlagen: der Betrieb nutzt ja womoeglich Personal,
 * Kasse und Marketing. Also gilt hier dieselbe Regel wie im Menue — im Zweifel
 * alles anbieten, der Betrieb streicht selbst.
 */
export function vorschlaegeNachBuchung(gebucht: Set<string> | null | undefined): VerfahrenVorschlag[] {
  if (gebucht === null || gebucht === undefined) return VERFAHREN_KATALOG.slice();
  return vorschlaegeFuer(gebucht);
}
