// ============================================================================
// ARGONAUT OS · lib/branchenVorlage.ts — Paket 259 (07.10.2026) · Branchen-Vorlage (Kern)
//
// Martins Vorgabe (07.10.2026): Jede Branche startet fertig eingerichtet —
// eigene Status, Spalten, Ampeln, gespeicherte Suchen und Begriffe —, und der
// Kunde darf IMMER mehr: Spalten ein-/ausblenden, Status umbenennen oder
// ergänzen, Ampelgrenzen ändern, eigene Suchen speichern. Was der Kunde
// anlegt, geht bei einem Update der Vorlage nie verloren.
//
// Aufbau in drei Schichten:
//   1. Grund-Vorlage je Modul (z. B. 'kfz-bestand')
//   2. Feinschliff je Branche (passt über profiles.branche, Anzeigename)
//   3. Einstellungen des Kunden (Tabelle modul_einstellung, jsonb) — gewinnen
//
// Reine Logik, KEINE Imports, KEINE Hooks, kein Date.now(). Node-testbar.
// Andockpunkt BV2: weitere Module/Bereiche einfach in VORLAGEN ergänzen.
// ============================================================================

export type VorlageStatus = { key: string; label: string; farbe: 'ok' | 'warn' | 'bad' | 'info' | 'gold' | 'dim'; aktiv?: boolean };
export type VorlageSpalte = { key: string; label: string; sichtbar: boolean };
export type VorlageAmpel = { gruenBis: number; gelbBis: number };
export type VorlageSuche = { key: string; name: string; regel: string };

export type Vorlage = {
  modul: string;
  titel: string;
  einheit: string;          // „Fahrzeug" / „Boot" — Wort für einen Eintrag
  einheitPlural: string;
  status: VorlageStatus[];
  sparten: string[];
  spalten: VorlageSpalte[];
  ampel: VorlageAmpel;
  suchen: VorlageSuche[];
  standkostenTag: number;   // € je Standtag (Planwert, Kunde stellt ein)
  /** Paket 310 (BV2a): Projekte — „Achtung", wenn höchstens so viele Tage bis zum Ende … */
  warnTage?: number;
  /** … und weniger als so viel Prozent der Aufgaben erledigt sind. */
  warnProzent?: number;
  /** Paket 311 (BV2 Aufträge): Aufträge — Wort für den Termin („Lieferdatum", „Ausführungstermin", „Frist"). */
  terminWort?: string;
  /** Paket 312 (BV2 Kunden): Wort für die eigenen Kunden („Kunden", „Mandanten") … */
  kundenWort?: string;
  /** … und das Betreuungs-Intervall für neue Kontakte (Tage bis zur nächsten Pflege). */
  intervallTage?: number;
};

/** Was der Kunde je Modul speichern darf (alles optional). */
export type KundenEinstellung = {
  statusLabels?: Record<string, string>;
  statusExtra?: VorlageStatus[];
  sparten?: string[];
  spaltenSichtbar?: Record<string, boolean>;
  ampel?: Partial<VorlageAmpel>;
  suchen?: VorlageSuche[];
  standkostenTag?: number;
  warnTage?: number;
  warnProzent?: number;
  terminWort?: string;
  kundenWort?: string;
  intervallTage?: number;
};

type Feinschliff = { name: string; passt: (branche: string) => boolean; aenderung: Partial<Vorlage> };

