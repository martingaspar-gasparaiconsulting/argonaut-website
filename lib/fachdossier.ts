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
