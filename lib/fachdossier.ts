// ============================================================================
// ARGONAUT OS · lib/fachdossier.ts — Paket 214 (05.10.2026) · Stufe 3 B11a
// Fachdossier-Generator für alle 698 Branchen (nach dem Elektro-Richtwert)
//
// RICHTWERT: das Elektro-Dossier vom 30.09.2026 (11 Seiten). Grundsätze, die
// hier fest eingebaut sind:
//  · Nur Gebautes. Die Modul-Listen kommen aus lib/pakete (KERN_MODULE) und
//    lib/branchenkatalog (KATEGORIE_MODULE) — genau das, was ein Betrieb der
//    Kategorie freigeschaltet bekommt. Module „in Aufbau" stehen NICHT in der
//    Liste, sondern unter „Was wir gerade noch bauen – und warum".
//  · Jede Branche individuell: Branchentexte (Alltag, Ablauf eines Auftrags,
//    Schwerpunkte) kommen aus FACH_TEXTE. Fehlt dort ein geprüfter Text,
//    bleibt das Dossier ein ENTWURF (Wasserzeichen, Liste der Lücken).
//    B11b (nach der Abnahme durch den Anwalt) füllt die Texte je Branche.
//  · Kein Mitbewerber-Name, kein Agentur-Kostenvergleich und kein „alles
//    inklusive" (Martin 05.10.2026: KI-Telefon und KI-Berater auf fremden
//    Webseiten kosten extra), „Bausteine" statt „KI-Agenten", „Sie".
//
// Rein, ohne Datenbank — node-testbar. HTML baut lib/fachdossierHtml.ts.
// ============================================================================

import { KERN_MODULE } from './pakete';
import { KATEGORIE_MODULE, STANDARD_AUTOMATION } from './branchenkatalog';
import { NAV_LINKS } from './rechte';

export const FACHDOSSIER_VERSION = 'fd1';
export const BASIS_URL = 'https://argonaut-os.com';

/** Kern-Module, die noch „in Aufbau" sind — erscheinen nie als fertig. */
export const IN_AUFBAU_MODULE = new Set<string>(['marktplaetze', 'mail-sync']);

/** Anzeigenamen, wo das Menü-Wort für ein Dossier nicht passt. */
const NAMEN: Record<string, string> = {
  crm: 'CRM und Kundenakte', kundenakte: 'Kundenakte', leads: 'Anfragen', pipeline: 'Verkaufschancen',
  banking: 'Bank-Abgleich', elster: 'Umsatzsteuer-Werte', datev: 'DATEV-Export und E-Rechnung',
  einsaetze: 'Einsatzplanung', erp: 'Artikel und Lager', gobd: 'GoBD-Archiv', reports: 'Auswertungen',
  'zeit-nachweis': 'Arbeitszeit-Nachweis', signaturen: 'Digitale Unterschrift', marketing: 'Marketing und Newsletter',
  objekte: 'Objekt-Register', wiederkehr: 'Wiedervorlagen', kundenportal: 'Kundenportal', service: 'Service-Tickets',
  personal: 'Personalakte', anlagen: 'Anlagen und AfA', euer: 'EÜR',
  // Paket 217: Namen, die nichts versprechen, was eine Software nicht zusagen kann
  compliance: 'Sofortmeldung und Freistellung', dsgvo: 'Datenschutz-Verwaltung', [STANDARD_AUTOMATION]: 'Automatisierungen',
};

/** Gruppen der Grundausstattung (wie Seite 10 im Elektro-Dossier). */
export const KERN_GRUPPEN: { titel: string; module: string[] }[] = [
  { titel: 'Kunden und Vertrieb', module: ['leads', 'crm', 'kundenakte', 'pipeline', 'angebote', 'auftraege', 'kundenportal', 'online-buchung', 'termine', 'erinnerungen', 'korrespondenz', 'vertraege', 'provisionen'] },
  { titel: 'Geld und Steuer', module: ['rechnungen', 'mahnwesen', 'zahlungen', 'banking', 'datev', 'euer', 'elster', 'finanzen', 'anlagen', 'reisekosten', 'controlling', 'gobd'] },
  { titel: 'Einsatz und Projekte', module: ['einsaetze', 'projekte', 'service', 'objekte', 'wiederkehr', 'aufwand'] },
  { titel: 'Lager und Einkauf', module: ['erp', 'einkauf', 'lager-scanner', 'versand', 'import'] },
  { titel: 'Team', module: ['personal', 'zeit-nachweis', 'schichtplan', 'team-chat', 'signaturen', 'academy'] },
  { titel: 'Sichtbarkeit', module: ['marketing', 'bewertungen', 'reports', 'analytics'] },
  { titel: 'Sicherheit und Recht', module: ['nachweise', 'compliance', 'dsgvo', 'dokumente', 'aktivitaet'] },
];

/** Was gerade noch gebaut wird — mit Grund. `wenn`: nur zeigen, wenn eines dieser Module im Dossier vorkommt. */
export type Vorbereitung = { was: string; heute: string; warum: string; wenn?: string[] };
export const IN_VORBEREITUNG: Vorbereitung[] = [
  { was: 'Bankumsätze automatisch abrufen', heute: 'Kontoauszug als Datei (CSV, CAMT, MT940) einlesen, Zahlungen werden zugeordnet', warum: 'Der direkte Abruf läuft über einen zugelassenen Bank-Partner mit BaFin-Lizenz. Der Partner ist ausgewählt, die Anbindung wird getestet.' },
  { was: 'DATEV und ELSTER direkt', heute: 'DATEV-Export als Datei, Werte für die Umsatzsteuer-Voranmeldung', warum: 'Die direkte Übergabe braucht Zertifizierungen der Schnittstellen von DATEV und Finanzverwaltung. Die Anträge sind in Vorbereitung.' },
  { was: 'Direkte Verbindung zum Großhändler', heute: 'DATANORM- und BMEcat-Dateien einlesen', warum: 'Jeder Großhändler vergibt eigene Zugänge und Schnittstellen. Wir binden die Häuser nach und nach an, beginnend mit denen unserer Kunden.', wenn: ['einkauf', 'erp'] },
  { was: 'Kasse mit zertifizierter TSE', heute: 'Kasse im Probebetrieb', warum: 'Für den echten Kassenbetrieb braucht es eine zertifizierte technische Sicherheitseinrichtung (TSE) über einen Partner. Der Vertrag ist in Vorbereitung.', wenn: ['kasse'] },
  { was: 'Marktplätze und Mail-Kalender-Abgleich', heute: 'Verbindung einrichten, Abgleich in Aufbau', warum: 'Jede Plattform hat eigene Freigaben und Prüfungen für Fremd-Programme. Wir schalten sie erst frei, wenn der Abgleich zuverlässig läuft.' },
  { was: 'Anmeldung bei Werbe- und Social-Plattformen per Login', heute: 'Zugangsdaten werden von Hand hinterlegt', warum: 'Die Plattformen prüfen jede App vor der Freigabe. Die Prüfungen sind beantragt.', wenn: ['marketing'] },
];

/** Geprüfte Branchentexte. Ohne Eintrag bleibt das Dossier ein Entwurf (B11b füllt). */
export type FachText = {
  titel: string;            // „Ihr Elektrobetrieb."
  lead: string;             // Unterzeile der Titelseite
  vorteile: string[];       // 6 Kacheln der Titelseite
  rolle: string;            // „Sie sind Elektromeister. Nicht Sachbearbeiter."
  alltag: { titel: string; text: string }[];
  ablaufTitel: string;      // Beispiel-Auftrag
  ablauf: { titel: string; text: string }[];
  schwerpunkt?: { titel: string; text: string; punkte: { titel: string; text: string }[] };
  zielgruppe: string;       // „Elektrobetriebe" (für „Fachdossier für …")
  geprueftAm: string;       // ISO-Datum der Prüfung
};