// --- Grund-Vorlage: Kfz-Handelsbestand (K1) --------------------------------
const KFZ_BESTAND: Vorlage = {
  modul: 'kfz-bestand',
  titel: 'Fahrzeugbestand',
  einheit: 'Fahrzeug',
  einheitPlural: 'Fahrzeuge',
  status: [
    { key: 'zulauf', label: 'Im Zulauf', farbe: 'info' },
    { key: 'aufbereitung', label: 'In Aufbereitung', farbe: 'warn' },
    { key: 'bestand', label: 'Im Bestand', farbe: 'ok' },
    { key: 'reserviert', label: 'Reserviert', farbe: 'gold' },
    { key: 'verkauft', label: 'Verkauft', farbe: 'dim' },
    { key: 'archiv', label: 'Archiv', farbe: 'dim' },
  ],
  sparten: ['Pkw', 'Nutzfahrzeug', 'Wohnmobil', 'Motorrad'],
  spalten: [
    { key: 'fahrzeug', label: 'Fahrzeug', sichtbar: true },
    { key: 'status', label: 'Status', sichtbar: true },
    { key: 'ez_km', label: 'EZ · km', sichtbar: true },
    { key: 'kennzeichen', label: 'Kennzeichen', sichtbar: true },
    { key: 'standort', label: 'Standort', sichtbar: true },
    { key: 'vk', label: 'Verkaufspreis', sichtbar: true },
    { key: 'ek', label: 'Einkaufspreis', sichtbar: false },
    { key: 'standtage', label: 'Standtage', sichtbar: true },
    { key: 'fin', label: 'FIN', sichtbar: false },
    { key: 'farbe', label: 'Farbe', sichtbar: false },
    { key: 'besteuerung', label: 'Besteuerung', sichtbar: false },
  ],
  ampel: { gruenBis: 60, gelbBis: 90 },
  suchen: [
    { key: 'ueber90', name: 'Über 90 Standtage', regel: 'standtage>90' },
    { key: 'ab80', name: 'Ab 80.000 €', regel: 'vk>=80000' },
    { key: 'ohneInserat', name: 'Ohne Inserat', regel: 'inseriert=nein' },
    { key: 'reserviert', name: 'Reserviert', regel: 'status=reserviert' },
    { key: 'diff', name: 'Differenzbesteuert', regel: 'besteuerung=25a' },
  ],
  standkostenTag: 9,
};

const KFZ_FEINSCHLIFF: Feinschliff[] = [
  { name: 'Motorradhandel', passt: (b) => /motorrad|roller|zweirad/i.test(b),
    aenderung: { sparten: ['Motorrad', 'Roller', 'Quad', 'Leichtkraftrad'], standkostenTag: 4,
      suchen: [{ key: 'ueber90', name: 'Über 90 Standtage', regel: 'standtage>90' }, { key: 'ab15', name: 'Ab 15.000 €', regel: 'vk>=15000' }, { key: 'ohneInserat', name: 'Ohne Inserat', regel: 'inseriert=nein' }, { key: 'reserviert', name: 'Reserviert', regel: 'status=reserviert' }] } },
  { name: 'Nutzfahrzeughandel', passt: (b) => /nutzfahrzeug|transporter|lkw/i.test(b),
    aenderung: { sparten: ['Transporter', 'Lkw bis 7,5 t', 'Lkw über 7,5 t', 'Anhänger', 'Pkw'], standkostenTag: 12 } },
  { name: 'Caravan und Wohnmobil', passt: (b) => /caravan|wohnmobil|wohnwagen/i.test(b),
    aenderung: { sparten: ['Wohnmobil', 'Kastenwagen', 'Wohnwagen', 'Alkoven'], standkostenTag: 12, ampel: { gruenBis: 90, gelbBis: 150 } } },
  { name: 'Oldtimer', passt: (b) => /oldtimer|klassik/i.test(b),
    aenderung: { sparten: ['Oldtimer (H-Kennzeichen)', 'Youngtimer', 'Pkw'], ampel: { gruenBis: 120, gelbBis: 240 } } },
  { name: 'Boote', passt: (b) => /boot|yacht/i.test(b),
    aenderung: { einheit: 'Boot', einheitPlural: 'Boote', titel: 'Bootsbestand', sparten: ['Motorboot', 'Segelboot', 'Schlauchboot', 'Trailer'], standkostenTag: 6, ampel: { gruenBis: 90, gelbBis: 180 } } },
  { name: 'Luxus und Premium', passt: (b) => /luxus|premium|sportwagen/i.test(b),
    aenderung: { ampel: { gruenBis: 90, gelbBis: 150 }, standkostenTag: 18 } },
];

