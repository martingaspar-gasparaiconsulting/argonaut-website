// ============================================================================
// ARGONAUT OS · lib/automation.ts
// Regel-Logik des Automations-Bauers (Thema 1, Schritt 2/6).
//
// Aufbau einer Regel:  AUSLOESER -> BEDINGUNG -> WARTEZEIT -> AKTION
//
// Diese Datei ist ABSICHTLICH frei von Supabase-/Next-Importen: reine Logik,
// damit sie mit node getestet werden kann. Der Motor (/api/cron/automationen)
// holt die Daten und ruft hier nur die Pruef- und Aufbereitungs-Funktionen.
// ============================================================================

// ---------------------------------------------------------------------------
// 1) Typen
// ---------------------------------------------------------------------------

export type Operator =
  | 'gleich'
  | 'ungleich'
  | 'groesser'
  | 'groesser_gleich'
  | 'kleiner'
  | 'kleiner_gleich'
  | 'enthaelt'
  | 'leer'
  | 'nicht_leer';

export type Bedingung = {
  feld: string;
  operator: Operator;
  wert?: string | number | boolean | null;
};

export type AutomationRegel = {
  id: string;
  owner_user_id: string;
  name: string;
  beschreibung?: string | null;
  trigger_typ: string;
  trigger_config?: Record<string, unknown> | null;
  bedingung?: Bedingung[] | null;
  aktion_typ: string;
  aktion_config?: Record<string, unknown> | null;
  wartezeit_tage: number;
  aktiv: boolean;
  zuletzt_lauf_am?: string | null;
  erstellt_am?: string | null;
};

export type Datensatz = Record<string, unknown>;

export type FeldTyp = 'text' | 'zahl' | 'datum' | 'auswahl' | 'jaNein';

export type FeldDef = {
  key: string;
  label: string;
  typ: FeldTyp;
  optionen?: string[];
};

export type TriggerDef = {
  key: string;
  label: string;
  hinweis: string;
  zielTyp: string;      // rechnung | angebot | aufgabe | kontakt | projekt
  tabelle: string;      // Supabase-Tabelle, die der Motor abfragt
  datumFeld: string;    // ab diesem Datum laeuft die Wartezeit
  grundfilter: { feld: string; werte: string[]; negiert?: boolean } | null;
  felder: FeldDef[];    // fuer den Bedingungs-Baukasten
};

export type AktionsFeld = {
  key: string;
  label: string;
  typ: FeldTyp | 'mehrzeilig';
  optionen?: string[];
  pflicht?: boolean;
  standard?: string | number;
};

export type AktionDef = {
  key: string;
  label: string;
  hinweis: string;
  felder: AktionsFeld[];
  zielTypen: string[] | null; // null = fuer alle Ausloeser erlaubt
};

// ---------------------------------------------------------------------------
// 2) Katalog der Ausloeser
//    Alle Felder unten sind gegen die echten Tabellen geprueft.
// ---------------------------------------------------------------------------

const F_RECHNUNG: FeldDef[] = [
  { key: 'brutto_summe', label: 'Rechnungsbetrag (brutto)', typ: 'zahl' },
  { key: 'netto_summe', label: 'Rechnungsbetrag (netto)', typ: 'zahl' },
  { key: 'mahnstufe', label: 'Mahnstufe', typ: 'zahl' },
  { key: 'zahlungsstatus', label: 'Zahlungsstatus', typ: 'auswahl', optionen: ['offen', 'teilbezahlt', 'bezahlt', 'storniert', 'ueberfaellig'] },
  { key: 'titel', label: 'Titel', typ: 'text' },
  { key: 'rechnungsnummer', label: 'Rechnungsnummer', typ: 'text' },
  { key: 'kleinunternehmer', label: 'Kleinunternehmer', typ: 'jaNein' },
];