export const FACH_TEXTE: Record<string, FachText> = {
  elektriker: {
    zielgruppe: 'Elektrobetriebe',
    titel: 'Ihr Elektrobetrieb. Ein System.',
    lead: 'Vom ersten Anruf bis zur nächsten DGUV-V3-Prüfung in zwölf Monaten: Anfrage, Angebot, Einsatz, Prüfprotokoll, Rechnung und Zahlung laufen in einer Software zusammen.',
    vorteile: ['Angebote, die Kunden online annehmen', 'Einsatzplanung mit Monteur-Handy', 'E-Check mit Wiedervorlage', 'E-Rechnung nach XRechnung und ZUGFeRD', 'DATANORM-Kataloge Ihres Großhändlers', 'Rechenzentren in der EU'],
    rolle: 'Sie sind Elektromeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Angebote am Abend', text: 'Das Aufmaß steht auf dem Block, die Preise in der Großhändler-Liste, das Angebot entsteht nach Feierabend. Und dann hört man vom Kunden nichts mehr.' },
      { titel: 'Wer ist wo?', text: 'Die Wochenplanung hängt an der Wand oder im Kopf. Fällt ein Monteur aus, beginnt das Telefonieren. Die Frage, wer überhaupt die nötige Befähigung hat, kommt oft erst hinterher.' },
      { titel: 'Prüffristen im Blick behalten', text: 'Die DGUV-V3-Prüfung beim Gewerbekunden ist wiederkehrender Umsatz. Aber nur, wenn jemand rechtzeitig daran denkt, bevor der Kunde selbst sucht.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Zehn Programme', text: 'Kalkulation, Kalender, Zeiterfassung, Buchhaltung, Webseite, Mail. Jedes mit eigenem Login, eigener Rechnung und eigener Liste Ihrer Kunden.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Gewerbekunde möchte seine elektrischen Anlagen prüfen lassen.',
    ablauf: [
      { titel: 'Die Anfrage kommt über Ihre Webseite', text: 'Das Kontaktformular legt sie automatisch in Ihrer Kundenliste an. Eine Ampel zeigt, wie lange sie schon wartet.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Positionen kommen aus Ihrem Leistungskatalog. Der Kunde klickt auf „Annehmen", Sie sehen es sofort.' },
      { titel: 'Der Einsatz landet auf dem Handy des Monteurs', text: 'Mit Adresse, Route und Prüfvorlage. Vor Ort hakt er die Prüfpunkte ab, trägt Messwerte ein, macht Fotos und lässt den Kunden auf dem Bildschirm unterschreiben.' },
      { titel: 'Die Rechnung entsteht aus dem Einsatz', text: 'Als E-Rechnung per Mail. Beim Einlesen des Kontoauszugs ordnet das System die Zahlung der Rechnung zu.' },
      { titel: 'Die nächste Prüfung steht schon im Kalender', text: 'Der Wartungsvertrag erinnert Sie 30 Tage vor Fälligkeit. Der Folgeauftrag beginnt, bevor der Kunde daran denkt.' },
    ],
    schwerpunkt: {
      titel: 'Aus jeder Prüfung wird der nächste Auftrag.',
      text: 'Die Wiederholungsprüfung nach DGUV Vorschrift 3 ist planbarer Umsatz. ARGONAUT OS sorgt dafür, dass keine Frist mehr durchrutscht.',
      punkte: [
        { titel: 'Prüfvorlagen für Elektro', text: 'E-Check ortsveränderlicher Geräte nach DIN VDE 0701-0702, ortsfeste Anlagen nach DIN VDE 0105 und Erstprüfung nach DIN VDE 0100-600 — mit Zahlenfeldern für Messwerte und Grenzwerten als Startwert.' },
        { titel: 'Protokoll direkt vor Ort', text: 'Jeder Prüfpunkt als „in Ordnung" oder „Mangel". Liegt ein Messwert außerhalb der Grenze, wird er als Mangel markiert. Das Protokoll gibt es als PDF.' },
        { titel: 'Wartungsverträge mit Erinnerung', text: 'Die Vorlage „DGUV V3 Prüfung (E-Check)" erinnert 30 Tage vorher. Aus der Wartung werden Protokoll und Rechnung per Klick.' },
        { titel: 'Anlagen des Kunden im Verzeichnis', text: 'Jedes Objekt mit Zustand und Fälligkeit. Protokolle und Wartungen hängen direkt daran.' },
      ],
    },
    geprueftAm: '2026-09-30',
  },
  'sanitaer-heizung': {
    zielgruppe: 'SHK-Betriebe',
    titel: 'Ihr SHK-Betrieb. Ein System.',
    lead: 'Von der Anfrage für das neue Bad bis zur jährlichen Heizungswartung: Angebot, Einsatz, Wartungsprotokoll, Rechnung und Zahlung laufen in einer Software zusammen.',
    vorteile: ['Angebote, die Kunden online annehmen', 'Wartungsverträge mit Erinnerung', 'Einsatzplanung mit Monteur-Handy', 'Bautagebuch mit markierten Fotos', 'DATANORM-Kataloge Ihres Großhändlers', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Installateurmeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Angebote am Abend', text: 'Badsanierung: Aufmaß auf dem Block, Sanitärobjekte aus der Großhändler-Liste. Das Angebot entsteht nach Feierabend. Und dann hört man vom Kunden nichts mehr.' },
      { titel: 'Die Heizungssaison', text: 'Im Herbst wollen alle gleichzeitig ihre Wartung. Wer die Termine rechtzeitig vergibt, plant die Saison. Wer nicht, telefoniert hinterher.' },
      { titel: 'Wer ist wo?', text: 'Badbaustelle, Wartungstour, Kundendienst: Die Wochenplanung hängt an der Wand oder im Kopf. Fällt ein Monteur aus, beginnt das Telefonieren.' },
      { titel: 'Mehr als im Angebot', text: 'Hinter der Vorwand liegt ein altes Rohr, das mit raus muss. Ohne Foto und Nachtrag wird die Mehrleistung später zur Diskussion.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte seine Heizung warten lassen.',
    ablauf: [
      { titel: 'Der Termin kommt über Ihre Webseite', text: 'Der Kunde bucht online oder schickt eine Anfrage. Sie landet automatisch in Ihrer Kundenliste.' },
      { titel: 'Der Einsatz landet auf dem Handy des Monteurs', text: 'Mit Adresse, Route und Prüfvorlage „Heizung / Anlage". Vor Ort hakt er Sichtprüfung, Dichtheit, Funktionstest und Einstellwerte ab, macht Fotos und lässt den Kunden unterschreiben.' },
      { titel: 'Ein Mangel geht nicht verloren', text: 'Er steht mit Foto im Protokoll. Daraus schicken Sie dem Kunden direkt ein Angebot für die Reparatur.' },
      { titel: 'Die Rechnung entsteht aus dem Einsatz', text: 'Als E-Rechnung per Mail. Beim Einlesen des Kontoauszugs ordnet das System die Zahlung der Rechnung zu.' },
      { titel: 'Die nächste Wartung steht schon im Kalender', text: 'Der Heizungs-Wartungsvertrag erinnert Sie 30 Tage vor Fälligkeit. Der Folgeauftrag beginnt, bevor der Kunde daran denkt.' },
    ],
    schwerpunkt: {
      titel: 'Jede Wartung bringt die nächste.',
      text: 'Die jährliche Heizungswartung ist planbarer Umsatz. Und Sie sind beim Kunden, wenn eine neue Anlage fällig wird.',
      punkte: [
        { titel: 'Wartungsverträge mit Erinnerung', text: 'Die Vorlage „Heizungs-Wartungsvertrag": jährlich, mit Erinnerung 30 Tage vorher. Aus der Wartung werden Protokoll und Rechnung.' },
        { titel: 'Protokoll direkt vor Ort', text: 'Prüfpunkte abhaken, Ergebnis „bestanden", „Mangel" oder „Nachprüfung nötig". Fotos und Unterschrift gehören dazu.' },
        { titel: 'Anlagen des Kunden im Verzeichnis', text: 'Jede Anlage mit Zustand und Fälligkeit. Wartungen und Protokolle hängen direkt daran.' },
        { titel: 'Bad-Projekte im Griff', text: 'Projekt, Bautagebuch mit markierten Fotos und Nachträge. Das Originalfoto bleibt immer unverändert.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  maler: {
    zielgruppe: 'Malerbetriebe',
    titel: 'Ihr Malerbetrieb. Ein System.',
    lead: 'Vom Aufmaß beim Kunden bis zur Schlussrechnung: Fläche, Kalkulation, Angebot, Einsatz, Baustellen-Doku und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß direkt in die Kalkulation', 'Angebote, die Kunden online annehmen', 'Plantafel per Ziehen und Ablegen', 'Bautagebuch mit markierten Fotos', 'Stundenzettel auf dem Handy', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Malermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Flächen rechnen', text: 'Wände, Decken, minus Fenster und Türen. Erst auf dem Block, dann in der Tabelle, dann im Angebot.' },
      { titel: 'Was kostet der Quadratmeter wirklich?', text: 'Farbe, Abkleben, Streichzeit: Ob sich ein Auftrag gerechnet hat, sieht man oft erst am Jahresende.' },
      { titel: 'Wer streicht wo?', text: 'Mehrere Baustellen, mehrere Kolonnen. Regnet es bei der Fassade, wird die ganze Woche umgeplant.' },
      { titel: 'Was war vorher schon kaputt?', text: 'Risse und Schäden vor Arbeitsbeginn: Ohne Foto wird später darüber gestritten.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Kunde möchte drei Räume und das Treppenhaus streichen lassen.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Raum für Raum, auch als Formel wie „4,2 × 2,6 − 0,9 × 2,1" (Wand minus Tür). Das System rechnet die Fläche.' },
      { titel: 'Die Kalkulation übernimmt das Aufmaß', text: 'Die Vorlage „Maler & Lackierer" rechnet Farbe, Abkleben und Streichzeit je Quadratmeter zum Preis.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Der Kunde klickt auf „Annehmen", Sie sehen es sofort.' },
      { titel: 'Die Kolonne steht auf der Plantafel', text: 'Per Ziehen und Ablegen eingeplant, der Einsatz auf dem Handy. Vorher-Fotos mit Markierungen gehen ins Bautagebuch.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung per Mail. Und Sie sehen, ob die geplanten Stunden gereicht haben.' },
    ],
    schwerpunkt: {
      titel: 'Sie wissen, was ein Quadratmeter Sie kostet.',
      text: 'Aufmaß, Kalkulation und die tatsächlichen Stunden hängen zusammen. Nach jedem Auftrag sehen Sie, ob er sich gerechnet hat.',
      punkte: [
        { titel: 'Aufmaß mit Abzügen', text: 'Fenster und Türen werden direkt abgezogen. Die Fläche geht ohne Abtippen in die Kalkulation.' },
        { titel: 'Kalkulation je Quadratmeter', text: 'Material mit Verschnitt, Zeit je Arbeitsschritt, daraus der Preis.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden der Kolonne gegen die Kalkulation, mit der echten Marge.' },
        { titel: 'Baustellen-Doku', text: 'Fotos mit Pfeil, Kreis und Text markieren. Das Original bleibt als Beweis unverändert.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  schreiner: {
    zielgruppe: 'Schreinereien und Tischlereien',
    titel: 'Ihre Schreinerei. Ein System.',
    lead: 'Vom Aufmaß beim Kunden bis zur Montage: Kalkulation, Angebot, Zuschnitt, Werkstatt-Einsatz und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Kalkulation mit Material, Verschnitt und Zeit', 'Angebote, die Kunden online annehmen', 'Zuschnittplan als PDF', 'Abschlagsrechnungen für große Aufträge', 'Plantafel für Werkstatt und Montage', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Schreinermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Rechnen nach Feierabend', text: 'Platten, Kanten, Beschläge, Stunden in der Werkstatt und bei der Montage. Jede Einbauküche ist eine eigene Kalkulation.' },
      { titel: 'Was bleibt am Ende übrig?', text: 'Verschnitt, Mehrstunden, ein zweiter Montagetag. Ob der Auftrag sich gerechnet hat, zeigt erst die Abrechnung.' },
      { titel: 'Werkstatt oder Baustelle?', text: 'Wer steht an der Maschine, wer montiert beim Kunden? Die Planung hängt an der Wand.' },
      { titel: 'Lange Aufträge, späte Zahlung', text: 'Das Material ist bezahlt, die Werkstatt hat gearbeitet, das Geld kommt erst nach der Montage.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Kunde möchte einen Einbauschrank nach Maß.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Die Maße gehen direkt ins System, auch als Formel.' },
      { titel: 'Die Kalkulation rechnet den Preis', text: 'Die Vorlage „Tischlerei & Schreinerei" rechnet Platte mit Verschnitt, Kanten, Beschläge, Werkstatt- und Montagezeit.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Danach geht die erste Abschlagsrechnung raus.' },
      { titel: 'Werkstatt und Montage stehen auf der Plantafel', text: 'Der Zuschnittplan für Leisten und Profile kommt als PDF in die Werkstatt.' },
      { titel: 'Die Schlussrechnung verrechnet die Abschläge', text: 'Als E-Rechnung per Mail. Und Sie sehen, ob die geplanten Stunden gereicht haben.' },
    ],
    schwerpunkt: {
      titel: 'Jeder Auftrag ist nachgerechnet.',
      text: 'Kalkulation und die tatsächlichen Stunden hängen zusammen. Nach jedem Auftrag wissen Sie, was er wirklich gebracht hat.',
      punkte: [
        { titel: 'Kalkulation je Stück oder Quadratmeter', text: 'Material mit Verschnitt, Zeit je Arbeitsschritt, Maschinenstrom.' },
        { titel: 'Zuschnittplan', text: 'Stangen und Leisten optimal aufgeteilt, mit Sägeschnitt, als PDF für die Werkstatt.' },
        { titel: 'Abschlags- und Schlussrechnung', text: 'Abschläge laufen mit, die Schlussrechnung zieht sie ab.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  dachdecker: {
    zielgruppe: 'Dachdeckerbetriebe',
    titel: 'Ihr Dachdeckerbetrieb. Ein System.',
    lead: 'Vom Aufmaß auf dem Dach bis zur Schlussrechnung: Kalkulation, Angebot, Baustellen-Doku, Nachträge und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß direkt in die Kalkulation', 'Angebote, die Kunden online annehmen', 'Bautagebuch mit markierten Fotos', 'Nachträge mit Begründung', 'Abschlagsrechnungen für große Aufträge', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Dachdeckermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Das Dach von unten erklären', text: 'Der Kunde sieht den Schaden nicht. Ohne Fotos mit Markierung wird jedes Angebot zur Vertrauensfrage.' },
      { titel: 'Unter den Ziegeln wartet die Überraschung', text: 'Morsche Lattung, nasse Dämmung. Ohne Nachtrag mit Foto wird die Mehrleistung zum Streitpunkt.' },
      { titel: 'Das Wetter plant mit', text: 'Regen, Sturm, Frost. Die Woche wird ständig umgeplant, und jede Kolonne muss es wissen.' },
      { titel: 'Große Aufträge, lange Vorleistung', text: 'Material und Gerüst sind bezahlt, bevor der Kunde den ersten Euro überweist.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte sein Dach neu eindecken lassen.',
    ablauf: [
      { titel: 'Die Anfrage kommt über Ihre Webseite', text: 'Das Kontaktformular legt sie automatisch in Ihrer Kundenliste an.' },
      { titel: 'Aufmaß und Fotos vom Dach', text: 'Flächen als Formel, die Schäden auf dem Foto mit Pfeil und Kreis markiert.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Danach geht die erste Abschlagsrechnung raus.' },
      { titel: 'Auf der Baustelle wird alles festgehalten', text: 'Bautagebuch mit Fotos. Kommt eine Überraschung, entsteht ein Nachtrag mit Begründung.' },
      { titel: 'Die Schlussrechnung verrechnet die Abschläge', text: 'Mit den Nachträgen, als E-Rechnung per Mail.' },
    ],
    schwerpunkt: {
      titel: 'Was Sie sehen, sieht auch Ihr Kunde.',
      text: 'Fotos, Markierungen und Nachträge machen aus dem Dach eine nachvollziehbare Baustelle. Für den Kunden und im Streitfall.',
      punkte: [
        { titel: 'Fotos mit Markierung', text: 'Pfeil, Kreis, Rahmen, Text. Das Original bleibt als Beweis unverändert.' },
        { titel: 'Bautagebuch', text: 'Jeder Tag mit Kolonne, Fotos und Notizen.' },
        { titel: 'Nachträge', text: 'Positionen mit Haken „Nachtrag" und Grund, damit nichts verloren geht.' },
        { titel: 'Abschlags- und Schlussrechnung', text: 'Abschläge laufen mit, die Schlussrechnung zieht sie ab.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'photovoltaik-solar-installateure': {
    zielgruppe: 'Solar-Fachbetriebe',
    titel: 'Ihr Solarbetrieb. Ein System.',
    lead: 'Von der Anfrage über das Dach bis zur Inbetriebnahme: Angebot, Projekt, Montage, Prüfprotokoll, Rechnung und Wartung laufen in einer Software zusammen.',
    vorteile: ['Angebote, die Kunden online annehmen', 'Projekte mit allen Schritten im Blick', 'Plantafel für Montage-Kolonnen', 'Prüfprotokoll mit Messwerten', 'Abschlagsrechnungen für große Aufträge', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie bauen Solaranlagen. Nicht Aktenberge.',
    alltag: [
      { titel: 'Viele Anfragen, wenig Zeit', text: 'Jede Anfrage will ein Angebot mit Modulen, Wechselrichter, Speicher und Montage. Wer zu spät antwortet, ist raus.' },
      { titel: 'Ein Projekt, viele Schritte', text: 'Dach ansehen, planen, Material bestellen, Gerüst, Montage, Elektro, Inbetriebnahme. Wo jedes Projekt gerade steht, weiß oft nur einer im Büro.' },
      { titel: 'Kolonnen und Termine', text: 'Montageteam und Elektriker müssen zur richtigen Zeit auf derselben Baustelle sein. Verschiebt sich ein Termin, verschiebt sich die ganze Woche.' },
      { titel: 'Große Summen, lange Vorleistung', text: 'Module und Speicher sind bezahlt, lange bevor die Anlage Strom liefert.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte eine Solaranlage mit Speicher.',
    ablauf: [
      { titel: 'Die Anfrage kommt über Ihre Webseite', text: 'Das Kontaktformular legt sie automatisch in Ihrer Kundenliste an. Eine Ampel zeigt, wie lange sie schon wartet.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Positionen kommen aus Ihrem Leistungskatalog und den DATANORM-Daten Ihres Großhändlers. Der Kunde klickt auf „Annehmen", die erste Abschlagsrechnung geht raus.' },
      { titel: 'Das Projekt führt durch alle Schritte', text: 'Vom Aufmaß des Dachs bis zur Inbetriebnahme, mit Bautagebuch und markierten Fotos.' },
      { titel: 'Die Inbetriebnahme wird protokolliert', text: 'Die Erstprüfung nach DIN VDE 0100-600 mit Zahlenfeldern für Messwerte. Liegt ein Wert außerhalb der Grenze, wird er als Mangel markiert.' },
      { titel: 'Die Schlussrechnung verrechnet die Abschläge', text: 'Als E-Rechnung per Mail. Ein Wartungsvertrag erinnert Sie an die nächste Kontrolle der Anlage.' },
    ],
    schwerpunkt: {
      titel: 'Jedes Projekt auf einen Blick.',
      text: 'Von der Anfrage bis zur Inbetriebnahme sehen Sie, wo jedes Projekt steht, was es kostet und was noch offen ist.',
      punkte: [
        { titel: 'Projekte mit Plan und Ist', text: 'Geplante Stunden und Material gegen das, was wirklich gebraucht wurde, mit der echten Marge.' },
        { titel: 'Plantafel per Ziehen und Ablegen', text: 'Montage und Elektro auf derselben Tafel. Ein Einsatz wird mit der Maus auf einen anderen Tag oder ein anderes Team gezogen.' },
        { titel: 'Prüfprotokoll vor Ort', text: 'Messwerte direkt auf dem Handy eintragen, mit Fotos und Unterschrift des Kunden.' },
        { titel: 'Wartung mit Erinnerung', text: 'Die Anlage steht im Verzeichnis des Kunden. Der Wartungsvertrag erinnert Sie rechtzeitig an die nächste Kontrolle.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'waermepumpen-fachbetriebe': {
    zielgruppe: 'Wärmepumpen-Fachbetriebe',
    titel: 'Ihr Wärmepumpen-Betrieb. Ein System.',
    lead: 'Von der ersten Anfrage über den Einbau bis zur jährlichen Wartung: Angebot, Projekt, Montage, Wartungsprotokoll, Rechnung und Zahlung laufen in einer Software zusammen.',
    vorteile: ['Angebote, die Kunden online annehmen', 'Projekte mit allen Schritten im Blick', 'Wartungsverträge mit Erinnerung', 'Bautagebuch mit markierten Fotos', 'Abschlagsrechnungen für große Aufträge', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie bauen Wärmepumpen ein. Nicht Aktenberge.',
    alltag: [
      { titel: 'Viele Fragen vor dem Auftrag', text: 'Passt eine Wärmepumpe zum Haus? Was kostet sie, wann geht es los? Bis zum Angebot vergehen viele Gespräche, und jedes muss irgendwo notiert sein.' },
      { titel: 'Ein Einbau, viele Gewerke', text: 'Heizung, Elektro, Fundament, manchmal neue Heizkörper. Wer wann auf der Baustelle ist, muss zusammenpassen.' },
      { titel: 'Große Summen, lange Vorleistung', text: 'Das Gerät ist bezahlt, die Kolonne hat gearbeitet. Das Geld kommt erst, wenn die Anlage läuft.' },
      { titel: 'Nach dem Einbau ist vor der Wartung', text: 'Jede eingebaute Wärmepumpe ist ein Kunde für die nächsten Jahre. Aber nur, wenn jemand rechtzeitig an die Wartung denkt.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte seine Gasheizung durch eine Wärmepumpe ersetzen.',
    ablauf: [
      { titel: 'Die Anfrage kommt über Ihre Webseite', text: 'Der Kunde bucht einen Beratungstermin oder schickt eine Anfrage. Sie landet automatisch in Ihrer Kundenliste.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Gerät, Zubehör und Montage aus Ihrem Leistungskatalog. Der Kunde klickt auf „Annehmen", die erste Abschlagsrechnung geht raus.' },
      { titel: 'Das Projekt bringt alle Gewerke zusammen', text: 'Heizung und Elektro auf derselben Plantafel, Bautagebuch mit Fotos, Nachträge mit Begründung.' },
      { titel: 'Die Schlussrechnung verrechnet die Abschläge', text: 'Als E-Rechnung per Mail. Beim Einlesen des Kontoauszugs ordnet das System die Zahlung der Rechnung zu.' },
      { titel: 'Die erste Wartung steht schon im Kalender', text: 'Der Wartungsvertrag erinnert Sie 30 Tage vor Fälligkeit. Aus dem Einbau wird ein Kunde für viele Jahre.' },
    ],
    schwerpunkt: {
      titel: 'Aus jedem Einbau wird ein Wartungskunde.',
      text: 'Die Anlage, der Wartungsvertrag und jedes Protokoll hängen am Kunden. So geht kein Termin verloren.',
      punkte: [
        { titel: 'Anlagen im Verzeichnis', text: 'Jede eingebaute Wärmepumpe mit Zustand und Fälligkeit beim Kunden.' },
        { titel: 'Wartungsverträge mit Erinnerung', text: 'Jährlich, mit Erinnerung 30 Tage vorher. Aus der Wartung werden Protokoll und Rechnung.' },
        { titel: 'Protokoll direkt vor Ort', text: 'Sichtprüfung, Dichtheit, Funktionstest, Einstellwerte. Ergebnis „bestanden", „Mangel" oder „Nachprüfung nötig".' },
        { titel: 'Projekte mit Plan und Ist', text: 'Geplante Stunden gegen die gestempelten, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  bauunternehmen: {
    zielgruppe: 'Bauunternehmen',
    titel: 'Ihr Bauunternehmen. Ein System.',
    lead: 'Von der Ausschreibung bis zur Schlussrechnung: Leistungsverzeichnis, Kalkulation, Bautagebuch, Nachträge, Abschläge und Mängel laufen in einer Software zusammen.',
    vorteile: ['GAEB-Ausschreibungen einlesen und zurückgeben', 'Bautagebuch mit markierten Fotos', 'Nachträge mit Begründung', 'Abschlags- und Schlussrechnung', 'Mängelliste bis zur Abnahme', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie führen Baustellen. Nicht Aktenordner.',
    alltag: [
      { titel: 'Ausschreibungen abtippen', text: 'Das Leistungsverzeichnis kommt als GAEB-Datei oder PDF. Jede Position wird von Hand übertragen, bevor die erste Zahl kalkuliert ist.' },
      { titel: 'Was ist auf der Baustelle passiert?', text: 'Wetter, Mannschaft, Lieferungen, Behinderungen. Wer das nicht täglich festhält, hat im Streitfall nichts in der Hand.' },
      { titel: 'Nachträge gehen verloren', text: 'Zusätzliche Leistungen werden mündlich vereinbart und später vergessen. Ohne Nachweis bleibt der Betrieb auf den Kosten sitzen.' },
      { titel: 'Abschläge und Schlussrechnung', text: 'Welche Abschläge sind gestellt, welche bezahlt? Die Schlussrechnung wird zur Detektivarbeit.' },
      { titel: 'Subunternehmer im Blick', text: 'Liegt die Freistellungsbescheinigung vor? Ist sie noch gültig? Fehlt sie, droht der Steuerabzug von 15 Prozent auf die Rechnung.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Generalunternehmer schreibt einen Rohbau aus.',
    ablauf: [
      { titel: 'Die Ausschreibung kommt als GAEB-Datei', text: 'Das System liest das Leistungsverzeichnis ein. Sie kalkulieren die Preise und geben das Angebot als GAEB-Datei zurück.' },
      { titel: 'Die Baustelle wird zum Projekt', text: 'Mit Plantafel für die Kolonnen und Bautagebuch: jeden Tag Wetter, Mannschaft, Fotos und Notizen.' },
      { titel: 'Mehrleistung wird zum Nachtrag', text: 'Positionen mit Haken „Nachtrag" und Grund, dazu das markierte Foto. Nichts geht verloren.' },
      { titel: 'Abschläge laufen mit', text: 'Abschlagsrechnungen nach Baufortschritt. Die Schlussrechnung zieht sie ab, mit den Nachträgen.' },
      { titel: 'Die Abnahme ist dokumentiert', text: 'Mängel stehen in der Liste mit Frist und Status, bis sie erledigt sind.' },
    ],
    schwerpunkt: {
      titel: 'Jede Baustelle nachvollziehbar.',
      text: 'Bautagebuch, Nachträge, Abschläge und Mängel hängen an einem Projekt. Für die Abrechnung und für den Streitfall.',
      punkte: [
        { titel: 'GAEB rein, GAEB raus', text: 'Ausschreibungen einlesen, kalkulieren und das Angebot im selben Format zurückgeben.' },
        { titel: 'Bautagebuch', text: 'Jeder Tag mit Wetter, Mannschaft, Fotos und Notizen. Fotos mit Markierung, das Original bleibt unverändert.' },
        { titel: 'Nachträge und Abschläge', text: 'Nachträge mit Begründung, Abschläge nach Baufortschritt, die Schlussrechnung rechnet alles zusammen.' },
        { titel: 'Freistellungsbescheinigungen', text: 'Eigene und die der Subunternehmer mit Ablaufdatum. Das System erinnert, bevor eine abläuft.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  fliesenleger: {
    zielgruppe: 'Fliesenlegerbetriebe',
    titel: 'Ihr Fliesenlegerbetrieb. Ein System.',
    lead: 'Vom Aufmaß im Bad bis zur Rechnung: Fläche, Kalkulation, Angebot, Einsatz, Baustellen-Doku und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß direkt in die Kalkulation', 'Angebote, die Kunden online annehmen', 'Plantafel per Ziehen und Ablegen', 'Bautagebuch mit markierten Fotos', 'Nachträge mit Begründung', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Fliesenlegermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Flächen rechnen', text: 'Boden, Wände, Fliesenspiegel, minus Tür und Fenster. Erst auf dem Block, dann in der Tabelle, dann im Angebot.' },
      { titel: 'Was kostet der Quadratmeter wirklich?', text: 'Fliesen mit Verschnitt, Kleber, Fugenmasse, Abdichtung und Zeit. Ob sich ein Auftrag gerechnet hat, sieht man oft erst am Ende.' },
      { titel: 'Unter dem alten Belag', text: 'Der Untergrund ist uneben oder feucht. Ohne Foto und Nachtrag wird die Mehrleistung zur Diskussion.' },
      { titel: 'Wer ist wo?', text: 'Bäder, Küchen, Treppen, mehrere Baustellen gleichzeitig. Die Wochenplanung hängt an der Wand oder im Kopf.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Kunde möchte sein Bad neu fliesen lassen.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Boden und Wände, auch als Formel wie „2,4 × 2,5 − 0,8 × 2,0" (Wand minus Tür). Das System rechnet die Fläche.' },
      { titel: 'Die Kalkulation übernimmt das Aufmaß', text: 'Fliesen mit Verschnitt, Kleber, Fuge und Zeit je Quadratmeter ergeben den Preis.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Der Kunde klickt auf „Annehmen", Sie sehen es sofort.' },
      { titel: 'Der Einsatz steht auf der Plantafel', text: 'Mit Adresse auf dem Handy. Der alte Zustand wird mit Fotos festgehalten, Überraschungen werden zum Nachtrag.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung per Mail. Und Sie sehen, ob die geplanten Stunden gereicht haben.' },
    ],
    schwerpunkt: {
      titel: 'Sie wissen, was ein Quadratmeter Sie kostet.',
      text: 'Aufmaß, Kalkulation und die tatsächlichen Stunden hängen zusammen. Nach jedem Auftrag sehen Sie, ob er sich gerechnet hat.',
      punkte: [
        { titel: 'Aufmaß mit Abzügen', text: 'Türen, Fenster und Wannen werden direkt abgezogen. Die Fläche geht ohne Abtippen in die Kalkulation.' },
        { titel: 'Kalkulation mit Verschnitt', text: 'Material mit Verschnitt, Zeit je Arbeitsschritt, daraus der Preis je Quadratmeter.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden gegen die Kalkulation, mit der echten Marge.' },
        { titel: 'Baustellen-Doku', text: 'Untergrund und Zustand vor Arbeitsbeginn als markierte Fotos. Das Original bleibt als Beweis unverändert.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'metallbau-schmiede': {
    zielgruppe: 'Metallbaubetriebe',
    titel: 'Ihr Metallbaubetrieb. Ein System.',
    lead: 'Vom Aufmaß beim Kunden über die Werkstatt bis zur Montage: Kalkulation, Angebot, Zuschnitt, Einsatz und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Kalkulation mit Material, Zeit und Strom', 'Zuschnittplan mit Materialgewicht', 'Angebote, die Kunden online annehmen', 'Plantafel für Werkstatt und Montage', 'Abschlagsrechnungen für große Aufträge', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Metallbauermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Jedes Teil eine Rechnung', text: 'Stahl nach Gewicht, Zuschnitt, Schweißen, Schleifen, Grundieren, Montage. Jedes Geländer, jedes Tor ist eine eigene Kalkulation.' },
      { titel: 'Verschnitt kostet Geld', text: 'Stangen und Rohre werden zugeschnitten. Wie viel Reststück bleibt, merkt man erst am Lager.' },
      { titel: 'Werkstatt oder Baustelle?', text: 'Wer schweißt in der Halle, wer montiert beim Kunden? Die Planung hängt an der Wand.' },
      { titel: 'Lange Aufträge, späte Zahlung', text: 'Material ist bezahlt, die Werkstatt hat gearbeitet. Das Geld kommt erst nach der Montage.' },
      { titel: 'Dreimal abgetippt', text: 'Was im Angebot stand, wird im Auftrag, auf dem Stundenzettel und in der Rechnung wieder eingetippt. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Kunde möchte ein Treppengeländer aus Stahl.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Die Maße gehen direkt ins System, auch als Formel.' },
      { titel: 'Die Kalkulation rechnet den Preis', text: 'Die Vorlage „Metallbau & Schlosserei" rechnet Stahl mit Verschnitt, Schweißdraht, Zuschnitt, Schweißen, Schleifen und den Strom der Maschinen.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Danach geht die erste Abschlagsrechnung raus.' },
      { titel: 'Der Zuschnittplan geht in die Werkstatt', text: 'Stangen optimal aufgeteilt, mit Sägeschnitt und Gewicht je Meter, als PDF. Werkstatt und Montage stehen auf der Plantafel.' },
      { titel: 'Die Schlussrechnung verrechnet die Abschläge', text: 'Als E-Rechnung per Mail. Und Sie sehen, ob die geplanten Stunden gereicht haben.' },
    ],
    schwerpunkt: {
      titel: 'Vom Stahl bis zur Marge durchgerechnet.',
      text: 'Material, Zuschnitt, Werkstatt und Montage hängen zusammen. Nach jedem Auftrag wissen Sie, was er wirklich gebracht hat.',
      punkte: [
        { titel: 'Kalkulation je Stück', text: 'Material mit Verschnitt, Zeit je Arbeitsschritt und Maschinenstrom ergeben den Preis.' },
        { titel: 'Zuschnitt mit Gewicht', text: 'Stangen und Rohre optimal aufgeteilt. Das Gewicht je Meter rechnet das System aus Querschnitt und Werkstoff.' },
        { titel: 'Abschlags- und Schlussrechnung', text: 'Abschläge laufen mit, die Schlussrechnung zieht sie ab.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'zimmerei-holzbau': {
    zielgruppe: 'Zimmereien und Holzbaubetriebe',
    titel: 'Ihre Zimmerei. Ein System.',
    lead: 'Vom Aufmaß am Dach bis zur Schlussrechnung: Kalkulation, Zuschnitt, Abbund, Montage, Bautagebuch und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Kalkulation mit Holz, Verschnitt und Zeit', 'Zuschnittplan für Balken und Latten', 'Plantafel für Halle und Baustelle', 'Bautagebuch mit markierten Fotos', 'Abschlags- und Schlussrechnung', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Zimmermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Holzliste von Hand', text: 'Sparren, Pfetten, Latten: Die Holzliste entsteht auf Papier und wird für die Bestellung noch einmal abgetippt.' },
      { titel: 'Verschnitt im Kopf', text: 'Wie viele Balken werden gebraucht, wie viel bleibt übrig? Gerechnet wird mit Erfahrung, und das Restholz stapelt sich.' },
      { titel: 'Abbund und Montage', text: 'Wer bindet in der Halle ab, wer richtet auf der Baustelle? Ein Regentag wirft den Plan um.' },
      { titel: 'Große Aufträge, lange Vorleistung', text: 'Das Holz ist bezahlt und abgebunden, bevor der Kunde die erste Rechnung begleicht.' },
      { titel: 'Was war vorher da?', text: 'Morsche Balken und alte Schäden beim Umbau: Ohne Foto und Nachtrag wird die Mehrleistung zum Streitpunkt.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte einen Dachstuhl mit Gaube.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Maße und Flächen direkt ins System, auch als Formel.' },
      { titel: 'Die Kalkulation rechnet den Preis', text: 'Holz mit Verschnitt, Verbindungsmittel, Abbund- und Montagezeit ergeben den Preis.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Danach geht die erste Abschlagsrechnung raus.' },
      { titel: 'Der Zuschnittplan geht in die Halle', text: 'Balken und Latten optimal aufgeteilt, mit Sägeschnitt, als PDF. Halle und Baustelle stehen auf der Plantafel.' },
      { titel: 'Die Schlussrechnung verrechnet die Abschläge', text: 'Mit den Nachträgen aus dem Bautagebuch, als E-Rechnung per Mail.' },
    ],
    schwerpunkt: {
      titel: 'Vom Stamm bis zur Marge durchgerechnet.',
      text: 'Kalkulation, Zuschnitt und die tatsächlichen Stunden hängen zusammen. Nach jedem Auftrag wissen Sie, was er gebracht hat.',
      punkte: [
        { titel: 'Zuschnitt für Balken und Latten', text: 'Stangenware optimal aufgeteilt, mit Sägeschnitt und Reststück, als PDF für die Halle.' },
        { titel: 'Bautagebuch', text: 'Jeder Tag mit Wetter, Mannschaft und Fotos. Fotos mit Markierung, das Original bleibt unverändert.' },
        { titel: 'Nachträge und Abschläge', text: 'Mehrleistung mit Begründung, Abschläge nach Baufortschritt, die Schlussrechnung rechnet alles zusammen.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden von Halle und Baustelle gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'trockenbau-innenausbau': {
    zielgruppe: 'Trockenbau- und Innenausbaubetriebe',
    titel: 'Ihr Trockenbaubetrieb. Ein System.',
    lead: 'Von der Ausschreibung bis zur Schlussrechnung: Aufmaß, Kalkulation, Kolonnen, Nachträge, Abschläge und Mängel laufen in einer Software zusammen.',
    vorteile: ['GAEB-Ausschreibungen einlesen und zurückgeben', 'Aufmaß direkt in die Kalkulation', 'Plantafel für die Kolonnen', 'Nachträge mit Begründung', 'Mängelliste bis zur Abnahme', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Trockenbaumeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Ausschreibungen abtippen', text: 'Das Leistungsverzeichnis kommt vom Generalunternehmer. Jede Position wird von Hand übertragen, bevor die erste Zahl kalkuliert ist.' },
      { titel: 'Wände und Decken rechnen', text: 'Flächen minus Türen, Öffnungen und Aussparungen. Erst auf dem Block, dann in der Tabelle, dann im Angebot.' },
      { titel: 'Viele Baustellen, viele Kolonnen', text: 'Wer ist auf welchem Objekt? Wartet ein Gewerk, steht die Kolonne.' },
      { titel: 'Änderungen auf Zuruf', text: '„Machen Sie da noch eine Vorsatzschale.“ Ohne Nachtrag mit Grund bleibt die Mehrleistung unbezahlt.' },
      { titel: 'Der Generalunternehmer will Nachweise', text: 'Freistellungsbescheinigung, Aufmaß, Abnahme. Fehlt ein Papier, wird die Rechnung nicht bezahlt.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Generalunternehmer schreibt den Innenausbau eines Bürogebäudes aus.',
    ablauf: [
      { titel: 'Die Ausschreibung kommt als GAEB-Datei', text: 'Das System liest das Leistungsverzeichnis ein. Sie kalkulieren und geben das Angebot als GAEB-Datei zurück.' },
      { titel: 'Das Aufmaß entsteht auf der Baustelle', text: 'Wand für Wand, auch als Formel mit Abzügen für Türen und Öffnungen.' },
      { titel: 'Die Kolonnen stehen auf der Plantafel', text: 'Per Ziehen und Ablegen verschoben, der Einsatz auf dem Handy.' },
      { titel: 'Zusatzwünsche werden zum Nachtrag', text: 'Positionen mit Haken „Nachtrag“ und Grund, dazu das Foto.' },
      { titel: 'Abschläge, Abnahme, Schlussrechnung', text: 'Abschläge nach Baufortschritt, Mängel mit Frist bis zur Abnahme, dann die Schlussrechnung.' },
    ],
    schwerpunkt: {
      titel: 'Jede Wand abgerechnet.',
      text: 'Aufmaß, Nachträge und Abschläge hängen am Projekt. Was gebaut wurde, wird auch bezahlt.',
      punkte: [
        { titel: 'GAEB rein, GAEB raus', text: 'Ausschreibungen einlesen, kalkulieren und das Angebot im selben Format zurückgeben.' },
        { titel: 'Aufmaß mit Abzügen', text: 'Türen und Öffnungen werden direkt abgezogen, die Fläche geht in die Abrechnung.' },
        { titel: 'Nachträge und Abschläge', text: 'Mehrleistung mit Begründung, Abschläge nach Baufortschritt, die Schlussrechnung rechnet alles zusammen.' },
        { titel: 'Freistellungsbescheinigung', text: 'Mit Ablaufdatum im System. Sie werden erinnert, bevor sie abläuft.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'maurer-betonbauer': {
    zielgruppe: 'Maurer- und Betonbaubetriebe',
    titel: 'Ihr Maurerbetrieb. Ein System.',
    lead: 'Von der Ausschreibung bis zur Abnahme: Leistungsverzeichnis, Regieberichte, Nachträge, Abschläge und Mängel laufen in einer Software zusammen.',
    vorteile: ['GAEB-Ausschreibungen einlesen und zurückgeben', 'Regieberichte mit Wetter und Mannschaft', 'Nachträge mit Begründung', 'Abschlags- und Schlussrechnung', 'Mängelliste bis zur Abnahme', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Maurermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Stundenlohnarbeiten belegen', text: 'Regiearbeiten werden auf Zettel geschrieben, die verloren gehen. Was nicht unterschrieben ist, wird nicht bezahlt.' },
      { titel: 'Wetter und Behinderungen', text: 'Frost, Regen, fehlende Pläne, wartende Gewerke. Wer das nicht täglich festhält, hat später nichts in der Hand.' },
      { titel: 'Mengen ändern sich', text: 'Mehr Mauerwerk, zusätzliche Aussparungen, andere Betongüte. Ohne Nachtrag wird die Mehrmenge zur Diskussion.' },
      { titel: 'Lange Bauzeit, lange Vorleistung', text: 'Material, Gerät und Lohn sind bezahlt, lange bevor die Schlussrechnung kommt.' },
      { titel: 'Ausschreibungen abtippen', text: 'Das Leistungsverzeichnis kommt als GAEB-Datei. Jede Position von Hand zu übertragen kostet einen Abend.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Bauherr lässt den Rohbau eines Einfamilienhauses erstellen.',
    ablauf: [
      { titel: 'Die Ausschreibung kommt als GAEB-Datei', text: 'Das System liest das Leistungsverzeichnis ein. Sie kalkulieren und geben das Angebot zurück.' },
      { titel: 'Jeder Tag wird zum Regiebericht', text: 'Wetter, Mannschaft, Leistung und Fotos. Der Kunde unterschreibt auf dem Handy.' },
      { titel: 'Mehrmengen werden zum Nachtrag', text: 'Positionen mit Haken „Nachtrag“ und Grund, dazu das markierte Foto.' },
      { titel: 'Abschläge laufen mit', text: 'Abschlagsrechnungen nach Baufortschritt, die Schlussrechnung zieht sie ab.' },
      { titel: 'Die Abnahme ist dokumentiert', text: 'Mängel stehen in der Liste mit Frist und Status, bis sie erledigt sind.' },
    ],
    schwerpunkt: {
      titel: 'Was gebaut wurde, ist belegt.',
      text: 'Regieberichte, Nachträge und Mängel hängen an der Baustelle. Für die Abrechnung und für den Streitfall.',
      punkte: [
        { titel: 'Regieberichte mit Unterschrift', text: 'Wetter, Mannschaft, Stunden und Fotos, vom Kunden auf dem Handy bestätigt.' },
        { titel: 'Nachträge', text: 'Positionen mit Haken „Nachtrag“ und Grund, damit nichts verloren geht.' },
        { titel: 'Abschlags- und Schlussrechnung', text: 'Abschläge nach Baufortschritt, die Schlussrechnung rechnet alles zusammen.' },
        { titel: 'Freistellungsbescheinigungen', text: 'Eigene und die der Subunternehmer mit Ablaufdatum. Das System erinnert rechtzeitig.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'fensterbau-bauelemente': {
    zielgruppe: 'Fensterbau- und Bauelementebetriebe',
    titel: 'Ihr Fensterbaubetrieb. Ein System.',
    lead: 'Vom Aufmaß jedes einzelnen Fensters bis zur Montage: Angebot, Bestellung, Einsatz, Reklamation und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß je Element', 'Angebote, die Kunden online annehmen', 'Plantafel für Montage-Teams', 'Bautagebuch mit markierten Fotos', 'Abschlagsrechnungen für große Aufträge', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie bauen Fenster ein. Nicht Aktenberge.',
    alltag: [
      { titel: 'Jedes Fenster ein eigenes Maß', text: 'Breite, Höhe, Öffnungsart, Glas, Farbe. Ein Zahlendreher im Aufmaß kostet ein ganzes Element.' },
      { titel: 'Lange Lieferzeiten', text: 'Zwischen Auftrag und Montage liegen Wochen. Wer hat bestellt, wann kommt die Ware, wann wird montiert?' },
      { titel: 'Montage-Tage planen', text: 'Ein Haus, zwanzig Fenster, zwei Teams. Kommt die Lieferung später, verschiebt sich alles.' },
      { titel: 'Reklamationen', text: 'Ein Flügel klemmt, eine Dichtung fehlt. Ohne Foto und Ticket geht die Nacharbeit unter.' },
      { titel: 'Anzahlung und Schluss', text: 'Die Elemente sind bestellt und bezahlt, lange bevor der Kunde zahlt.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte alle Fenster und die Haustür tauschen.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Jedes Element mit Maßen und Fotos, direkt ins System.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Positionen aus Ihrem Leistungskatalog. Danach geht die Anzahlung als Abschlagsrechnung raus.' },
      { titel: 'Die Bestellung geht an den Lieferanten', text: 'Artikel und Preise aus den Daten Ihres Lieferanten, die Bestellung im Einkauf.' },
      { titel: 'Die Montage steht auf der Plantafel', text: 'Team und Tag per Ziehen und Ablegen, der Einsatz mit Adresse auf dem Handy. Vorher-Fotos ins Bautagebuch.' },
      { titel: 'Schlussrechnung und Nacharbeit', text: 'Die Schlussrechnung zieht die Anzahlung ab. Eine Reklamation wird zum Service-Ticket mit Foto.' },
    ],
    schwerpunkt: {
      titel: 'Vom Maß bis zur Abnahme lückenlos.',
      text: 'Aufmaß, Bestellung, Montage und Nacharbeit hängen am Auftrag. Nichts geht zwischen den Wochen verloren.',
      punkte: [
        { titel: 'Aufmaß mit Fotos', text: 'Jedes Element mit Maßen und Bild, damit Bestellung und Montage passen.' },
        { titel: 'Einkauf aus dem Auftrag', text: 'Artikel und Preise Ihres Lieferanten, die Bestellung direkt aus dem System.' },
        { titel: 'Abschlags- und Schlussrechnung', text: 'Anzahlung bei Auftrag, die Schlussrechnung zieht sie ab.' },
        { titel: 'Service-Tickets', text: 'Reklamationen mit Foto, Termin und Status, bis die Nacharbeit erledigt ist.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'schlosserei': {
    zielgruppe: 'Schlossereien',
    titel: 'Ihre Schlosserei. Ein System.',
    lead: 'Vom Reparaturauftrag bis zur jährlichen Torprüfung: Angebot, Werkstatt, Einsatz, Prüfprotokoll und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Kalkulation mit Material, Zeit und Strom', 'Zuschnittplan mit Materialgewicht', 'Service-Tickets für Reparaturen', 'Wartungsverträge mit Erinnerung', 'Prüfprotokoll vor Ort', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Schlossermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Viele kleine Aufträge', text: 'Ein Schloss tauschen, ein Gitter schweißen, ein Tor richten. Jeder Auftrag will erfasst, geplant und abgerechnet werden.' },
      { titel: 'Werkstatt oder Kunde?', text: 'Wer steht an der Werkbank, wer fährt raus? Die Planung hängt an der Wand.' },
      { titel: 'Tore wollen geprüft werden', text: 'Kraftbetätigte Tore und Türen müssen regelmäßig geprüft werden. Ein wiederkehrender Auftrag, wenn jemand daran denkt.' },
      { titel: 'Kleinmaterial vergessen', text: 'Schrauben, Beschläge, Schweißdraht. Was nicht notiert wird, steht nicht auf der Rechnung.' },
      { titel: 'Rechnung Wochen später', text: 'Der Auftrag ist erledigt, die Rechnung bleibt liegen. Das Geld fehlt in der Kasse.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Gewerbekunde meldet ein klemmendes Rolltor.',
    ablauf: [
      { titel: 'Die Meldung wird zum Service-Ticket', text: 'Mit Adresse, Beschreibung und Dringlichkeit. Nichts geht im Posteingang unter.' },
      { titel: 'Der Einsatz landet auf dem Handy', text: 'Mit Route, Fotos und Unterschrift des Kunden.' },
      { titel: 'Material und Stunden werden erfasst', text: 'Verbrauchtes Material und gestempelte Zeit gehen direkt in den Auftrag.' },
      { titel: 'Die Rechnung entsteht aus dem Einsatz', text: 'Als E-Rechnung per Mail, am selben Tag.' },
      { titel: 'Aus der Reparatur wird ein Wartungsvertrag', text: 'Jährliche Prüfung mit Erinnerung 30 Tage vorher und Protokoll vor Ort.' },
    ],
    schwerpunkt: {
      titel: 'Aus jeder Reparatur wird ein Stammkunde.',
      text: 'Service-Tickets, Wartungsverträge und Prüfprotokolle hängen am Kunden und an seiner Anlage.',
      punkte: [
        { titel: 'Service-Tickets', text: 'Jede Meldung mit Status, bis sie erledigt und abgerechnet ist.' },
        { titel: 'Wartungsverträge mit Erinnerung', text: 'Intervall frei wählbar, Erinnerung vor Fälligkeit. Aus der Wartung werden Protokoll und Rechnung.' },
        { titel: 'Prüfprotokoll vor Ort', text: 'Prüfpunkte abhaken, Ergebnis „bestanden“, „Mangel“ oder „Nachprüfung nötig“, mit Fotos.' },
        { titel: 'Zuschnitt mit Gewicht', text: 'Stangen und Rohre optimal aufgeteilt, das Gewicht je Meter aus Querschnitt und Werkstoff.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'kaelteanlagenbau': {
    zielgruppe: 'Kälte- und Klimafachbetriebe',
    titel: 'Ihr Kälte- und Klimabetrieb. Ein System.',
    lead: 'Von der Anfrage über den Einbau bis zur regelmäßigen Wartung: Angebot, Projekt, Einsatz, Wartungsprotokoll und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Wartungsverträge mit Erinnerung', 'Anlagen des Kunden im Verzeichnis', 'Service-Tickets für Störungen', 'Einsatzplanung mit Techniker-Handy', 'Prüfprotokoll vor Ort', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Kälteanlagenbauermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Störung im Sommer', text: 'Wenn es heiß wird, fällt die Klimaanlage aus. Alle rufen gleichzeitig an, und jeder Anruf muss irgendwo landen.' },
      { titel: 'Prüfpflichten im Blick', text: 'Viele Anlagen müssen regelmäßig auf Dichtheit geprüft werden. Wer die Fristen nicht kennt, verliert den Auftrag an den Nächsten.' },
      { titel: 'Welche Anlage war das noch?', text: 'Gerät, Baujahr, Kältemittel, letzte Wartung. Die Angaben stehen auf Zetteln oder im Kopf eines Technikers.' },
      { titel: 'Techniker verteilen', text: 'Wartungstour, Störung, Neuanlage. Wer ist wo, und wer hat die nötige Qualifikation?' },
      { titel: 'Rechnung Wochen später', text: 'Der Einsatz ist erledigt, der Bericht liegt im Auto. Die Rechnung kommt viel zu spät.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Supermarkt meldet eine Störung an der Kühlung.',
    ablauf: [
      { titel: 'Die Meldung wird zum Service-Ticket', text: 'Mit Anlage, Dringlichkeit und Ansprechpartner. Nichts geht unter.' },
      { titel: 'Der Einsatz landet auf dem Handy des Technikers', text: 'Mit Adresse, Route und den Daten der Anlage aus dem Verzeichnis.' },
      { titel: 'Vor Ort wird protokolliert', text: 'Prüfpunkte abhaken, Fotos machen, der Kunde unterschreibt auf dem Bildschirm.' },
      { titel: 'Die Rechnung entsteht aus dem Einsatz', text: 'Als E-Rechnung per Mail, mit den Stunden und dem Material aus dem Einsatz.' },
      { titel: 'Die nächste Wartung steht im Kalender', text: 'Der Wartungsvertrag erinnert Sie vor Fälligkeit, in dem Intervall, das Sie festlegen.' },
    ],
    schwerpunkt: {
      titel: 'Jede Anlage mit Geschichte.',
      text: 'Anlage, Wartungen, Störungen und Protokolle hängen am Kunden. Jeder Techniker sieht vor Ort, was zuletzt gemacht wurde.',
      punkte: [
        { titel: 'Anlagen im Verzeichnis', text: 'Jede Anlage mit Zustand und Fälligkeit beim Kunden.' },
        { titel: 'Wartungsverträge mit Erinnerung', text: 'Intervall frei wählbar, Erinnerung vor Fälligkeit, daraus Protokoll und Rechnung.' },
        { titel: 'Service-Tickets', text: 'Störungen mit Status vom Anruf bis zur Rechnung.' },
        { titel: 'Qualifikationen im Blick', text: 'Schulungen und Nachweise der Mitarbeiter mit Ablaufdatum in der Personalakte.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'rollladen-sonnenschutz': {
    zielgruppe: 'Rollladen- und Sonnenschutzbetriebe',
    titel: 'Ihr Rollladenbetrieb. Ein System.',
    lead: 'Vom Aufmaß am Fenster bis zur Reparatur nach Jahren: Angebot, Bestellung, Montage, Service und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß je Element', 'Angebote, die Kunden online annehmen', 'Service-Tickets für Reparaturen', 'Plantafel für Montage-Teams', 'Wartungsverträge mit Erinnerung', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Rollladen- und Sonnenschutzmechatroniker. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Jedes Fenster ein eigenes Maß', text: 'Breite, Höhe, Antrieb, Behang, Farbe. Ein falsches Maß kostet ein ganzes Element.' },
      { titel: 'Die Saison kommt auf einmal', text: 'Im Frühjahr wollen alle ihre Markise. Wer dann nicht geplant hat, verschiebt Kunden in den Sommer.' },
      { titel: 'Reparaturen zwischendurch', text: 'Ein Gurt reißt, ein Motor brummt. Kleine Aufträge, die schnell untergehen.' },
      { titel: 'Lieferzeiten im Blick', text: 'Zwischen Auftrag und Montage liegen Wochen. Wann kommt die Ware, wann wird montiert?' },
      { titel: 'Rechnung Wochen später', text: 'Die Montage ist erledigt, die Rechnung bleibt liegen.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte elektrische Rollläden und eine Markise.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Jedes Element mit Maßen und Fotos, direkt ins System.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Positionen aus Ihrem Leistungskatalog, danach die Anzahlung als Abschlagsrechnung.' },
      { titel: 'Die Bestellung geht an den Lieferanten', text: 'Artikel und Preise aus den Daten Ihres Lieferanten, die Bestellung im Einkauf.' },
      { titel: 'Die Montage steht auf der Plantafel', text: 'Team und Tag per Ziehen und Ablegen, der Einsatz mit Adresse auf dem Handy.' },
      { titel: 'Die Schlussrechnung zieht die Anzahlung ab', text: 'Als E-Rechnung per Mail. Ein späterer Defekt wird zum Service-Ticket.' },
    ],
    schwerpunkt: {
      titel: 'Montage heute, Service für Jahre.',
      text: 'Jedes eingebaute Element hängt am Kunden. Reparaturen und Wartungen finden ihren Weg zurück zu Ihnen.',
      punkte: [
        { titel: 'Aufmaß mit Fotos', text: 'Jedes Element mit Maßen und Bild, damit Bestellung und Montage passen.' },
        { titel: 'Service-Tickets', text: 'Reparaturen mit Foto, Termin und Status, bis sie abgerechnet sind.' },
        { titel: 'Wartungsverträge mit Erinnerung', text: 'Zum Beispiel für Markisen und Antriebe, im Intervall Ihrer Wahl.' },
        { titel: 'Abschlags- und Schlussrechnung', text: 'Anzahlung bei Auftrag, die Schlussrechnung zieht sie ab.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'stuckateur-fassadenbau': {
    zielgruppe: 'Stuckateur- und Fassadenbetriebe',
    titel: 'Ihr Stuckateurbetrieb. Ein System.',
    lead: 'Vom Aufmaß an der Fassade bis zur Schlussrechnung: Fläche, Kalkulation, Kolonnen, Bautagebuch, Nachträge und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß direkt in die Kalkulation', 'Angebote, die Kunden online annehmen', 'Plantafel für die Kolonnen', 'Bautagebuch mit Wetter und Fotos', 'Abschlags- und Schlussrechnung', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Stuckateurmeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Fassadenflächen rechnen', text: 'Wandflächen minus Fenster und Türen, dazu Laibungen. Erst auf dem Block, dann in der Tabelle, dann im Angebot.' },
      { titel: 'Das Wetter plant mit', text: 'Putz und Farbe brauchen trockenes Wetter. Die Woche wird ständig umgeplant.' },
      { titel: 'Was war vorher schon kaputt?', text: 'Risse und Abplatzungen vor Arbeitsbeginn: Ohne Foto wird später darüber gestritten.' },
      { titel: 'Mehr Untergrund als gedacht', text: 'Lose Putzstellen, Hohlstellen. Ohne Nachtrag wird die Mehrleistung zur Diskussion.' },
      { titel: 'Lange Vorleistung', text: 'Gerüst, Material und Lohn sind bezahlt, bevor der Kunde den ersten Euro überweist.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte seine Fassade sanieren und streichen lassen.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Fassadenflächen als Formel mit Abzügen für Fenster und Türen. Das System rechnet die Fläche.' },
      { titel: 'Die Kalkulation übernimmt das Aufmaß', text: 'Material mit Verschnitt und Zeit je Quadratmeter ergeben den Preis.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Danach geht die erste Abschlagsrechnung raus.' },
      { titel: 'Jeder Tag im Bautagebuch', text: 'Wetter, Kolonne, Fotos mit Markierung. Schäden am Untergrund werden zum Nachtrag.' },
      { titel: 'Die Schlussrechnung verrechnet die Abschläge', text: 'Mit den Nachträgen, als E-Rechnung per Mail.' },
    ],
    schwerpunkt: {
      titel: 'Jeder Quadratmeter nachvollziehbar.',
      text: 'Aufmaß, Bautagebuch und Nachträge hängen am Projekt. Was an der Fassade passiert ist, ist belegt.',
      punkte: [
        { titel: 'Aufmaß mit Abzügen', text: 'Fenster und Türen werden direkt abgezogen, die Fläche geht in die Kalkulation.' },
        { titel: 'Bautagebuch mit Wetter', text: 'Jeder Tag mit Wetter, Kolonne und Fotos. Das Originalfoto bleibt unverändert.' },
        { titel: 'Nachträge und Abschläge', text: 'Mehrleistung mit Begründung, Abschläge nach Baufortschritt.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden der Kolonne gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'bodenleger-raumausstatter': {
    zielgruppe: 'Bodenleger und Raumausstatter',
    titel: 'Ihr Bodenlegerbetrieb. Ein System.',
    lead: 'Vom Aufmaß im Raum bis zur Rechnung: Fläche, Kalkulation mit Verschnitt, Angebot, Einsatz und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß direkt in die Kalkulation', 'Kalkulation mit Verschnitt', 'Angebote, die Kunden online annehmen', 'Plantafel per Ziehen und Ablegen', 'Bautagebuch mit markierten Fotos', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Raumausstattermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Räume rechnen', text: 'Flur, Wohnzimmer, Treppe, Nischen. Jede Fläche einzeln gemessen, addiert und ins Angebot übertragen.' },
      { titel: 'Verschnitt kostet Geld', text: 'Bahnenware, Dielen, Muster. Wie viel Material wirklich gebraucht wird, entscheidet über die Marge.' },
      { titel: 'Der Untergrund überrascht', text: 'Unebenheiten, Feuchtigkeit, alter Kleber. Ohne Foto und Nachtrag wird das Spachteln zur Diskussion.' },
      { titel: 'Termine mit anderen Gewerken', text: 'Der Boden kommt zum Schluss. Verschiebt sich der Maler, verschiebt sich der Bodenleger.' },
      { titel: 'Rechnung Wochen später', text: 'Der Boden liegt, die Rechnung bleibt liegen.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Kunde möchte in drei Räumen neues Parkett.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Raum für Raum, auch als Formel. Das System rechnet die Fläche.' },
      { titel: 'Die Kalkulation rechnet mit Verschnitt', text: 'Material mit Verschnitt, Kleber, Leisten und Zeit je Quadratmeter ergeben den Preis.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Der Kunde klickt auf „Annehmen“, Sie sehen es sofort.' },
      { titel: 'Der Einsatz steht auf der Plantafel', text: 'Mit Adresse auf dem Handy. Der Untergrund wird mit Fotos festgehalten.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung per Mail. Und Sie sehen, ob die geplanten Stunden gereicht haben.' },
    ],
    schwerpunkt: {
      titel: 'Sie wissen, was ein Quadratmeter Sie kostet.',
      text: 'Aufmaß, Kalkulation mit Verschnitt und die tatsächlichen Stunden hängen zusammen.',
      punkte: [
        { titel: 'Aufmaß Raum für Raum', text: 'Flächen als Formel, die Summe geht ohne Abtippen in die Kalkulation.' },
        { titel: 'Kalkulation mit Verschnitt', text: 'Material, Verschnitt und Zeit je Arbeitsschritt ergeben den Preis je Quadratmeter.' },
        { titel: 'Untergrund dokumentiert', text: 'Fotos mit Markierung vor Arbeitsbeginn. Das Original bleibt als Beweis unverändert.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'haustechnik-gebaeudeautomation': {
    zielgruppe: 'Haustechnik- und Gebäudeautomationsbetriebe',
    titel: 'Ihr Haustechnik-Betrieb. Ein System.',
    lead: 'Vom Projekt im Neubau bis zur Wartung über Jahre: Angebot, Projekt, Prüfprotokoll, Service und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Projekte mit allen Schritten im Blick', 'Prüfprotokoll mit Messwerten', 'Anlagen des Kunden im Verzeichnis', 'Wartungsverträge mit Erinnerung', 'Service-Tickets für Störungen', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie machen Gebäude intelligent. Nicht Papierkram.',
    alltag: [
      { titel: 'Viele Gewerke, ein Gebäude', text: 'Elektro, Heizung, Lüftung, Steuerung. Wer wann auf der Baustelle ist, muss zusammenpassen.' },
      { titel: 'Was ist wo verbaut?', text: 'Aktoren, Sensoren, Steuerungen. Nach der Übergabe weiß oft nur noch einer, wie die Anlage aufgebaut ist.' },
      { titel: 'Prüfungen und Nachweise', text: 'Erstprüfung, Wiederholungsprüfung, Protokolle für den Bauherrn. Jedes Dokument muss auffindbar sein.' },
      { titel: 'Service nach der Übergabe', text: 'Eine Funktion geht nicht, eine Zeitsteuerung ist falsch. Kleine Störungen, die schnell untergehen.' },
      { titel: 'Lange Projekte, späte Zahlung', text: 'Material und Stunden sind bezahlt, bevor die Schlussrechnung kommt.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Bauträger lässt die Gebäudetechnik eines Mehrfamilienhauses ausführen.',
    ablauf: [
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Positionen aus Ihrem Leistungskatalog und den DATANORM-Daten Ihres Großhändlers.' },
      { titel: 'Das Projekt führt durch alle Schritte', text: 'Plantafel für die Teams, Bautagebuch mit Fotos, Nachträge mit Begründung.' },
      { titel: 'Die Prüfung wird protokolliert', text: 'Erstprüfung nach DIN VDE 0100-600 mit Zahlenfeldern für Messwerte. Ein Wert außerhalb der Grenze wird als Mangel markiert.' },
      { titel: 'Abschläge und Schlussrechnung', text: 'Abschläge nach Baufortschritt, die Schlussrechnung zieht sie ab, als E-Rechnung.' },
      { titel: 'Nach der Übergabe geht es weiter', text: 'Die Anlage steht im Verzeichnis, Störungen werden zu Service-Tickets, Wartungen erinnern sich selbst.' },
    ],
    schwerpunkt: {
      titel: 'Jede Anlage dokumentiert.',
      text: 'Projekt, Protokolle, Anlage und Wartung hängen am Kunden. Auch nach Jahren ist klar, was verbaut wurde.',
      punkte: [
        { titel: 'Prüfprotokolle mit Messwerten', text: 'Vorlagen für Erst- und Wiederholungsprüfung, mit Grenzwerten als Startwert.' },
        { titel: 'Anlagen im Verzeichnis', text: 'Jede Anlage mit Zustand und Fälligkeit, Protokolle hängen direkt daran.' },
        { titel: 'Wartungsverträge mit Erinnerung', text: 'Intervall frei wählbar, daraus Protokoll und Rechnung.' },
        { titel: 'Service-Tickets', text: 'Störungen mit Status vom Anruf bis zur Rechnung.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'estrich-fliesen': {
    zielgruppe: 'Estrich- und Fliesenbetriebe',
    titel: 'Ihr Estrichbetrieb. Ein System.',
    lead: 'Vom Aufmaß im Rohbau bis zur Schlussrechnung: Flächen, Mengen, Kolonnen, Trocknungszeiten im Bautagebuch und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß direkt in die Kalkulation', 'GAEB-Ausschreibungen einlesen und zurückgeben', 'Plantafel für die Kolonnen', 'Bautagebuch mit Wetter und Fotos', 'Abschlags- und Schlussrechnung', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Estrichlegermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Flächen und Mengen', text: 'Quadratmeter mal Dicke ergibt die Menge. Gerechnet wird auf dem Block, bestellt nach Gefühl.' },
      { titel: 'Trocknung abwarten', text: 'Erst wenn der Estrich belegreif ist, kann es weitergehen. Wer das nicht festhält, wird für Verzögerungen anderer verantwortlich gemacht.' },
      { titel: 'Ein Tag, eine Baustelle', text: 'Estrich wird an einem Stück eingebracht. Fällt ein Mann aus oder kommt die Pumpe zu spät, platzt der Tag.' },
      { titel: 'Der Untergrund passt nicht', text: 'Rohdecke uneben, Leitungen zu hoch. Ohne Foto und Nachtrag bleibt die Mehrarbeit unbezahlt.' },
      { titel: 'Ausschreibungen abtippen', text: 'Das Leistungsverzeichnis kommt vom Generalunternehmer. Jede Position von Hand zu übertragen kostet einen Abend.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Bauträger lässt in einem Mehrfamilienhaus Estrich und Fliesen einbauen.',
    ablauf: [
      { titel: 'Die Ausschreibung kommt als GAEB-Datei', text: 'Das System liest das Leistungsverzeichnis ein. Sie kalkulieren und geben das Angebot zurück.' },
      { titel: 'Das Aufmaß entsteht im Rohbau', text: 'Wohnung für Wohnung, Raum für Raum, auch als Formel. Das System rechnet die Fläche.' },
      { titel: 'Die Kolonne steht auf der Plantafel', text: 'Der Einbautag mit Team und Adresse auf dem Handy.' },
      { titel: 'Das Bautagebuch hält die Trocknung fest', text: 'Einbautag, Wetter, Fotos und Notizen zur Belegreife. Jeder sieht, wann es weitergehen kann.' },
      { titel: 'Abschläge und Schlussrechnung', text: 'Abschläge nach Baufortschritt, die Schlussrechnung zieht sie ab, als E-Rechnung.' },
    ],
    schwerpunkt: {
      titel: 'Jeder Einbautag belegt.',
      text: 'Aufmaß, Bautagebuch und Nachträge hängen am Projekt. Wer wann was wo eingebaut hat, ist nachvollziehbar.',
      punkte: [
        { titel: 'Aufmaß Raum für Raum', text: 'Flächen als Formel, die Summe geht ohne Abtippen in die Kalkulation.' },
        { titel: 'Bautagebuch mit Wetter', text: 'Einbautag, Kolonne, Fotos und Notizen. Das Originalfoto bleibt unverändert.' },
        { titel: 'Nachträge', text: 'Mehrarbeit am Untergrund mit Begründung und Foto.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden der Kolonne gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'geruestbau': {
    zielgruppe: 'Gerüstbaubetriebe',
    titel: 'Ihr Gerüstbaubetrieb. Ein System.',
    lead: 'Vom Aufmaß an der Fassade über Standzeit und Verlängerung bis zur Mietrechnung: Angebot, Kolonnen, Gerüstmiete und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Gerüstmiete mit Standzeit', 'Verfügbarkeit Ihres Materials', 'Plantafel für Auf- und Abbau', 'Bautagebuch mit Fotos', 'Angebote, die Kunden online annehmen', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Gerüstbauermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Standzeit läuft und läuft', text: 'Das Gerüst steht länger als geplant. Wer die Verlängerung nicht festhält, verschenkt Miete.' },
      { titel: 'Wo steht was?', text: 'Wie viel Material ist auf welcher Baustelle, was ist im Lager frei? Die Antwort steht auf Zetteln.' },
      { titel: 'Auf- und Abbau planen', text: 'Kolonnen, Lkw, Termine. Verschiebt sich der Maler, verschiebt sich der Abbau.' },
      { titel: 'Wer hat das Gerüst verändert?', text: 'Andere Gewerke bauen um, ein Belag fehlt. Ohne Foto mit Datum bleibt die Frage offen.' },
      { titel: 'Rechnung Wochen später', text: 'Der Abbau ist erledigt, die Mietrechnung bleibt liegen.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Malerbetrieb bestellt ein Fassadengerüst für vier Wochen.',
    ablauf: [
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Aufbau, Abbau und Miete je Woche aus Ihrem Leistungskatalog.' },
      { titel: 'Der Aufbau steht auf der Plantafel', text: 'Kolonne und Tag per Ziehen und Ablegen, der Einsatz mit Adresse auf dem Handy.' },
      { titel: 'Die Standzeit läuft im System', text: 'Beginn und Ende der Miete, mit Wochenstaffel. Läuft die Zeit ab, sehen Sie es sofort.' },
      { titel: 'Die Übergabe ist dokumentiert', text: 'Fotos des fertigen Gerüsts mit Datum im Bautagebuch.' },
      { titel: 'Die Rechnung kommt mit dem Abbau', text: 'Aufbau, Abbau und tatsächliche Miettage, als E-Rechnung per Mail.' },
    ],
    schwerpunkt: {
      titel: 'Jeder Miettag abgerechnet.',
      text: 'Standzeit, Verlängerung und Material hängen am Auftrag. Keine Woche Miete geht mehr verloren.',
      punkte: [
        { titel: 'Gerüstmiete', text: 'Miettage mit Wochenstaffel, Verlängerungen und überfällige Rückgaben auf einen Blick.' },
        { titel: 'Verfügbarkeit', text: 'Welches Material ist wann frei? Das System prüft Überschneidungen.' },
        { titel: 'Plantafel für Auf- und Abbau', text: 'Kolonnen per Ziehen und Ablegen auf einen anderen Tag oder ein anderes Team.' },
        { titel: 'Fotos mit Datum', text: 'Der Zustand bei Übergabe und Abbau, markiert. Das Original bleibt unverändert.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'glaserei': {
    zielgruppe: 'Glasereien',
    titel: 'Ihre Glaserei. Ein System.',
    lead: 'Vom Notruf bei Glasbruch bis zur Ganzglasanlage: Aufmaß, Angebot, Bestellung, Einsatz und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Service-Tickets für Glasbruch', 'Aufmaß je Element', 'Angebote, die Kunden online annehmen', 'Einsatzplanung mit Monteur-Handy', 'Einkauf aus dem Auftrag', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Glasermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Glasbruch kommt ohne Termin', text: 'Eine Scheibe ist kaputt, der Kunde will heute Hilfe. Der Anruf muss sofort irgendwo landen.' },
      { titel: 'Jede Scheibe ein eigenes Maß', text: 'Breite, Höhe, Glasart, Sicherheitsglas. Ein Zahlendreher kostet eine ganze Scheibe.' },
      { titel: 'Bestellen und warten', text: 'Zwischen Aufmaß und Einbau liegt die Lieferzeit. Wann kommt das Glas, wann wird eingebaut?' },
      { titel: 'Für die Versicherung belegen', text: 'Schaden, Ursache, Reparatur: Der Kunde braucht Fotos und eine saubere Rechnung.' },
      { titel: 'Kleine Aufträge gehen unter', text: 'Eine Scheibe hier, eine Dichtung dort. Was nicht erfasst ist, wird nicht abgerechnet.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Ladengeschäft meldet eine eingeschlagene Schaufensterscheibe.',
    ablauf: [
      { titel: 'Die Meldung wird zum Service-Ticket', text: 'Mit Adresse, Dringlichkeit und Fotos. Nichts geht unter.' },
      { titel: 'Der Einsatz landet auf dem Handy', text: 'Notverglasung vor Ort, Aufmaß der neuen Scheibe, Fotos vom Schaden.' },
      { titel: 'Die Scheibe wird bestellt', text: 'Artikel und Preise aus den Daten Ihres Lieferanten, die Bestellung im Einkauf.' },
      { titel: 'Der Einbau wird geplant', text: 'Termin und Team auf der Plantafel, der Kunde unterschreibt nach dem Einbau auf dem Bildschirm.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Mit Fotos vom Schaden in der Akte, als E-Rechnung per Mail.' },
    ],
    schwerpunkt: {
      titel: 'Vom Notruf bis zur Rechnung lückenlos.',
      text: 'Ticket, Fotos, Bestellung und Einbau hängen am Auftrag. Der Kunde bekommt alles, was er für seine Unterlagen braucht.',
      punkte: [
        { titel: 'Service-Tickets', text: 'Jeder Glasbruch mit Status vom Anruf bis zur Rechnung.' },
        { titel: 'Aufmaß mit Fotos', text: 'Jedes Element mit Maßen und Bild, damit die Bestellung passt.' },
        { titel: 'Einkauf aus dem Auftrag', text: 'Artikel und Preise Ihres Lieferanten, die Bestellung direkt aus dem System.' },
        { titel: 'Fotos mit Markierung', text: 'Der Schaden auf dem Foto markiert, das Original bleibt als Beweis unverändert.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'bauklempnerei-spenglerei': {
    zielgruppe: 'Klempnereien und Spenglereien',
    titel: 'Ihre Spenglerei. Ein System.',
    lead: 'Vom Aufmaß am Dach bis zur Schlussrechnung: Kalkulation, Zuschnitt, Montage, Bautagebuch und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß direkt in die Kalkulation', 'Zuschnittplan für Rinnen und Rohre', 'Bautagebuch mit markierten Fotos', 'Nachträge mit Begründung', 'Abschlagsrechnungen für große Aufträge', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Klempnermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Laufende Meter rechnen', text: 'Rinnen, Fallrohre, Anschlüsse, Kehlen. Jede Länge einzeln gemessen und von Hand addiert.' },
      { titel: 'Blech ist teuer', text: 'Kupfer, Zink, Aluminium. Jeder Meter Verschnitt geht direkt von der Marge ab.' },
      { titel: 'Werkstatt oder Dach?', text: 'Kanten in der Werkstatt, Montage auf dem Dach. Die Planung hängt an der Wand.' },
      { titel: 'Überraschung am Dachrand', text: 'Das Traufblech ist durchgerostet, die Unterkonstruktion morsch. Ohne Foto und Nachtrag wird es zur Diskussion.' },
      { titel: 'Kleine Reparaturen, große Wege', text: 'Eine undichte Rinne hier, ein Anschluss dort. Kleine Aufträge, die im Alltag untergehen.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer lässt Dachrinnen und Fallrohre erneuern.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Längen als Formel, dazu Fotos mit Markierung der Schadstellen.' },
      { titel: 'Die Kalkulation rechnet den Preis', text: 'Material mit Verschnitt, Formteile und Montagezeit ergeben den Preis.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Der Kunde klickt auf „Annehmen“, Sie sehen es sofort.' },
      { titel: 'Der Zuschnittplan geht in die Werkstatt', text: 'Rinnen und Rohre optimal aufgeteilt, mit Reststück, als PDF.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Mit Nachträgen aus dem Bautagebuch, als E-Rechnung per Mail.' },
    ],
    schwerpunkt: {
      titel: 'Jeder Meter durchgerechnet.',
      text: 'Aufmaß, Zuschnitt und die tatsächlichen Stunden hängen zusammen. Nach jedem Auftrag wissen Sie, was er gebracht hat.',
      punkte: [
        { titel: 'Zuschnitt für Rinnen und Rohre', text: 'Stangenware optimal aufgeteilt, mit Sägeschnitt und Reststück.' },
        { titel: 'Kalkulation mit Verschnitt', text: 'Material, Formteile und Zeit je Arbeitsschritt ergeben den Preis.' },
        { titel: 'Nachträge mit Foto', text: 'Schäden am Dachrand mit Begründung und markiertem Foto.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'parkettleger': {
    zielgruppe: 'Parkettlegerbetriebe',
    titel: 'Ihr Parkettbetrieb. Ein System.',
    lead: 'Vom neuen Landhausdielenboden bis zum Abschleifen nach Jahren: Aufmaß, Kalkulation, Einsatz, Pflege und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß direkt in die Kalkulation', 'Angebote, die Kunden online annehmen', 'Plantafel per Ziehen und Ablegen', 'Pflege- und Renovierungstermine mit Erinnerung', 'Bautagebuch mit markierten Fotos', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Parkettlegermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Neu oder renovieren?', text: 'Neuer Boden, Abschleifen, Ölen, Versiegeln. Jede Leistung wird anders gerechnet und anders geplant.' },
      { titel: 'Holz verzeiht keine Fehler', text: 'Raumklima, Feuchte, Untergrund. Was vor dem Verlegen geprüft wurde, muss festgehalten sein.' },
      { titel: 'Möbel raus, Boden fertig', text: 'Der Kunde hat einen festen Zeitraum. Jeder Tag Verzug kostet Vertrauen.' },
      { titel: 'Der Boden lebt weiter', text: 'Nach ein paar Jahren braucht er Pflege. Ein Folgeauftrag, wenn jemand daran denkt.' },
      { titel: 'Rechnung Wochen später', text: 'Der Boden ist fertig, die Rechnung bleibt liegen.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Kunde lässt sein altes Eichenparkett abschleifen und neu ölen.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Raum für Raum, dazu Fotos vom Zustand mit Markierung der Schäden.' },
      { titel: 'Die Kalkulation rechnet den Preis', text: 'Schleifgänge, Öl, Kitt und Zeit je Quadratmeter ergeben den Preis.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Der Kunde klickt auf „Annehmen“, Sie sehen es sofort.' },
      { titel: 'Der Einsatz steht auf der Plantafel', text: 'Mit Adresse auf dem Handy. Zustand vorher und nachher im Bautagebuch.' },
      { titel: 'Rechnung und nächster Termin', text: 'Die Rechnung als E-Rechnung per Mail, die nächste Pflege als Termin mit Erinnerung.' },
    ],
    schwerpunkt: {
      titel: 'Ein Boden, ein Kunde für Jahre.',
      text: 'Aufmaß, Fotos und Pflegetermine hängen am Kunden. Der nächste Auftrag beginnt, bevor er an einen anderen denkt.',
      punkte: [
        { titel: 'Wiederkehrende Pflege', text: 'Pflege- und Renovierungstermine im Intervall Ihrer Wahl, mit Erinnerung vor Fälligkeit.' },
        { titel: 'Zustand dokumentiert', text: 'Fotos vorher und nachher mit Markierung. Das Original bleibt als Beweis unverändert.' },
        { titel: 'Kalkulation je Quadratmeter', text: 'Material, Arbeitsgänge und Zeit ergeben den Preis.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'kaminkehrer': {
    zielgruppe: 'Schornsteinfegerbetriebe',
    titel: 'Ihr Schornsteinfegerbetrieb. Ein System.',
    lead: 'Von der Kehrtour bis zur Rechnung: Termine, Objekte mit Feuerstätten, Protokolle vor Ort und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Wiederkehrende Termine mit Erinnerung', 'Objekte mit Feuerstätten im Verzeichnis', 'Prüfprotokoll vor Ort', 'Einsatzplanung mit Handy', 'Online-Terminbuchung', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Schornsteinfegermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Hunderte Termine im Jahr', text: 'Kehren, Messen, Prüfen. Jedes Objekt hat eigene Fristen, und jede muss eingehalten werden.' },
      { titel: 'Niemand zu Hause', text: 'Der Termin steht, der Kunde ist nicht da. Neuer Termin, neue Fahrt, neues Telefonat.' },
      { titel: 'Welche Feuerstätte war das?', text: 'Gerät, Baujahr, letzte Messung. Die Angaben stehen auf Karteikarten oder im Kopf.' },
      { titel: 'Touren planen', text: 'Straße für Straße, Ort für Ort. Wer fährt wann wohin, und was ist auf dem Weg noch fällig?' },
      { titel: 'Rechnung nach jedem Besuch', text: 'Viele kleine Beträge. Was nicht sofort abgerechnet wird, bleibt liegen.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer hat seine jährliche Feuerstättenschau.',
    ablauf: [
      { titel: 'Der Termin steht im Kalender', text: 'Das Intervall läuft im System. Der Kunde bekommt rechtzeitig Bescheid oder bucht selbst online.' },
      { titel: 'Der Einsatz landet auf dem Handy', text: 'Mit Adresse, Route und den Feuerstätten des Objekts aus dem Verzeichnis.' },
      { titel: 'Vor Ort wird protokolliert', text: 'Prüfpunkte abhaken, Fotos machen, der Kunde unterschreibt auf dem Bildschirm.' },
      { titel: 'Die Rechnung entsteht aus dem Einsatz', text: 'Am selben Tag, als E-Rechnung per Mail.' },
      { titel: 'Der nächste Termin steht schon', text: 'Das Intervall läuft weiter. Nichts muss neu eingetragen werden.' },
    ],
    schwerpunkt: {
      titel: 'Jede Frist im Griff.',
      text: 'Objekte, Feuerstätten, Termine und Protokolle hängen zusammen. Das System erinnert, bevor etwas fällig wird.',
      punkte: [
        { titel: 'Objekte im Verzeichnis', text: 'Jedes Objekt mit seinen Feuerstätten, Zustand und Fälligkeit.' },
        { titel: 'Wiederkehrende Termine', text: 'Intervall frei wählbar, mit Erinnerung vor Fälligkeit.' },
        { titel: 'Protokoll vor Ort', text: 'Prüfpunkte, Ergebnis, Fotos und Unterschrift auf dem Handy.' },
        { titel: 'Online-Terminbuchung', text: 'Kunden wählen selbst einen freien Termin über Ihre Webseite.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'pflasterbau': {
    zielgruppe: 'Pflasterbaubetriebe',
    titel: 'Ihr Pflasterbaubetrieb. Ein System.',
    lead: 'Vom Aufmaß der Einfahrt bis zur Schlussrechnung: Flächen, Material, Kolonnen, Bautagebuch und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß direkt in die Kalkulation', 'Angebote, die Kunden online annehmen', 'Plantafel für die Kolonnen', 'Bautagebuch mit Wetter und Fotos', 'Abschlagsrechnungen für große Aufträge', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Straßenbauermeister. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Flächen und Tonnen', text: 'Quadratmeter Pflaster, Tonnen Schotter, Meter Randstein. Alles einzeln gerechnet und von Hand ins Angebot übertragen.' },
      { titel: 'Das Wetter plant mit', text: 'Frost und Dauerregen stoppen die Baustelle. Die Woche wird ständig umgeplant.' },
      { titel: 'Was liegt im Boden?', text: 'Leitungen, Wurzeln, alter Unterbau. Ohne Foto und Nachtrag wird der Mehraufwand zur Diskussion.' },
      { titel: 'Kolonnen und Maschinen', text: 'Wer ist mit welchem Gerät auf welcher Baustelle? Die Planung hängt an der Wand.' },
      { titel: 'Große Aufträge, lange Vorleistung', text: 'Material und Maschinen sind bezahlt, bevor der Kunde den ersten Euro überweist.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte Einfahrt und Terrasse neu pflastern.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Flächen als Formel, Randsteine in laufenden Metern, dazu Fotos.' },
      { titel: 'Die Kalkulation rechnet den Preis', text: 'Pflaster mit Verschnitt, Unterbau, Randsteine und Zeit ergeben den Preis.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Danach geht die erste Abschlagsrechnung raus.' },
      { titel: 'Jeder Tag im Bautagebuch', text: 'Wetter, Kolonne, Fotos. Was im Boden gefunden wird, wird zum Nachtrag.' },
      { titel: 'Die Schlussrechnung verrechnet die Abschläge', text: 'Mit den Nachträgen, als E-Rechnung per Mail.' },
    ],
    schwerpunkt: {
      titel: 'Jeder Quadratmeter abgerechnet.',
      text: 'Aufmaß, Bautagebuch und Nachträge hängen am Projekt. Was gebaut wurde, wird auch bezahlt.',
      punkte: [
        { titel: 'Aufmaß mit Formel', text: 'Flächen und laufende Meter, die Summen gehen in die Kalkulation.' },
        { titel: 'Bautagebuch mit Wetter', text: 'Jeder Tag mit Kolonne und Fotos. Das Originalfoto bleibt unverändert.' },
        { titel: 'Nachträge und Abschläge', text: 'Mehrleistung mit Begründung, Abschläge nach Baufortschritt.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'zaunbau': {
    zielgruppe: 'Zaunbaubetriebe',
    titel: 'Ihr Zaunbaubetrieb. Ein System.',
    lead: 'Vom Aufmaß am Grundstück bis zur Montage: laufende Meter, Elemente, Tore, Bestellung, Einsatz und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Aufmaß in laufenden Metern', 'Kalkulation je Meter und Element', 'Angebote, die Kunden online annehmen', 'Einkauf aus dem Auftrag', 'Plantafel für Montage-Teams', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Zaunbauer. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Meter, Pfosten, Tore', text: 'Länge messen, Pfosten zählen, Tor und Pforte dazu. Jedes Grundstück eine eigene Rechnung.' },
      { titel: 'Die Grenze ist nicht gerade', text: 'Hanglage, Ecken, Bestand. Was vor Ort gesehen wurde, muss festgehalten sein.' },
      { titel: 'Lieferzeiten im Blick', text: 'Elemente und Tore werden bestellt. Wann kommt die Ware, wann wird montiert?' },
      { titel: 'Fundamente und Wetter', text: 'Beton braucht trockenes Wetter. Die Montagetage verschieben sich ständig.' },
      { titel: 'Rechnung Wochen später', text: 'Der Zaun steht, die Rechnung bleibt liegen.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Hausbesitzer möchte einen Doppelstabmattenzaun mit Tor.',
    ablauf: [
      { titel: 'Das Aufmaß entsteht vor Ort', text: 'Laufende Meter, Ecken und Tore, dazu Fotos vom Grundstück.' },
      { titel: 'Die Kalkulation rechnet den Preis', text: 'Elemente, Pfosten, Fundamente und Montagezeit je Meter ergeben den Preis.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Danach wird das Material bestellt.' },
      { titel: 'Die Montage steht auf der Plantafel', text: 'Team und Tag per Ziehen und Ablegen, der Einsatz mit Adresse auf dem Handy.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung per Mail. Und Sie sehen, ob die geplanten Stunden gereicht haben.' },
    ],
    schwerpunkt: {
      titel: 'Jeder Meter durchgerechnet.',
      text: 'Aufmaß, Material und Montage hängen am Auftrag. Nach jedem Zaun wissen Sie, was er gebracht hat.',
      punkte: [
        { titel: 'Aufmaß in Metern', text: 'Längen als Formel, die Summe geht in die Kalkulation.' },
        { titel: 'Einkauf aus dem Auftrag', text: 'Elemente und Tore mit den Preisen Ihres Lieferanten bestellen.' },
        { titel: 'Fotos mit Markierung', text: 'Grundstück und Bestand vor der Montage. Das Original bleibt unverändert.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'baggerbetriebe-erdbau': {
    zielgruppe: 'Erdbau- und Baggerbetriebe',
    titel: 'Ihr Erdbaubetrieb. Ein System.',
    lead: 'Vom Aushub bis zur Schlussrechnung: Regieberichte, Maschinen und Fahrer, Nachträge, Abschläge und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Regieberichte mit Unterschrift', 'Plantafel für Fahrer und Maschinen', 'Bautagebuch mit Wetter und Fotos', 'Nachträge mit Begründung', 'Abschlags- und Schlussrechnung', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie sind Baggerunternehmer. Nicht Sachbearbeiter.',
    alltag: [
      { titel: 'Stunden auf Zetteln', text: 'Baggerstunden, Lkw-Fahrten, Fahrerstunden. Die Zettel kommen am Freitag, wenn überhaupt.' },
      { titel: 'Was liegt im Boden?', text: 'Fels, Altlasten, alte Leitungen. Ohne Foto und Nachtrag bleibt der Mehraufwand unbezahlt.' },
      { titel: 'Maschinen und Fahrer', text: 'Welcher Bagger ist wo, welcher Fahrer kann ihn fahren? Die Planung steht im Kopf des Chefs.' },
      { titel: 'Das Wetter plant mit', text: 'Dauerregen macht die Baustelle unbefahrbar. Die Woche wird umgeplant.' },
      { titel: 'Stundenlohnarbeiten belegen', text: 'Was der Bauleiter zusätzlich will, muss unterschrieben sein. Sonst gibt es Streit bei der Abrechnung.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Bauunternehmen beauftragt den Aushub für ein Einfamilienhaus.',
    ablauf: [
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Aushub, Abfuhr und Maschinenstunden aus Ihrem Leistungskatalog.' },
      { titel: 'Fahrer und Maschine stehen auf der Plantafel', text: 'Per Ziehen und Ablegen eingeplant, der Einsatz mit Adresse auf dem Handy.' },
      { titel: 'Jeder Tag wird zum Regiebericht', text: 'Stunden, Wetter, Fotos. Der Bauleiter unterschreibt auf dem Handy.' },
      { titel: 'Überraschungen werden zum Nachtrag', text: 'Fels oder Leitungen im Boden: Position mit Haken „Nachtrag“, Grund und Foto.' },
      { titel: 'Abschläge und Schlussrechnung', text: 'Die Schlussrechnung zieht die Abschläge ab, mit den Nachträgen, als E-Rechnung.' },
    ],
    schwerpunkt: {
      titel: 'Jede Stunde belegt.',
      text: 'Regieberichte, Nachträge und Fotos hängen an der Baustelle. Was gearbeitet wurde, wird auch bezahlt.',
      punkte: [
        { titel: 'Regieberichte mit Unterschrift', text: 'Stunden, Wetter und Fotos, vom Kunden auf dem Handy bestätigt.' },
        { titel: 'Plantafel', text: 'Fahrer und Einsätze per Ziehen und Ablegen auf einen anderen Tag.' },
        { titel: 'Nachträge', text: 'Positionen mit Haken „Nachtrag“ und Grund, damit nichts verloren geht.' },
        { titel: 'Abschlags- und Schlussrechnung', text: 'Abschläge nach Baufortschritt, die Schlussrechnung rechnet alles zusammen.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
  'werbetechnik-schilderbau': {
    zielgruppe: 'Werbetechnik- und Schilderbaubetriebe',
    titel: 'Ihr Werbetechnik-Betrieb. Ein System.',
    lead: 'Vom Entwurf über die Freigabe des Kunden bis zur Montage: Angebot, Projekt, Produktion, Einsatz und Rechnung laufen in einer Software zusammen.',
    vorteile: ['Angebote, die Kunden online annehmen', 'Freigabe des Kunden im Kundenportal', 'Projekte mit allen Schritten im Blick', 'Plantafel für Produktion und Montage', 'Kalkulation mit Material und Zeit', 'E-Rechnung nach XRechnung und ZUGFeRD'],
    rolle: 'Sie machen Firmen sichtbar. Nicht Papierkram.',
    alltag: [
      { titel: 'Freigabe per Mail-Kette', text: 'Entwurf, Korrektur, noch eine Korrektur. Am Ende weiß niemand, welche Version freigegeben ist.' },
      { titel: 'Jeder Auftrag anders', text: 'Folie, Platte, Leuchtbuchstaben, Fahrzeugbeschriftung. Jede Kalkulation fängt von vorn an.' },
      { titel: 'Produktion und Montage', text: 'Plotter, Werkstatt, Montage beim Kunden. Wer macht was an welchem Tag?' },
      { titel: 'Termindruck vom Kunden', text: 'Die Eröffnung steht fest. Wenn die Werbung nicht hängt, ist der Ärger groß.' },
      { titel: 'Rechnung Wochen später', text: 'Das Schild hängt, die Rechnung bleibt liegen.' },
      { titel: 'Die E-Rechnung kommt', text: 'Seit 2025 müssen Betriebe E-Rechnungen empfangen können. Ab 2027 beziehungsweise 2028 müssen sie diese an Geschäftskunden auch selbst ausstellen.' },
    ],
    ablaufTitel: 'Ein Restaurant möchte eine neue Außenwerbung und Fensterbeschriftung.',
    ablauf: [
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Material, Produktion und Montage aus Ihrem Leistungskatalog.' },
      { titel: 'Der Entwurf wird im Kundenportal freigegeben', text: 'Der Kunde gibt mit Namen und Zeitpunkt frei. Klar ist, welche Version gilt.' },
      { titel: 'Das Projekt führt durch alle Schritte', text: 'Produktion und Montage auf der Plantafel, Fotos vom Montageort.' },
      { titel: 'Die Montage wird dokumentiert', text: 'Fotos vorher und nachher, der Kunde unterschreibt auf dem Bildschirm.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung per Mail. Und Sie sehen, ob die geplanten Stunden gereicht haben.' },
    ],
    schwerpunkt: {
      titel: 'Eine Version, eine Freigabe.',
      text: 'Entwurf, Freigabe, Produktion und Montage hängen am Projekt. Kein Streit mehr darüber, was bestellt war.',
      punkte: [
        { titel: 'Freigabe im Kundenportal', text: 'Der Kunde gibt mit Namen und Zeitpunkt frei, nachvollziehbar für beide Seiten.' },
        { titel: 'Kalkulation mit Material und Zeit', text: 'Material mit Verschnitt, Zeit je Arbeitsschritt und Maschinenstrom.' },
        { titel: 'Plantafel', text: 'Produktion und Montage per Ziehen und Ablegen.' },
        { titel: 'Plan und Ist', text: 'Die gestempelten Stunden gegen die Kalkulation, mit der echten Marge.' },
      ],
    },
    geprueftAm: '2026-10-06',
  },
};

// ---------------------------------------------------------------------------

export type DossierBranche = { slug: string; name: string; kategorie: string };

export type Modul = { key: string; name: string };
export type Dossier = {
  version: string;
  slug: string;
  name: string;
  kategorie: string;
  zielgruppe: string;
  text: FachText | null;
  entwurf: boolean;
  luecken: string[];
  kern: { titel: string; module: Modul[] }[];
  paket: Modul[];
  vorbereitung: Vorbereitung[];
  qrUrl: string;
  stand: string;
};

let _labels: Record<string, string> | null = null;
function labels(): Record<string, string> {
  if (_labels) return _labels;
  const m: Record<string, string> = {};
  for (const l of NAV_LINKS as { modul?: string; label: string }[]) {
    if (l.modul && !m[l.modul]) m[l.modul] = l.label;
  }
  _labels = m;
  return m;
}

/** Emoji und Zierzeichen vor dem Menü-Namen entfernen. */
export function ohneEmoji(s: string): string {
  return String(s ?? '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim();
}

export function modulName(key: string): string {
  return NAMEN[key] ?? (ohneEmoji(labels()[key] ?? '') || key);
}

/** Monat und Jahr, z. B. „Oktober 2026". */
export function standText(d: Date): string {
  const m = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${m[d.getMonth()]} ${d.getFullYear()}`;
}

/** Zielgruppe aus dem Branchennamen: „Elektriker & Elektrobetriebe" → „Elektriker & Elektrobetriebe". */
export function zielgruppeAus(name: string): string {
  return String(name ?? '').trim() || 'Ihren Betrieb';
}

export function baueDossier(b: DossierBranche, jetzt: Date = new Date()): Dossier {
  const text = FACH_TEXTE[b.slug] ?? null;
  const kernSet = new Set(KERN_MODULE.filter((k) => !IN_AUFBAU_MODULE.has(k)));
  const kern = KERN_GRUPPEN.map((g) => ({
    titel: g.titel,
    module: g.module.filter((k) => kernSet.has(k)).map((key) => ({ key, name: modulName(key) })),
  })).filter((g) => g.module.length > 0);
  const inGruppen = new Set(KERN_GRUPPEN.flatMap((g) => g.module));
  const rest = [...kernSet].filter((k) => !inGruppen.has(k));
  if (rest.length) kern.push({ titel: 'Weitere', module: rest.map((key) => ({ key, name: modulName(key) })) });
  kern.find((g) => g.titel === 'Sicherheit und Recht')?.module.push({ key: STANDARD_AUTOMATION, name: modulName(STANDARD_AUTOMATION) });

  const paketKeys = [...new Set(KATEGORIE_MODULE[b.kategorie] ?? [])].filter((k) => !KERN_MODULE.includes(k) && !IN_AUFBAU_MODULE.has(k));
  const paket = paketKeys.map((key) => ({ key, name: modulName(key) }));

  const alle = new Set<string>([...KERN_MODULE, ...paketKeys]);
  const vorbereitung = IN_VORBEREITUNG.filter((v) => !v.wenn || v.wenn.some((k) => alle.has(k)));

  const luecken: string[] = [];
  if (!text) luecken.push('Branchentexte (Alltag, Ablauf eines Auftrags, Schwerpunkt) fehlen — B11b');
  if (!KATEGORIE_MODULE[b.kategorie]) luecken.push(`Kategorie „${b.kategorie}" hat kein Branchenpaket`);

  return {
    version: FACHDOSSIER_VERSION,
    slug: b.slug, name: b.name, kategorie: b.kategorie,
    zielgruppe: text?.zielgruppe ?? zielgruppeAus(b.name),
    text, entwurf: luecken.length > 0, luecken,
    kern, paket, vorbereitung,
    qrUrl: `${BASIS_URL}/branchen/${encodeURIComponent(b.slug)}`,
    stand: standText(jetzt),
  };
}

/** Übersicht für das Command Center: wie viele Dossiers sind vollständig? */
export function dossierStand(branchen: DossierBranche[]): { gesamt: number; fertig: number; entwurf: number; jeKategorie: Record<string, { gesamt: number; fertig: number }> } {
  const jeKategorie: Record<string, { gesamt: number; fertig: number }> = {};
  let fertig = 0;
  for (const b of branchen) {
    const k = (jeKategorie[b.kategorie] ??= { gesamt: 0, fertig: 0 });
    k.gesamt++;
    if (FACH_TEXTE[b.slug] && KATEGORIE_MODULE[b.kategorie]) { k.fertig++; fertig++; }
  }
  return { gesamt: branchen.length, fertig, entwurf: branchen.length - fertig, jeKategorie };
}

/** Verbotene Wörter in Dossier-Texten (Vertriebsregeln). */
export const VERBOTEN = [/inklusive/i, /kostet extra/i, /10\.000/, /KI-Agent/i, /KI-Crew/i, /\bdu\b/i, /\bdein/i, /\bdir\b/i, /\bdich\b/i];
export function textVerstoesse(t: string): string[] {
  return VERBOTEN.filter((r) => r.test(t)).map((r) => r.source);
}