// --- Branchen-Erkennung, gemeinsam für Projekte und Aufträge (Paket 311) ----
// Umlautfeste Wortgrenzen: (^|[^a-zäöüß]) statt \b (\b kennt keine Umlaute).
const RX_KANZLEI = /steuer|anwalt|anwält|kanzlei|notar/i;
const RX_EVENT = /event|veranstalt|catering|hochzeit|messebau/i;
const RX_HANDWERK = /elektriker|elektrobetrieb|elektroinstall|elektrotechnik|elektrohandwerk|sanitär|heizung|(^|[^a-zäöüß])shk([^a-zäöüß]|$)|klima|maler|lackierer|schreiner|tischler|bauunternehm|hochbau|tiefbau|rohbau|dachdecker|bodenleger|raumausstatter|glaser|schlosser|schwei(ß|ss)|haustechnik|gebäudetechnik|gebäudeautomation|rollladen|sonnenschutz|trockenbau|innenausbau|estrich|fliese|gerüst|erdbau|bagger|parkett|zaunbau|pflaster|schwimmbad|gartengestaltung|landschaftsbau|zimmer(ei|er)|maurer|solar|photovoltaik|metallbau|stuckateur|kaminkehrer|schornstein|bauhandwerk|(^|[^a-zäöüß])bau([^a-zäöüß]|$)/i;
const RX_AGENTUR = /agentur|marketing|werbe|unternehmenskommunikation|(^|[^a-zäöüß])pr([^a-zäöüß]|$)|design|software|it-dienst|systemhaus|(^|[^a-zäöüß])it([^a-zäöüß]|$)|digital|spieleentwickl|webentwickl|medien|film|video|fotograf|unternehmensberat/i;

// --- Grund-Vorlage: Projekte für alle Bereiche (Paket 310, BV2a) ------------
// Status-SCHLÜSSEL bleiben in allen Branchen gleich (aktiv, pausiert,
// abgeschlossen, abgebrochen — so stehen sie in der Datenbank); jede Branche
// bekommt nur ihre eigenen Wörter. Spalten = Angaben auf der Projektkarte.
const P_STATUS = (aktiv: string, pausiert: string, fertig: string, ab: string): VorlageStatus[] => [
  { key: 'aktiv', label: aktiv, farbe: 'ok' },
  { key: 'pausiert', label: pausiert, farbe: 'warn' },
  { key: 'abgeschlossen', label: fertig, farbe: 'info' },
  { key: 'abgebrochen', label: ab, farbe: 'bad' },
];

const PROJEKTE: Vorlage = {
  modul: 'projekte',
  titel: 'Projekte',
  einheit: 'Projekt',
  einheitPlural: 'Projekte',
  status: P_STATUS('Aktiv', 'Pausiert', 'Abgeschlossen', 'Abgebrochen'),
  sparten: [],
  spalten: [
    { key: 'beschreibung', label: 'Beschreibung', sichtbar: true },
    { key: 'fortschritt', label: 'Fortschritt', sichtbar: true },
    { key: 'zeitraum', label: 'Zeitraum', sichtbar: true },
    { key: 'prioritaet', label: 'Priorität', sichtbar: true },
    { key: 'verantwortlich', label: 'Verantwortlich', sichtbar: true },
    { key: 'budget', label: 'Budget', sichtbar: true },
    { key: 'eigene', label: 'Eigene Felder', sichtbar: true },
  ],
  ampel: { gruenBis: 0, gelbBis: 0 },
  suchen: [
    { key: 'kritisch', name: 'Kritisch', regel: 'ampel=rot' },
    { key: 'achtung', name: 'Achtung', regel: 'ampel=gelb' },
    { key: 'ende14', name: 'Ende in 14 Tagen', regel: 'ende<=14' },
    { key: 'dringend', name: 'Hoch und dringend', regel: 'prio=hoch' },
    { key: 'ohneVerantwortlich', name: 'Ohne Verantwortlichen', regel: 'verantwortlich=leer' },
  ],
  standkostenTag: 0,
  warnTage: 14,
  warnProzent: 70,
};

