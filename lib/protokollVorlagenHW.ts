// ============================================================================
// ARGONAUT OS · lib/protokollVorlagenHW.ts — MO1v-HW (16.10.2026)
//
// Protokoll-Vorlagen Handwerk & Energie für den Protokoll-Motor
// (Formular-Baukasten). Nur Daten, kein neuer Code-Weg: jede Vorlage wird
// über „Vorlagen verwalten" übernommen, angepasst und gespeichert.
//
// ALLE Fachwerte (Grenzen, Intervalle) sind STARTWERTE aus allgemein
// bekannten Regeln (Stand 10/2026, ohne Gewähr) und im Formular so
// gekennzeichnet. Der Betrieb prüft sie für seinen Fall.
//
// Getestet in tests/protokollVorlagenHW.test.mjs (jede Vorlage gültig).
// ============================================================================

import type { Feld, FeldTyp } from './formularBaukasten';
import type { NormVorlage } from './protokollStart';

type Z = [FeldTyp, string, ({ pflicht?: boolean; optionen?: string[]; einheit?: string; min?: number; max?: number; hilfe?: string })?];

const STARTWERT = 'Startvorlage: Prüfpunkte, Grenzwerte und Fristen sind Startwerte ohne Gewähr. Bitte für Ihren Betrieb und den Einzelfall prüfen und anpassen.';

function vorlage(key: string, titel: string, beschreibung: string, intervall: number | null, zeilen: Z[]): NormVorlage {
  const felder: Feld[] = [{ id: 'f1', typ: 'hinweis', label: STARTWERT }];
  zeilen.forEach(([typ, label, o], i) => {
    const f: Feld = { id: `f${i + 2}`, typ, label };
    if (o?.pflicht) f.pflicht = true;
    if (o?.optionen) f.optionen = o.optionen;
    if (o?.einheit) f.einheit = o.einheit;
    if (typeof o?.min === 'number') f.min = o.min;
    if (typeof o?.max === 'number') f.max = o.max;
    if (o?.hilfe) f.hilfe = o.hilfe;
    felder.push(f);
  });
  return { key, titel, kategorie: 'pruefung', beschreibung, intervall_monate: intervall, felder };
}

const P = { pflicht: true };
const KOPF: Z[] = [['datum', 'Datum', P], ['text', 'Ausgeführt von', P]];
const FUSS: Z[] = [['textlang', 'Mängel / Bemerkungen'], ['foto', 'Fotos'], ['unterschrift', 'Unterschrift Prüfer/in', P]];
const FUSS_KUNDE: Z[] = [['textlang', 'Mängel / Bemerkungen'], ['foto', 'Fotos'], ['unterschrift', 'Unterschrift Monteur/in', P], ['unterschrift', 'Unterschrift Kunde/Betreiber']];