const F_ANGEBOT: FeldDef[] = [
  { key: 'brutto_summe', label: 'Angebotssumme (brutto)', typ: 'zahl' },
  { key: 'netto_summe', label: 'Angebotssumme (netto)', typ: 'zahl' },
  { key: 'status', label: 'Status', typ: 'auswahl', optionen: ['entwurf', 'gesendet', 'angenommen', 'abgelehnt', 'abgelaufen'] },
  { key: 'titel', label: 'Titel', typ: 'text' },
  { key: 'kunde_name', label: 'Kundenname', typ: 'text' },
  { key: 'kunde_email', label: 'Kunden-E-Mail', typ: 'text' },
];

const F_AUFGABE: FeldDef[] = [
  { key: 'titel', label: 'Titel', typ: 'text' },
  { key: 'status', label: 'Status', typ: 'auswahl', optionen: ['todo', 'in_arbeit', 'review', 'fertig'] },
  { key: 'prioritaet', label: 'Prioritaet', typ: 'auswahl', optionen: ['niedrig', 'normal', 'hoch', 'dringend'] },
  { key: 'erledigt', label: 'Erledigt', typ: 'jaNein' },
];

const F_KONTAKT: FeldDef[] = [
  { key: 'vorname', label: 'Vorname', typ: 'text' },
  { key: 'nachname', label: 'Nachname', typ: 'text' },
  { key: 'firma', label: 'Firma', typ: 'text' },
  { key: 'email', label: 'E-Mail', typ: 'text' },
  { key: 'status', label: 'Status', typ: 'auswahl', optionen: ['interessent', 'aktiv', 'kunde', 'inaktiv'] },
  { key: 'quelle', label: 'Quelle', typ: 'text' },
];

const F_PROJEKT: FeldDef[] = [
  { key: 'name', label: 'Projektname', typ: 'text' },
  { key: 'status', label: 'Status', typ: 'auswahl', optionen: ['aktiv', 'pausiert', 'abgeschlossen', 'abgebrochen'] },
  { key: 'prioritaet', label: 'Prioritaet', typ: 'auswahl', optionen: ['niedrig', 'normal', 'hoch', 'dringend'] },
  { key: 'budget', label: 'Budget', typ: 'zahl' },
  { key: 'verantwortlich', label: 'Verantwortlich', typ: 'text' },
];