/** Reihenfolge zählt: der erste Treffer gewinnt. */
const PROJEKTE_FEINSCHLIFF: Feinschliff[] = [
  { name: 'Kanzlei und Beratung', passt: (b) => RX_KANZLEI.test(b),
    aenderung: { titel: 'Mandate', einheit: 'Mandat', einheitPlural: 'Mandate', status: P_STATUS('In Bearbeitung', 'Ruht', 'Erledigt', 'Beendet'),
      suchen: [
        { key: 'kritisch', name: 'Kritisch', regel: 'ampel=rot' },
        { key: 'achtung', name: 'Achtung', regel: 'ampel=gelb' },
        { key: 'ende14', name: 'Frist in 14 Tagen', regel: 'ende<=14' },
        { key: 'dringend', name: 'Hoch und dringend', regel: 'prio=hoch' },
        { key: 'ohneVerantwortlich', name: 'Ohne Bearbeiter', regel: 'verantwortlich=leer' },
      ] } },
  { name: 'Veranstaltungen', passt: (b) => RX_EVENT.test(b),
    aenderung: { titel: 'Veranstaltungen', einheit: 'Veranstaltung', einheitPlural: 'Veranstaltungen', status: P_STATUS('In Planung', 'Pausiert', 'Durchgeführt', 'Abgesagt'),
      suchen: [
        { key: 'kritisch', name: 'Kritisch', regel: 'ampel=rot' },
        { key: 'achtung', name: 'Achtung', regel: 'ampel=gelb' },
        { key: 'ende14', name: 'Termin in 14 Tagen', regel: 'ende<=14' },
        { key: 'dringend', name: 'Hoch und dringend', regel: 'prio=hoch' },
        { key: 'ohneVerantwortlich', name: 'Ohne Verantwortlichen', regel: 'verantwortlich=leer' },
      ] } },
  { name: 'Handwerk und Bau', passt: (b) => RX_HANDWERK.test(b),
    aenderung: { titel: 'Baustellen', einheit: 'Baustelle', einheitPlural: 'Baustellen', status: P_STATUS('In Ausführung', 'Ruht', 'Fertiggestellt', 'Storniert'),
      suchen: [
        { key: 'kritisch', name: 'Kritisch', regel: 'ampel=rot' },
        { key: 'achtung', name: 'Achtung', regel: 'ampel=gelb' },
        { key: 'ende14', name: 'Fertig in 14 Tagen', regel: 'ende<=14' },
        { key: 'dringend', name: 'Hoch und dringend', regel: 'prio=hoch' },
        { key: 'ohneVerantwortlich', name: 'Ohne Bauleiter', regel: 'verantwortlich=leer' },
      ] } },
  { name: 'Agentur, IT und Beratung', passt: (b) => RX_AGENTUR.test(b),
    aenderung: { titel: 'Kundenprojekte', einheit: 'Kundenprojekt', einheitPlural: 'Kundenprojekte', status: P_STATUS('In Arbeit', 'Pausiert', 'Abgeschlossen', 'Abgebrochen') } },
];

// --- Grund-Vorlage: Aufträge für alle Bereiche (Paket 311, BV2 Aufträge) ------------
// Status-SCHLÜSSEL wie in der Datenbank und in der Auftrags-Akte (entwurf,
// beauftragt, in_bearbeitung, abgeschlossen, storniert) — nur die Wörter
// wechseln je Branche. Ampel: Termin vorbei = rot, Termin in warnTage = gelb.
const A_STATUS = (entwurf: string, beauftragt: string, arbeit: string, fertig: string, storno: string): VorlageStatus[] => [
  { key: 'entwurf', label: entwurf, farbe: 'gold' },
  { key: 'beauftragt', label: beauftragt, farbe: 'info' },
  { key: 'in_bearbeitung', label: arbeit, farbe: 'ok' },
  { key: 'abgeschlossen', label: fertig, farbe: 'ok' },
  { key: 'storniert', label: storno, farbe: 'dim' },
];
const A_SPALTEN = (kunde: string, termin: string): VorlageSpalte[] => [
  { key: 'nummer', label: 'Nummer', sichtbar: true },
  { key: 'kunde', label: kunde, sichtbar: true },
  { key: 'datum', label: 'Auftragsdatum', sichtbar: false },
  { key: 'termin', label: termin, sichtbar: true },
  { key: 'netto', label: 'Netto', sichtbar: true },
  { key: 'abrechnung', label: 'Abgerechnet', sichtbar: true },
];
const A_SUCHEN = (termin: string, fertig: string, kunde: string): VorlageSuche[] => [
  { key: 'ueberfaellig', name: `${termin} überschritten`, regel: 'ampel=rot' },
  { key: 'bald', name: `${termin} in 7 Tagen`, regel: 'termin<=7' },
  { key: 'nichtAbgerechnet', name: `${fertig}, nicht abgerechnet`, regel: 'abgerechnet=nein' },
  { key: 'ohneKunde', name: `Ohne ${kunde}`, regel: 'kunde=leer' },
  { key: 'liegt', name: 'Entwurf seit über 30 Tagen', regel: 'entwurf>30' },
];