export const VORLAGEN_HW: NormVorlage[] = [
  vorlage('geruest_freigabe', 'Gerüst – Prüfung und Freigabe', 'Vor Benutzung, nach Änderungen und nach Unwetter (Gerüstersteller und Nutzer).', null, [
    ...KOPF,
    ['auswahl', 'Anlass', { pflicht: true, optionen: ['Erstfreigabe nach Aufbau', 'Nach Änderung/Umbau', 'Nach Unwetter/Sturm', 'Prüfung durch Nutzer vor Benutzung'] }],
    ['auswahl', 'Lastklasse', { optionen: ['1', '2', '3', '4', '5', '6'] }],
    ['auswahl', 'Breitenklasse', { optionen: ['W06', 'W09', 'W12', 'W15', 'W18', 'W21', 'W24'] }],
    ['ueberschrift', 'Sichtprüfung'],
    ['pruefpunkt', 'Standsicherheit: Fußplatten, lastverteilende Unterlagen, tragfähiger Untergrund', P],
    ['pruefpunkt', 'Verankerungen nach Plan, Verankerungsraster eingehalten', P],
    ['pruefpunkt', 'Beläge vollständig, fest, ohne Lücken', P],
    ['pruefpunkt', 'Seitenschutz: Geländer, Zwischenholm, Bordbrett', P],
    ['pruefpunkt', 'Aufstiege/Treppen vorhanden und gesichert', P],
    ['pruefpunkt', 'Aussteifungen/Diagonalen vollständig', P],
    ['messwert', 'Abstand Belag zur Wand', { einheit: 'cm', max: 30, hilfe: 'Startwert: ohne Innenseitenschutz höchstens 30 cm' }],
    ['pruefpunkt', 'Kennzeichnung am Zugang angebracht (Ersteller, Last- und Breitenklasse, Freigabe)', P],
    ['auswahl', 'Ergebnis', { pflicht: true, optionen: ['Freigegeben', 'Nicht freigegeben – Sperrschild angebracht'] }],
    ...FUSS,
  ]),
  vorlage('heizung_wartung', 'Heizungswartung Öl/Gas mit Abgasmessung', 'Jährliche Wartung des Wärmeerzeugers mit Messwerten.', 12, [
    ...KOPF,
    ['text', 'Hersteller / Typ'], ['auswahl', 'Brennstoff', { optionen: ['Erdgas', 'Flüssiggas', 'Heizöl'] }],
    ['messwert', 'Nennwärmeleistung', { einheit: 'kW' }],
    ['ueberschrift', 'Wartung'],
    ['pruefpunkt', 'Brenner und Brennraum gereinigt', P],
    ['pruefpunkt', 'Wärmetauscher gereinigt', P],
    ['pruefpunkt', 'Zündung und Flammüberwachung geprüft', P],
    ['pruefpunkt', 'Dichtheit gas-/ölführender Teile', P],
    ['pruefpunkt', 'Sicherheitsventil und Ausdehnungsgefäß geprüft', P],
    ['pruefpunkt', 'Abgasweg / Verbindungsstück dicht', P],
    ['ueberschrift', 'Messungen'],
    ['messwert', 'Abgasverlust', { einheit: '%', max: 11, hilfe: 'Startwert 1. BImSchV: über 4 bis 25 kW höchstens 11 %, über 25 bis 50 kW 10 %, über 50 kW 9 %' }],
    ['messwert', 'Kohlenmonoxid (CO, unverdünnt)', { einheit: 'ppm', hilfe: 'Herstellerangabe eintragen' }],
    ['messwert', 'Abgastemperatur', { einheit: '°C' }],
    ['messwert', 'Sauerstoff (O₂)', { einheit: '%' }],
    ['messwert', 'Anlagendruck Heizwasser', { einheit: 'bar', min: 1, max: 2.5, hilfe: 'Startwert Einfamilienhaus; Anlage beachten' }],
    ...FUSS_KUNDE,
  ]),
  vorlage('lueftung_wartung', 'Lüftungsanlage – Wartung und Hygiene', 'Wartung von Lüftungs- und Klimageräten mit Hygiene-Sichtprüfung.', 12, [
    ...KOPF,
    ['text', 'Gerät / Standort'],
    ['pruefpunkt', 'Filter gewechselt', P],
    ['messwert', 'Filter-Differenzdruck vor Wechsel', { einheit: 'Pa' }],
    ['pruefpunkt', 'Ventilator, Riemen, Lager geprüft', P],
    ['pruefpunkt', 'Wärmetauscher und Kondensatablauf sauber, Siphon gefüllt', P],
    ['pruefpunkt', 'Hygiene-Sichtprüfung: keine Verschmutzung, kein Bewuchs', P],
    ['pruefpunkt', 'Außen- und Fortluftgitter frei', P],
    ['messwert', 'Volumenstrom', { einheit: 'm³/h' }],
    ...FUSS_KUNDE,
  ]),
  vorlage('trinkwasser_kontrolle', 'Trinkwasser-Installation – Temperaturen und Wartung', 'Jährliche Kontrolle der Warmwasserbereitung und Armaturen.', 12, [
    ...KOPF,
    ['messwert', 'Warmwasser am Speicheraustritt', { einheit: '°C', min: 60, hilfe: 'Startwert Großanlage: mindestens 60 °C' }],
    ['messwert', 'Zirkulation Rücklauf', { einheit: '°C', min: 55, hilfe: 'Startwert: höchstens 5 K unter Speicheraustritt' }],
    ['messwert', 'Kaltwasser an der Entnahmestelle', { einheit: '°C', max: 25, hilfe: 'Startwert: Kaltwasser möglichst unter 25 °C' }],
    ['pruefpunkt', 'Filter rückgespült bzw. Einsatz gewechselt', P],
    ['pruefpunkt', 'Sicherungsarmaturen (Rückflussverhinderer, Sicherheitsventil) geprüft', P],
    ['pruefpunkt', 'Keine Stagnation / ungenutzte Leitungen (Totleitungen)', P],
    ['ja_nein', 'Legionellen-Probenahme fällig/veranlasst'],
    ...FUSS_KUNDE,
  ]),
  vorlage('kaeltemittel_dichtheit', 'Kältemittel – Dichtheitskontrolle (F-Gase)', 'Dichtheitskontrolle nach EU-F-Gase-Verordnung mit Kältemittel-Buchung.', 12, [
    ...KOPF,
    ['hinweis', 'Startwerte Intervall nach CO₂-Äquivalent: ab 5 t jährlich, ab 50 t halbjährlich, ab 500 t vierteljährlich; mit Leckage-Erkennung jeweils doppelt so lang. Intervall der Vorlage anpassen.'],
    ['text', 'Anlage / Standort', P], ['text', 'Kältemittel (z. B. R32, R410A)', P],
    ['messwert', 'Füllmenge', { einheit: 'kg', pflicht: true }],
    ['messwert', 'CO₂-Äquivalent', { einheit: 't' }],
    ['text', 'Zertifikat-Nr. der sachkundigen Person', P],
    ['auswahl', 'Prüfverfahren', { optionen: ['Direkt (Lecksuchgerät)', 'Indirekt (Betriebswerte)', 'Beides'] }],
    ['pruefpunkt', 'Anlage dicht', P],
    ['messwert', 'Nachgefüllte Menge', { einheit: 'kg' }],
    ['messwert', 'Zurückgewonnene Menge', { einheit: 'kg' }],
    ...FUSS_KUNDE,
  ]),
  vorlage('sicherheitsmappe_baustelle', 'Sicherheitsmappe Baustelle', 'Vor Arbeitsbeginn: Gefährdungen, Unterweisung, Notfall.', null, [
    ...KOPF,
    ['text', 'Baustelle', P],
    ['pruefpunkt', 'Gefährdungsbeurteilung für diese Baustelle liegt vor', P],
    ['pruefpunkt', 'Unterweisung der Mitarbeiter durchgeführt', P],
    ['pruefpunkt', 'Ersthelfer benannt, Verbandkasten vorhanden', P],
    ['pruefpunkt', 'Feuerlöscher vorhanden und geprüft', P],
    ['pruefpunkt', 'Persönliche Schutzausrüstung vorhanden', P],
    ['pruefpunkt', 'Absturzsicherung / Öffnungen gesichert', P],
    ['pruefpunkt', 'Baustromverteiler geprüft (Prüfplakette)', P],
    ['pruefpunkt', 'Sicherheits- und Gesundheitsschutzplan bekannt (falls vorhanden)', P],
    ['text', 'Notruf / nächstes Krankenhaus'],
    ...FUSS,
  ]),
  vorlage('heizlast_aufnahme', 'Heizlast – Datenaufnahme vor Ort', 'Gebäudedaten für die Heizlastberechnung. Die Berechnung selbst erfolgt im Fachprogramm.', null, [
    ...KOPF,
    ['text', 'Objekt / Adresse', P],
    ['auswahl', 'Gebäudeart', { optionen: ['Einfamilienhaus', 'Doppel-/Reihenhaus', 'Mehrfamilienhaus', 'Gewerbe'] }],
    ['zahl', 'Baujahr'],
    ['messwert', 'Beheizte Wohnfläche', { einheit: 'm²', pflicht: true }],
    ['messwert', 'Norm-Außentemperatur am Standort', { einheit: '°C' }],
    ['auswahl', 'Dach/oberste Geschossdecke', { optionen: ['ungedämmt', 'teilgedämmt', 'gedämmt (nach 2002)'] }],
    ['auswahl', 'Außenwände', { optionen: ['ungedämmt', 'teilgedämmt', 'gedämmt (nach 2002)'] }],
    ['auswahl', 'Fenster', { optionen: ['einfach verglast', 'zweifach (alt)', 'Wärmeschutzglas', 'Dreifachglas'] }],
    ['textlang', 'Räume und Besonderheiten (Bad, Wintergarten, Anbau)'],
    ['messwert', 'Bisheriger Verbrauch pro Jahr', { einheit: 'kWh' }],
    ['foto', 'Fotos'],
  ]),
  vorlage('pv_anmeldemappe', 'PV-Anlage – Inbetriebnahme und Anmeldung', 'Inbetriebnahmeprotokoll mit Messwerten und Anmelde-Checkliste.', null, [
    ...KOPF,
    ['messwert', 'Anlagenleistung', { einheit: 'kWp', pflicht: true }],
    ['text', 'Wechselrichter (Hersteller/Typ)'], ['messwert', 'Speicherkapazität', { einheit: 'kWh' }],
    ['ueberschrift', 'Messungen je Strang'],
    ['messwert', 'Leerlaufspannung Strang 1', { einheit: 'V' }],
    ['messwert', 'Kurzschlussstrom Strang 1', { einheit: 'A' }],
    ['messwert', 'Isolationswiderstand Strang 1', { einheit: 'MΩ', min: 1, hilfe: 'Startwert; Herstellerangabe beachten' }],
    ['ueberschrift', 'Anmeldung'],
    ['ja_nein', 'Netzbetreiber angemeldet', P],
    ['ja_nein', 'Im Marktstammdatenregister eingetragen (Frist beachten)', P],
    ['ja_nein', 'Zählerwechsel/Zweirichtungszähler erledigt'],
    ['ja_nein', 'Unterlagen an Kunden übergeben'],
    ...FUSS_KUNDE,
  ]),
  vorlage('kanal_tv', 'Kanal-TV-Inspektion', 'Befahrung einer Leitung mit Zustandserfassung.', null, [
    ...KOPF,
    ['text', 'Objekt / Leitung (Haltung von – bis)', P],
    ['auswahl', 'Material', { optionen: ['Steinzeug', 'Beton', 'PVC', 'PE/PP', 'Guss', 'Sonstiges'] }],
    ['messwert', 'Nennweite', { einheit: 'DN' }],
    ['messwert', 'Befahrene Länge', { einheit: 'm' }],
    ['mehrfach', 'Festgestellte Schäden', { optionen: ['Riss', 'Bruch/Einsturz', 'Wurzeleinwuchs', 'Versatz', 'Undichte Muffe', 'Ablagerung', 'Korrosion', 'Seitenzulauf schadhaft'] }],
    ['auswahl', 'Zustand (eigene Einstufung)', { optionen: ['keine Mängel', 'geringe Mängel', 'mittlere Mängel', 'starke Mängel', 'Sofortmaßnahme nötig'] }],
    ['text', 'Dateiname der Videoaufnahme'],
    ...FUSS_KUNDE,
  ]),
  vorlage('pruefmittel', 'Prüf- und Messmittel – Überwachung', 'Kalibrierung bzw. Kontrolle eigener Mess- und Prüfgeräte.', 12, [
    ...KOPF,
    ['text', 'Gerät (Hersteller/Typ)', P], ['text', 'Seriennummer', P],
    ['pruefpunkt', 'Gerät äußerlich unbeschädigt, Messleitungen in Ordnung', P],
    ['pruefpunkt', 'Kalibrierschein vorhanden und gültig', P],
    ['messwert', 'Abweichung bei Vergleichsmessung', { einheit: '%', max: 2, hilfe: 'Startwert; Herstellerangabe zur Messgenauigkeit eintragen' }],
    ['auswahl', 'Ergebnis', { pflicht: true, optionen: ['Weiter verwendbar', 'Zur Kalibrierung', 'Ausgesondert'] }],
    ...FUSS,
  ]),
];