export const TRIGGER: TriggerDef[] = [
  {
    key: 'rechnung_ueberfaellig',
    label: 'Rechnung ist ueberfaellig',
    hinweis: 'Faellt, wenn eine unbezahlte Rechnung ihr Faelligkeitsdatum ueberschritten hat.',
    zielTyp: 'rechnung',
    tabelle: 'rechnungen',
    datumFeld: 'faelligkeitsdatum',
    grundfilter: { feld: 'zahlungsstatus', werte: ['offen', 'teilbezahlt', 'ueberfaellig'] },
    felder: F_RECHNUNG,
  },
  {
    key: 'rechnung_bezahlt',
    label: 'Rechnung wurde bezahlt',
    hinweis: 'Faellt, nachdem eine Rechnung als bezahlt markiert wurde (z.B. fuer ein Dankeschoen).',
    zielTyp: 'rechnung',
    tabelle: 'rechnungen',
    datumFeld: 'bezahlt_am',
    grundfilter: { feld: 'zahlungsstatus', werte: ['bezahlt'] },
    felder: F_RECHNUNG,
  },
  {
    key: 'angebot_ohne_antwort',
    label: 'Angebot ohne Antwort',
    hinweis: 'Faellt, wenn ein verschicktes Angebot nach der Wartezeit noch nicht beantwortet wurde.',
    zielTyp: 'angebot',
    tabelle: 'angebote',
    datumFeld: 'erstellt_am',
    grundfilter: { feld: 'status', werte: ['gesendet'] },
    felder: F_ANGEBOT,
  },
  {
    key: 'angebot_laeuft_ab',
    label: 'Angebot laeuft ab',
    hinweis: 'Faellt rund um das Gueltig-bis-Datum eines offenen Angebots.',
    zielTyp: 'angebot',
    tabelle: 'angebote',
    datumFeld: 'gueltig_bis',
    grundfilter: { feld: 'status', werte: ['gesendet'] },
    felder: F_ANGEBOT,
  },
  {
    key: 'angebot_angenommen',
    label: 'Angebot wurde angenommen',
    hinweis: 'Faellt, nachdem ein Kunde ein Angebot angenommen hat.',
    zielTyp: 'angebot',
    tabelle: 'angebote',
    datumFeld: 'angenommen_am',
    grundfilter: { feld: 'status', werte: ['angenommen'] },
    felder: F_ANGEBOT,
  },
  {
    key: 'aufgabe_ueberfaellig',
    label: 'Aufgabe ist ueberfaellig',
    hinweis: 'Faellt, wenn eine nicht erledigte Aufgabe ihr Faellig-am-Datum ueberschritten hat.',
    zielTyp: 'aufgabe',
    tabelle: 'aufgaben',
    datumFeld: 'faellig_am',
    grundfilter: { feld: 'status', werte: ['fertig'], negiert: true },
    felder: F_AUFGABE,
  },
  {
    key: 'kontakt_wiedervorlage',
    label: 'Kontakt-Wiedervorlage faellig',
    hinweis: 'Faellt, wenn beim Kontakt das Datum "naechster Kontakt" erreicht ist.',
    zielTyp: 'kontakt',
    tabelle: 'kontakte',
    datumFeld: 'naechster_kontakt_am',
    grundfilter: null,
    felder: F_KONTAKT,
  },
  {
    key: 'kontakt_lange_still',
    label: 'Lange nichts vom Kunden gehoert',
    hinweis: 'Faellt, wenn der letzte Kontakt laenger her ist als die eingestellte Wartezeit.',
    zielTyp: 'kontakt',
    tabelle: 'kontakte',
    datumFeld: 'letzter_kontakt_am',
    grundfilter: null,
    felder: F_KONTAKT,
  },
  {
    key: 'projekt_endet',
    label: 'Projekt-Enddatum erreicht',
    hinweis: 'Faellt rund um das Enddatum eines laufenden Projekts.',
    zielTyp: 'projekt',
    tabelle: 'projekte',
    datumFeld: 'end_datum',
    grundfilter: { feld: 'status', werte: ['aktiv'] },
    felder: F_PROJEKT,
  },
];

export function triggerDef(key: string): TriggerDef | undefined {
  return TRIGGER.find((t) => t.key === key);
}

// ---------------------------------------------------------------------------
// 3) Katalog der Aktionen
// ---------------------------------------------------------------------------

export const AKTIONEN: AktionDef[] = [
  {
    key: 'aufgabe_anlegen',
    label: 'Aufgabe anlegen',
    hinweis: 'Legt eine Aufgabe in der Aufgabenliste an.',
    zielTypen: null,
    felder: [
      { key: 'titel', label: 'Titel der Aufgabe', typ: 'text', pflicht: true, standard: 'Nachfassen: {{name}}' },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'mehrzeilig' },
      { key: 'prioritaet', label: 'Prioritaet', typ: 'auswahl', optionen: ['niedrig', 'normal', 'hoch', 'dringend'], standard: 'normal' },
      { key: 'faellig_in_tagen', label: 'Faellig in ... Tagen', typ: 'zahl', standard: 3 },
    ],
  },
  {
    key: 'mail_senden',
    label: 'E-Mail senden',
    hinweis: 'Verschickt eine E-Mail — an den Kunden oder an eine feste Adresse.',
    zielTypen: null,
    felder: [
      { key: 'an', label: 'Empfaenger', typ: 'auswahl', optionen: ['kunde', 'feste_adresse'], standard: 'kunde', pflicht: true },
      { key: 'adresse', label: 'Feste Adresse (nur bei "feste_adresse")', typ: 'text' },
      { key: 'betreff', label: 'Betreff', typ: 'text', pflicht: true },
      { key: 'text', label: 'Text', typ: 'mehrzeilig', pflicht: true },
    ],
  },
  {
    key: 'status_aendern',
    label: 'Status aendern',
    hinweis: 'Setzt den Status des ausloesenden Datensatzes auf einen neuen Wert.',
    zielTypen: null,
    felder: [
      { key: 'neuer_status', label: 'Neuer Status', typ: 'text', pflicht: true },
    ],
  },
  {
    key: 'mahnstufe_erhoehen',
    label: 'Mahnstufe erhoehen',
    hinweis: 'Zaehlt die Mahnstufe der Rechnung um 1 hoch und setzt das Mahndatum (Mahnwesen).',
    zielTypen: ['rechnung'],
    felder: [
      { key: 'hoechste_stufe', label: 'Nicht hoeher als Stufe', typ: 'zahl', standard: 3 },
    ],
  },
  {
    key: 'notiz_anhaengen',
    label: 'Notiz anhaengen',
    hinweis: 'Haengt eine Zeile an das Notizfeld des Datensatzes an.',
    zielTypen: null,
    felder: [
      { key: 'text', label: 'Notiz-Text', typ: 'mehrzeilig', pflicht: true, standard: 'Automatisch: {{regel}} am {{heute}}' },
    ],
  },
];