const AUFTRAEGE: Vorlage = {
  modul: 'auftraege',
  titel: 'Aufträge',
  einheit: 'Auftrag',
  einheitPlural: 'Aufträge',
  status: A_STATUS('Entwurf', 'Beauftragt', 'In Bearbeitung', 'Abgeschlossen', 'Storniert'),
  sparten: [],
  spalten: A_SPALTEN('Kunde', 'Lieferdatum'),
  ampel: { gruenBis: 0, gelbBis: 0 },
  suchen: A_SUCHEN('Lieferdatum', 'Abgeschlossen', 'Kunde'),
  standkostenTag: 0,
  warnTage: 7,
  terminWort: 'Lieferdatum',
};

/** Reihenfolge wie bei den Projekten: der erste Treffer gewinnt. */
const AUFTRAEGE_FEINSCHLIFF: Feinschliff[] = [
  { name: 'Kanzlei und Beratung', passt: (b) => RX_KANZLEI.test(b),
    aenderung: { status: A_STATUS('Entwurf', 'Erteilt', 'In Bearbeitung', 'Erledigt', 'Zurückgezogen'), terminWort: 'Frist',
      spalten: A_SPALTEN('Mandant', 'Frist'), suchen: A_SUCHEN('Frist', 'Erledigt', 'Mandant') } },
  { name: 'Veranstaltungen', passt: (b) => RX_EVENT.test(b),
    aenderung: { titel: 'Buchungen', einheit: 'Buchung', einheitPlural: 'Buchungen', warnTage: 14,
      status: A_STATUS('Option', 'Gebucht', 'In Vorbereitung', 'Durchgeführt', 'Abgesagt'), terminWort: 'Veranstaltungstag',
      spalten: A_SPALTEN('Kunde', 'Veranstaltungstag'),
      suchen: [
        { key: 'ueberfaellig', name: 'Termin vorbei, nicht abgeschlossen', regel: 'ampel=rot' },
        { key: 'bald', name: 'Veranstaltung in 14 Tagen', regel: 'termin<=14' },
        { key: 'nichtAbgerechnet', name: 'Durchgeführt, nicht abgerechnet', regel: 'abgerechnet=nein' },
        { key: 'ohneKunde', name: 'Ohne Kunde', regel: 'kunde=leer' },
        { key: 'liegt', name: 'Option seit über 30 Tagen', regel: 'entwurf>30' },
      ] } },
  { name: 'Handwerk und Bau', passt: (b) => RX_HANDWERK.test(b),
    aenderung: { status: A_STATUS('Entwurf', 'Beauftragt', 'In Ausführung', 'Fertiggestellt', 'Storniert'), terminWort: 'Ausführungstermin',
      spalten: A_SPALTEN('Kunde', 'Ausführungstermin'), suchen: A_SUCHEN('Ausführungstermin', 'Fertiggestellt', 'Kunde') } },
  { name: 'Agentur, IT und Beratung', passt: (b) => RX_AGENTUR.test(b),
    aenderung: { status: A_STATUS('Entwurf', 'Beauftragt', 'In Arbeit', 'Abgenommen', 'Storniert'), terminWort: 'Abgabetermin',
      spalten: A_SPALTEN('Kunde', 'Abgabetermin'), suchen: A_SUCHEN('Abgabetermin', 'Abgenommen', 'Kunde') } },
];

// --- Grund-Vorlage: Kontakte im CRM (Paket 312, BV2 Kunden) -----------------
// Status-SCHLÜSSEL wie in der Datenbank (interessent, aktiv, kunde, inaktiv);
// Ampel nach dem Betreuungs-Intervall: im Takt grün, bis doppelt so lang gelb,
// danach rot. Das Intervall der Vorlage gilt für neue Kontakte.
const K_STATUS = (interessent: string, aktiv: string, kunde: string, inaktiv: string): VorlageStatus[] => [
  { key: 'interessent', label: interessent, farbe: 'gold' },
  { key: 'aktiv', label: aktiv, farbe: 'info' },
  { key: 'kunde', label: kunde, farbe: 'ok' },
  { key: 'inaktiv', label: inaktiv, farbe: 'dim' },
];
const K_SPALTEN: VorlageSpalte[] = [
  { key: 'firma', label: 'Firma', sichtbar: true },
  { key: 'kontakt', label: 'E-Mail und Telefon', sichtbar: true },
  { key: 'letzter', label: 'Letzter Kontakt', sichtbar: true },
  { key: 'wiedervorlage', label: 'Wiedervorlage', sichtbar: false },
  { key: 'quelle', label: 'Quelle', sichtbar: false },
];
const K_SUCHEN = (einschlafend: string): VorlageSuche[] => [
  { key: 'einschlafend', name: einschlafend, regel: 'ampel=rot' },
  { key: 'bald', name: 'Bald fällig', regel: 'ampel=gelb' },
  { key: 'wiedervorlage', name: 'Wiedervorlage fällig', regel: 'wiedervorlage=faellig' },
  { key: 'nochNie', name: 'Noch nie kontaktiert', regel: 'kontakt=nie' },
  { key: 'ohneMail', name: 'Ohne E-Mail', regel: 'email=leer' },
];

const KONTAKTE: Vorlage = {
  modul: 'kontakte',
  titel: 'Vertrieb / CRM',
  einheit: 'Kontakt',
  einheitPlural: 'Kontakte',
  status: K_STATUS('Interessent', 'Aktiv', 'Kunde', 'Inaktiv'),
  sparten: [],
  spalten: K_SPALTEN,
  ampel: { gruenBis: 0, gelbBis: 0 },
  suchen: K_SUCHEN('Einschlafende Kunden'),
  standkostenTag: 0,
  kundenWort: 'Kunden',
  intervallTage: 30,
};

/** Gleiche Branchen-Erkennung wie Projekte und Aufträge. */
const KONTAKTE_FEINSCHLIFF: Feinschliff[] = [
  { name: 'Kanzlei und Beratung', passt: (b) => RX_KANZLEI.test(b),
    aenderung: { status: K_STATUS('Anfrage', 'Erstgespräch', 'Mandant', 'Ruht'), kundenWort: 'Mandanten', intervallTage: 90,
      suchen: K_SUCHEN('Mandanten ohne Kontakt') } },
  { name: 'Veranstaltungen', passt: (b) => RX_EVENT.test(b),
    aenderung: { status: K_STATUS('Anfrage', 'Im Gespräch', 'Kunde', 'Inaktiv'), intervallTage: 90 } },
  { name: 'Handwerk und Bau', passt: (b) => RX_HANDWERK.test(b),
    aenderung: { status: K_STATUS('Anfrage', 'Im Gespräch', 'Kunde', 'Ruht'), intervallTage: 180,
      suchen: K_SUCHEN('Kunden lange nicht gehört') } },
  { name: 'Agentur, IT und Beratung', passt: (b) => RX_AGENTUR.test(b),
    aenderung: { status: K_STATUS('Lead', 'Im Gespräch', 'Kunde', 'Inaktiv'), intervallTage: 30 } },
];

const VORLAGEN: Record<string, { grund: Vorlage; fein: Feinschliff[] }> = {
  'kfz-bestand': { grund: KFZ_BESTAND, fein: KFZ_FEINSCHLIFF },
  'projekte': { grund: PROJEKTE, fein: PROJEKTE_FEINSCHLIFF },
  'auftraege': { grund: AUFTRAEGE, fein: AUFTRAEGE_FEINSCHLIFF },
  'kontakte': { grund: KONTAKTE, fein: KONTAKTE_FEINSCHLIFF },
};

export function bekannteModule(): string[] {
  return Object.keys(VORLAGEN);
}

function kopie<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Vorlage für ein Modul, mit Feinschliff der Branche (erster Treffer gewinnt). */
export function vorlageFuer(modul: string, branche?: string | null): Vorlage | null {
  const v = VORLAGEN[modul];
  if (!v) return null;
  const basis = kopie(v.grund);
  const b = (branche || '').trim();
  const f = b ? v.fein.find((x) => x.passt(b)) : undefined;
  return f ? { ...basis, ...kopie(f.aenderung) } : basis;
}

/** Name des Feinschliffs für die Anzeige („Vorlage: Motorradhandel"), sonst null. */
export function feinschliffName(modul: string, branche?: string | null): string | null {
  const v = VORLAGEN[modul];
  const b = (branche || '').trim();
  if (!v || !b) return null;
  return v.fein.find((x) => x.passt(b))?.name ?? null;
}

function zahlOder(x: unknown, sonst: number): number {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : sonst;
}