export function aktionDef(key: string): AktionDef | undefined {
  return AKTIONEN.find((a) => a.key === key);
}

/** Welche Aktionen passen zu diesem Ausloeser? */
export function erlaubteAktionen(triggerKey: string): AktionDef[] {
  const t = triggerDef(triggerKey);
  if (!t) return AKTIONEN.filter((a) => a.zielTypen === null);
  return AKTIONEN.filter((a) => a.zielTypen === null || a.zielTypen.includes(t.zielTyp));
}

// ---------------------------------------------------------------------------
// 4) Kleine Helfer
// ---------------------------------------------------------------------------

const TAG_MS = 86400000;

/** Datum robust einlesen; gibt null bei leer/unbrauchbar. */
export function alsDatum(wert: unknown): Date | null {
  if (wert === null || wert === undefined || wert === '') return null;
  if (wert instanceof Date) return isNaN(wert.getTime()) ? null : wert;
  const d = new Date(String(wert));
  return isNaN(d.getTime()) ? null : d;
}

/** Zahl robust einlesen ("1.234,50" und "1234.50" werden verstanden). */
export function alsZahl(wert: unknown): number | null {
  if (typeof wert === 'number') return isNaN(wert) ? null : wert;
  if (typeof wert === 'boolean') return wert ? 1 : 0;
  if (wert === null || wert === undefined || wert === '') return null;
  let s = String(wert).trim().replace(/\s|€/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/** Ganze Tage zwischen zwei Datumsangaben (b - a), auf Tagesgrenze gerundet. */
export function tageZwischen(a: Date, b: Date): number {
  const a0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const b0 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((b0 - a0) / TAG_MS);
}

export function datumDeutsch(wert: unknown): string {
  const d = alsDatum(wert);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function euro(wert: unknown): string {
  const n = alsZahl(wert);
  if (n === null) return '';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ---------------------------------------------------------------------------
// 5) Bedingungen pruefen
// ---------------------------------------------------------------------------

export function pruefeBedingung(b: Bedingung, datensatz: Datensatz): boolean {
  const ist = datensatz[b.feld];

  if (b.operator === 'leer') return ist === null || ist === undefined || ist === '';
  if (b.operator === 'nicht_leer') return !(ist === null || ist === undefined || ist === '');

  const sollZahl = alsZahl(b.wert);
  const istZahl = alsZahl(ist);
  const beideZahlen = sollZahl !== null && istZahl !== null;

  switch (b.operator) {
    case 'gleich':
      if (typeof ist === 'boolean') return ist === (b.wert === true || b.wert === 'true' || b.wert === 1 || b.wert === '1');
      if (beideZahlen) return istZahl === sollZahl;
      return String(ist ?? '').toLowerCase() === String(b.wert ?? '').toLowerCase();
    case 'ungleich':
      if (typeof ist === 'boolean') return ist !== (b.wert === true || b.wert === 'true' || b.wert === 1 || b.wert === '1');
      if (beideZahlen) return istZahl !== sollZahl;
      return String(ist ?? '').toLowerCase() !== String(b.wert ?? '').toLowerCase();
    case 'groesser':
      return beideZahlen ? istZahl > sollZahl : false;
    case 'groesser_gleich':
      return beideZahlen ? istZahl >= sollZahl : false;
    case 'kleiner':
      return beideZahlen ? istZahl < sollZahl : false;
    case 'kleiner_gleich':
      return beideZahlen ? istZahl <= sollZahl : false;
    case 'enthaelt':
      return String(ist ?? '').toLowerCase().includes(String(b.wert ?? '').toLowerCase());
    default:
      return false;
  }
}

/** Alle Bedingungen muessen zutreffen (UND). Leere Liste = trifft immer zu. */
export function pruefeAlleBedingungen(bedingungen: Bedingung[] | null | undefined, datensatz: Datensatz): boolean {
  const liste = Array.isArray(bedingungen) ? bedingungen : [];
  if (liste.length === 0) return true;
  return liste.every((b) => pruefeBedingung(b, datensatz));
}

// ---------------------------------------------------------------------------
// 6) Grundfilter + Faelligkeit + Gesamtpruefung
// ---------------------------------------------------------------------------

export function pruefeGrundfilter(t: TriggerDef, datensatz: Datensatz): boolean {
  if (!t.grundfilter) return true;
  const ist = String(datensatz[t.grundfilter.feld] ?? '').toLowerCase();
  const drin = t.grundfilter.werte.some((w) => w.toLowerCase() === ist);
  return t.grundfilter.negiert ? !drin : drin;
}

export type Pruefergebnis = {
  trifft: boolean;
  grund: string;
  tageSeitAusloeser: number | null;
};

/**
 * Kernpruefung: trifft diese Regel auf diesen Datensatz zum Zeitpunkt "jetzt" zu?
 * Reihenfolge: aktiv -> Ausloeser bekannt -> Grundfilter -> Ausloesedatum da ->
 * Wartezeit abgelaufen -> Bedingungen.
 */
export function pruefeRegel(regel: AutomationRegel, datensatz: Datensatz, jetzt: Date): Pruefergebnis {
  if (!regel.aktiv) return { trifft: false, grund: 'Regel ist pausiert', tageSeitAusloeser: null };

  const t = triggerDef(regel.trigger_typ);
  if (!t) return { trifft: false, grund: `Unbekannter Ausloeser: ${regel.trigger_typ}`, tageSeitAusloeser: null };

  if (!pruefeGrundfilter(t, datensatz)) {
    return { trifft: false, grund: 'Grundfilter des Ausloesers nicht erfuellt', tageSeitAusloeser: null };
  }

  const ausloeseDatum = alsDatum(datensatz[t.datumFeld]);
  if (!ausloeseDatum) {
    return { trifft: false, grund: `Kein Datum in "${t.datumFeld}"`, tageSeitAusloeser: null };
  }

  const tage = tageZwischen(ausloeseDatum, jetzt);
  const warte = Math.max(0, Math.trunc(Number(regel.wartezeit_tage) || 0));
  if (tage < warte) {
    return { trifft: false, grund: `Wartezeit laeuft noch (${tage} von ${warte} Tagen)`, tageSeitAusloeser: tage };
  }

  if (!pruefeAlleBedingungen(regel.bedingung, datensatz)) {
    return { trifft: false, grund: 'Bedingung nicht erfuellt', tageSeitAusloeser: tage };
  }

  return { trifft: true, grund: 'Alles erfuellt', tageSeitAusloeser: tage };
}

/** Bequemer Filter fuer den Motor: liefert nur die passenden Datensaetze. */
export function passendeDatensaetze<T extends Datensatz>(regel: AutomationRegel, datensaetze: T[], jetzt: Date): T[] {
  return datensaetze.filter((d) => pruefeRegel(regel, d, jetzt).trifft);
}

// ---------------------------------------------------------------------------
// 7) Platzhalter in Texten
// ---------------------------------------------------------------------------

/** Baut die Platzhalter-Werte fuer einen Datensatz zusammen. */
export function platzhalterWerte(regel: AutomationRegel, datensatz: Datensatz, jetzt: Date): Record<string, string> {
  const t = triggerDef(regel.trigger_typ);
  const tage = t ? (alsDatum(datensatz[t.datumFeld]) ? tageZwischen(alsDatum(datensatz[t.datumFeld]) as Date, jetzt) : 0) : 0;

  const name =
    (datensatz.kunde_name as string) ||
    [datensatz.vorname, datensatz.nachname].filter(Boolean).join(' ').trim() ||
    (datensatz.firma as string) ||
    (datensatz.titel as string) ||
    (datensatz.name as string) ||
    '';

  return {
    name: String(name || ''),
    firma: String(datensatz.firma ?? ''),
    titel: String(datensatz.titel ?? datensatz.name ?? ''),
    nummer: String(datensatz.rechnungsnummer ?? datensatz.angebotsnummer ?? ''),
    betrag: euro(datensatz.brutto_summe ?? datensatz.netto_summe ?? datensatz.budget),
    status: String(datensatz.zahlungsstatus ?? datensatz.status ?? ''),
    datum: datumDeutsch(t ? datensatz[t.datumFeld] : null),
    tage: String(tage),
    heute: datumDeutsch(jetzt),
    regel: regel.name || '',
  };
}

/** Ersetzt {{platzhalter}} im Text. Unbekannte Platzhalter werden geleert. */
export function ersetzePlatzhalter(text: string, werte: Record<string, string>): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_treffer, key: string) => werte[key] ?? '');
}

/** E-Mail-Adresse des Ziel-Datensatzes (fuer die Aktion "mail_senden" an den Kunden). */
export function empfaengerAdresse(datensatz: Datensatz, aktionConfig: Record<string, unknown> | null | undefined): string {
  const cfg = aktionConfig || {};
  if (cfg.an === 'feste_adresse') return String(cfg.adresse ?? '').trim();
  const mail = (datensatz.kunde_email as string) || (datensatz.email as string) || '';
  return String(mail || '').trim();
}

// ---------------------------------------------------------------------------
// 8) Anzeige-Hilfen fuer die Oberflaeche
// ---------------------------------------------------------------------------

export const OPERATOR_LABEL: Record<Operator, string> = {
  gleich: 'ist gleich',
  ungleich: 'ist nicht',
  groesser: 'ist groesser als',
  groesser_gleich: 'ist mindestens',
  kleiner: 'ist kleiner als',
  kleiner_gleich: 'ist hoechstens',
  enthaelt: 'enthaelt',
  leer: 'ist leer',
  nicht_leer: 'ist ausgefuellt',
};

export function bedingungText(b: Bedingung, triggerKey: string): string {
  const t = triggerDef(triggerKey);
  const feld = t?.felder.find((f) => f.key === b.feld);
  const feldLabel = feld?.label || b.feld;
  const op = OPERATOR_LABEL[b.operator] || b.operator;
  if (b.operator === 'leer' || b.operator === 'nicht_leer') return `${feldLabel} ${op}`;
  return `${feldLabel} ${op} ${b.wert ?? ''}`.trim();
}

/** Ein Satz, der die ganze Regel beschreibt — fuer die Liste im Dashboard. */
export function regelZusammenfassung(regel: AutomationRegel): string {
  const t = triggerDef(regel.trigger_typ);
  const a = aktionDef(regel.aktion_typ);
  const teile: string[] = [];
  teile.push(`Wenn: ${t?.label || regel.trigger_typ}`);

  const bed = Array.isArray(regel.bedingung) ? regel.bedingung : [];
  if (bed.length > 0) teile.push(`und ${bed.map((b) => bedingungText(b, regel.trigger_typ)).join(' und ')}`);

  const warte = Math.max(0, Math.trunc(Number(regel.wartezeit_tage) || 0));
  if (warte > 0) teile.push(`nach ${warte} ${warte === 1 ? 'Tag' : 'Tagen'}`);

  teile.push(`dann: ${a?.label || regel.aktion_typ}`);
  return teile.join(' · ');
}

// ---------------------------------------------------------------------------
// 9) Vorlagen — fertige Regeln zum Anklicken
// ---------------------------------------------------------------------------

export type RegelVorlage = {
  name: string;
  beschreibung: string;
  trigger_typ: string;
  bedingung: Bedingung[];
  aktion_typ: string;
  aktion_config: Record<string, unknown>;
  wartezeit_tage: number;
};

export const VORLAGEN: RegelVorlage[] = [
  {
    name: 'Freundliche Zahlungserinnerung',
    beschreibung: 'Drei Tage nach Faelligkeit eine hoefliche Erinnerung an den Kunden.',
    trigger_typ: 'rechnung_ueberfaellig',
    bedingung: [{ feld: 'mahnstufe', operator: 'gleich', wert: 0 }],
    aktion_typ: 'mail_senden',
    aktion_config: {
      an: 'kunde',
      betreff: 'Zahlungserinnerung zu Rechnung {{nummer}}',
      text: 'Guten Tag {{name}},\n\nunsere Rechnung {{nummer}} ueber {{betrag}} war am {{datum}} faellig. Vermutlich ist das im Alltag untergegangen — wir bitten Sie um Ausgleich.\n\nSollten Sie bereits gezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.\n\nFreundliche Gruesse',
    },
    wartezeit_tage: 3,
  },
  {
    name: 'Mahnstufe nach 14 Tagen',
    beschreibung: 'Zaehlt die Mahnstufe hoch, wenn nach zwei Wochen kein Geld da ist.',
    trigger_typ: 'rechnung_ueberfaellig',
    bedingung: [],
    aktion_typ: 'mahnstufe_erhoehen',
    aktion_config: { hoechste_stufe: 3 },
    wartezeit_tage: 14,
  },
  {
    name: 'Angebot nachfassen',
    beschreibung: 'Legt fuenf Tage nach dem Versand eine Aufgabe zum Nachfassen an.',
    trigger_typ: 'angebot_ohne_antwort',
    bedingung: [],
    aktion_typ: 'aufgabe_anlegen',
    aktion_config: {
      titel: 'Angebot nachfassen: {{name}}',
      beschreibung: 'Angebot "{{titel}}" ueber {{betrag}} ist seit {{tage}} Tagen ohne Antwort.',
      prioritaet: 'hoch',
      faellig_in_tagen: 1,
    },
    wartezeit_tage: 5,
  },
  {
    name: 'Grosses Angebot sofort nachfassen',
    beschreibung: 'Ab 5.000 € Angebotssumme schon nach zwei Tagen anrufen.',
    trigger_typ: 'angebot_ohne_antwort',
    bedingung: [{ feld: 'brutto_summe', operator: 'groesser_gleich', wert: 5000 }],
    aktion_typ: 'aufgabe_anlegen',
    aktion_config: {
      titel: 'ANRUFEN: {{name}} ({{betrag}})',
      beschreibung: 'Grosses Angebot "{{titel}}" — persoenlich nachfassen.',
      prioritaet: 'dringend',
      faellig_in_tagen: 0,
    },
    wartezeit_tage: 2,
  },
  {
    name: 'Wiedervorlage beim Kunden',
    beschreibung: 'Erzeugt eine Aufgabe, sobald die Wiedervorlage eines Kontakts faellig ist.',
    trigger_typ: 'kontakt_wiedervorlage',
    bedingung: [],
    aktion_typ: 'aufgabe_anlegen',
    aktion_config: {
      titel: 'Kontakt pflegen: {{name}}',
      beschreibung: 'Wiedervorlage war am {{datum}} faellig.',
      prioritaet: 'normal',
      faellig_in_tagen: 2,
    },
    wartezeit_tage: 0,
  },
  {
    name: 'Danke nach Zahlung',
    beschreibung: 'Bedankt sich zwei Tage nach dem Zahlungseingang.',
    trigger_typ: 'rechnung_bezahlt',
    bedingung: [],
    aktion_typ: 'mail_senden',
    aktion_config: {
      an: 'kunde',
      betreff: 'Vielen Dank fuer Ihre Zahlung',
      text: 'Guten Tag {{name}},\n\nvielen Dank — der Betrag von {{betrag}} zu Rechnung {{nummer}} ist bei uns eingegangen.\n\nWir freuen uns auf die weitere Zusammenarbeit.\n\nFreundliche Gruesse',
    },
    wartezeit_tage: 2,
  },
  {
    name: 'Ueberfaellige Aufgabe eskalieren',
    beschreibung: 'Setzt eine Aufgabe, die drei Tage ueberfaellig ist, auf dringend.',
    trigger_typ: 'aufgabe_ueberfaellig',
    bedingung: [{ feld: 'prioritaet', operator: 'ungleich', wert: 'dringend' }],
    aktion_typ: 'status_aendern',
    aktion_config: { neuer_status: 'in_arbeit' },
    wartezeit_tage: 3,
  },
  {
    name: 'Projektende vorbereiten',
    beschreibung: 'Legt kurz vor dem Projektende eine Aufgabe fuer die Schlussrechnung an.',
    trigger_typ: 'projekt_endet',
    bedingung: [],
    aktion_typ: 'aufgabe_anlegen',
    aktion_config: {
      titel: 'Schlussrechnung: {{titel}}',
      beschreibung: 'Das Projekt endet am {{datum}} — Abnahme und Rechnung vorbereiten.',
      prioritaet: 'hoch',
      faellig_in_tagen: 2,
    },
    wartezeit_tage: 0,
  },
];

/** Pruefung vor dem Speichern — gibt eine Liste von Klartext-Fehlern zurueck. */
export function pruefeRegelEingabe(regel: Partial<AutomationRegel>): string[] {
  const fehler: string[] = [];
  if (!String(regel.name ?? '').trim()) fehler.push('Bitte einen Namen fuer die Automation vergeben.');

  const t = regel.trigger_typ ? triggerDef(regel.trigger_typ) : undefined;
  if (!t) fehler.push('Bitte einen Ausloeser waehlen.');

  const a = regel.aktion_typ ? aktionDef(regel.aktion_typ) : undefined;
  if (!a) fehler.push('Bitte eine Aktion waehlen.');

  if (t && a && a.zielTypen && !a.zielTypen.includes(t.zielTyp)) {
    fehler.push(`Die Aktion "${a.label}" passt nicht zum Ausloeser "${t.label}".`);
  }

  const warte = Number(regel.wartezeit_tage ?? 0);
  if (isNaN(warte) || warte < 0 || warte > 365) fehler.push('Wartezeit muss zwischen 0 und 365 Tagen liegen.');

  if (a) {
    const cfg = (regel.aktion_config || {}) as Record<string, unknown>;
    for (const f of a.felder) {
      if (f.pflicht && !String(cfg[f.key] ?? '').trim()) fehler.push(`Feld "${f.label}" ist ein Pflichtfeld.`);
    }
    if (a.key === 'mail_senden' && cfg.an === 'feste_adresse' && !String(cfg.adresse ?? '').includes('@')) {
      fehler.push('Bitte eine gueltige feste E-Mail-Adresse eintragen.');
    }
  }

  const bed = Array.isArray(regel.bedingung) ? regel.bedingung : [];
  for (const b of bed) {
    if (!b.feld) fehler.push('Eine Bedingung hat kein Feld.');
    if (t && b.feld && !t.felder.some((f) => f.key === b.feld)) {
      fehler.push(`Das Feld "${b.feld}" gibt es bei diesem Ausloeser nicht.`);
    }
    const ohneWert = b.operator === 'leer' || b.operator === 'nicht_leer';
    if (!ohneWert && (b.wert === undefined || b.wert === null || b.wert === '')) {
      fehler.push(`Der Bedingung zu "${b.feld}" fehlt ein Vergleichswert.`);
    }
  }

  return fehler;
}