/**
 * Vorlage + Kunde. Regeln:
 *  · Status der Vorlage bleiben immer erhalten (nur umbenennbar); eigene kommen dazu.
 *  · Spalten: Kunde schaltet sichtbar/unsichtbar; unbekannte Schlüssel werden ignoriert.
 *  · Ampel: gelb liegt nie unter grün.
 *  · Suchen: eigene Suchen ergänzen die Vorlage, gleicher Schlüssel ersetzt.
 */
export function mitKunde(v: Vorlage, k?: KundenEinstellung | null): Vorlage {
  const e = kopie(v);
  if (!k || typeof k !== 'object') return e;
  if (k.statusLabels) {
    for (const s of e.status) {
      const neu = k.statusLabels[s.key];
      if (typeof neu === 'string' && neu.trim()) s.label = neu.trim().slice(0, 40);
    }
  }
  if (Array.isArray(k.statusExtra)) {
    for (const s of k.statusExtra) {
      if (!s || typeof s.key !== 'string' || !s.key.trim() || typeof s.label !== 'string' || !s.label.trim()) continue;
      if (e.status.some((x) => x.key === s.key)) continue;
      e.status.push({ key: s.key.trim(), label: s.label.trim().slice(0, 40), farbe: s.farbe ?? 'info' });
    }
  }
  if (Array.isArray(k.sparten)) {
    const s = k.sparten.map((x) => String(x || '').trim()).filter(Boolean);
    if (s.length) e.sparten = Array.from(new Set(s));
  }
  if (k.spaltenSichtbar) {
    for (const sp of e.spalten) if (typeof k.spaltenSichtbar[sp.key] === 'boolean') sp.sichtbar = k.spaltenSichtbar[sp.key];
  }
  if (k.ampel) {
    const g = zahlOder(k.ampel.gruenBis, e.ampel.gruenBis);
    const y = zahlOder(k.ampel.gelbBis, e.ampel.gelbBis);
    e.ampel = { gruenBis: g, gelbBis: Math.max(g, y) };
  }
  if (Array.isArray(k.suchen)) {
    for (const s of k.suchen) {
      if (!s || typeof s.key !== 'string' || typeof s.name !== 'string' || typeof s.regel !== 'string' || !s.name.trim()) continue;
      const i = e.suchen.findIndex((x) => x.key === s.key);
      const neu = { key: s.key, name: s.name.trim().slice(0, 40), regel: s.regel };
      if (i >= 0) e.suchen[i] = neu; else e.suchen.push(neu);
    }
  }
  if (k.standkostenTag !== undefined) e.standkostenTag = zahlOder(k.standkostenTag, e.standkostenTag);
  // Paket 310: Warnschwellen der Projekte (Tage 0–365, Prozent 0–100)
  if (k.warnTage !== undefined && e.warnTage !== undefined) e.warnTage = Math.min(365, Math.trunc(zahlOder(k.warnTage, e.warnTage)));
  if (k.warnProzent !== undefined && e.warnProzent !== undefined) e.warnProzent = Math.min(100, Math.trunc(zahlOder(k.warnProzent, e.warnProzent)));
  // Paket 311: Termin-Wort der Aufträge (nur wo die Vorlage eins hat)
  if (typeof k.terminWort === 'string' && k.terminWort.trim() && e.terminWort !== undefined) e.terminWort = k.terminWort.trim().slice(0, 30);
  // Paket 312: Kunden-Wort und Betreuungs-Intervall der Kontakte (1–730 Tage)
  if (typeof k.kundenWort === 'string' && k.kundenWort.trim() && e.kundenWort !== undefined) e.kundenWort = k.kundenWort.trim().slice(0, 30);
  if (k.intervallTage !== undefined && e.intervallTage !== undefined) {
    const t = Math.trunc(zahlOder(k.intervallTage, e.intervallTage));
    e.intervallTage = Math.min(730, Math.max(1, t));
  }
  return e;
}

/** Ampel nach Standtagen: grün bis gruenBis, gelb bis gelbBis, danach rot. */
export function standtageAmpel(tage: number | null, a: VorlageAmpel): 'ok' | 'warn' | 'bad' | 'dim' {
  if (tage === null || !Number.isFinite(tage)) return 'dim';
  if (tage <= a.gruenBis) return 'ok';
  if (tage <= a.gelbBis) return 'warn';
  return 'bad';
}
