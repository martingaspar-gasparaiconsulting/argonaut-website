// ============================================================================
// ARGONAUT OS · lib/standardDossier.ts — Paket 351 (A3, Ampel-Beschluss 12.10.2026)
//
// Standard-Dossier für die zehn Branchen ohne Fachmodule (⚫ → Standard):
// Hochschulen, Stadtwerke, Netzbetrieb, Flugzeugwartung, Bergbau, Halbleiter,
// Luft- und Raumfahrt, Verwaltungen, Standesämter, Verkehrsbetriebe.
//
// Martin 12.10.: „Nicht ausgeschlossen." Diese Betriebe nutzen die
// Grundausstattung und bekommen ein Dossier OHNE Fachversprechen:
//  · kein Fachpaket im Dossier (ihr Kategorie-Paket passt nicht — z. B. stünde
//    bei der Flugzeugwartung sonst das KFZ-Fachpaket, bei der Verwaltung
//    „Spenden" und „Verein & Sozial"),
//  · jede Aussage nur über Module der Grundausstattung,
//  · eine ehrliche Seite „Dafür passt es — dafür ist es nicht gedacht", die die
//    Fachverfahren der Branche ausdrücklich ausschließt.
// Fachmodule erst, wenn ein echter Betrieb danach fragt.
//
// Rein, ohne Imports — node-testbar. Eingebunden in lib/fachdossier.ts.
// ============================================================================

export type StandardEintrag = {
  zielgruppe: string;
  titel: string;
  lead: string;
  rolle: string;
  ablaufTitel: string;
  ablauf: { titel: string; text: string }[];
  passt: string[];
  nicht: string[];
  /** Öffentliche Stellen schreiben keine Angebote — andere Kacheln „Was Ihr Gegenüber merkt". */
  oeffentlich?: boolean;
};

export const STANDARD_GEPRUEFT_AM = '2026-10-13';

/** Alltag, der für alle zehn gilt — nur Dinge, die die Grundausstattung löst. */
export const STANDARD_ALLTAG: { titel: string; text: string }[] = [
  { titel: 'Anfragen an vielen Stellen', text: 'Mail, Telefon, Formular, Zettel am Empfang. Was nicht sofort jemand übernimmt, bleibt liegen, und niemand merkt es.' },
  { titel: 'Wer kümmert sich?', text: 'Zuständigkeiten stehen im Kopf einzelner. Ist jemand krank oder im Urlaub, beginnt das Suchen nach dem Stand.' },
  { titel: 'Dreimal abgetippt', text: 'Dieselben Namen, Adressen und Positionen landen in Liste, Kalender und Abrechnung. Jedes Mal ist ein Fehler möglich, jedes Mal kostet es Zeit.' },
  { titel: 'Zehn Programme', text: 'Kalender, Tabellen, Zeiterfassung, Ablage, Mail. Jedes mit eigenem Login und eigener Liste derselben Menschen.' },
  { titel: 'Fristen laufen still ab', text: 'Wartungen, Unterweisungen und Nachweise haben Fristen. Ohne Ampel fällt es erst auf, wenn es zu spät ist.' },
  { titel: 'Der Überblick fehlt', text: 'Wie viele Vorgänge sind offen, wo hakt es, wer ist ausgelastet? Die Antwort steckt in mehreren Tabellen.' },
];

/** Vorteile auf der Titelseite — alles Grundausstattung. */
export const STANDARD_VORTEILE: string[] = [
  'Anfragen mit Ampel statt Zettel',
  'Termine, Einsätze und Online-Buchung',
  'Projekte mit Aufgaben und Dokumenten',
  'Personalakte, Schichtplan, Arbeitszeit',
  'Unterweisungen und Fristen mit Ampel',
  'Objekte mit Fälligkeits-Ampel',
];

export const STANDARD_GEGENUEBER: { titel: string; text: string }[] = [
  { titel: 'Termin rund um die Uhr', text: 'Termine bucht man online selbst, auch abends. Sie sehen sie sofort im Kalender.' },
  { titel: 'Eine Stelle für das Anliegen', text: 'Jedes Anliegen ist ein Ticket mit Stand und Dringlichkeit. Nichts geht zwischen Abteilungen verloren.' },
  { titel: 'Antwort mit Verlauf', text: 'Der Schriftverkehr liegt am Kontakt, nicht im Postfach einer Person. Wer vertritt, sieht, was zuletzt besprochen wurde.' },
];

export const STANDARD_BAND = {
  titel: 'Kein Fachpaket – mit Absicht.',
  text: 'Für Ihre Branche gibt es heute kein eigenes Fachpaket. Sie arbeiten mit der Grundausstattung, die jeder Betrieb bekommt. Fachfunktionen bauen wir erst, wenn ein Betrieb sie wirklich braucht, und dann gemeinsam mit ihm.',
};

export const STANDARD_DOSSIER: Readonly<Record<string, StandardEintrag>> = Object.freeze({
  universitaeten: {
    zielgruppe: 'Hochschulen',
    titel: 'Ihre Hochschule. Ein System für das Drumherum.',
    lead: 'Für Weiterbildung, Kooperationen und Projekte: Anfrage, Angebot, Projekt, Rechnung und Zahlung laufen in einer Software zusammen.',
    rolle: 'Sie lehren und forschen. Die Verwaltung soll mitlaufen.',
    ablaufTitel: 'Ein Unternehmen fragt eine Weiterbildung für zwölf Mitarbeiter an.',
    ablauf: [
      { titel: 'Die Anfrage kommt über das Formular', text: 'Sie landet in der Anfrageliste. Eine Ampel zeigt, wie lange sie schon wartet.' },
      { titel: 'Das Angebot nimmt das Unternehmen per Link an', text: 'Positionen kommen aus Ihrem Leistungskatalog. Sie sehen die Annahme sofort.' },
      { titel: 'Das Projekt bündelt die Arbeit', text: 'Aufgaben, Termine, Dokumente und Stunden der Beteiligten an einer Stelle.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung nach XRechnung oder ZUGFeRD. Die Zahlung wird beim Einlesen des Kontoauszugs zugeordnet.' },
      { titel: 'Offene Posten bleiben im Blick', text: 'Bleibt eine Zahlung aus, erinnert das Mahnwesen in Stufen.' },
    ],
    passt: [
      'Weiterbildungs- und Seminarangebote für Unternehmen anbieten und abrechnen',
      'Kooperationspartner und Förderer als Kontakte mit Verlauf',
      'Projekte mit Aufgaben, Terminen, Dokumenten und Stunden',
      'Personalakte, Arbeitszeit und Nachweise für Projektmitarbeiter',
    ],
    nicht: [
      'Studierenden-, Bewerbungs- und Prüfungsverwaltung (Campus-Management)',
      'Haushalts- und Kassenwesen nach Landeshaushaltsrecht',
      'Bibliotheks- und Raumplanungssysteme der Hochschule',
    ],
  },
  'energieversorger-stadtwerke': {
    zielgruppe: 'Stadtwerke und Energieversorger',
    titel: 'Ihre Stadtwerke. Ein System für Service und Einsatz.',
    lead: 'Von der Anfrage für den Hausanschluss bis zur Wartung der Anlage: Angebot, Einsatz, Rechnung und Anlagen-Register laufen in einer Software zusammen.',
    rolle: 'Sie versorgen eine Stadt. Nicht ein Büro voller Programme.',
    ablaufTitel: 'Ein Hauseigentümer fragt einen neuen Hausanschluss an.',
    ablauf: [
      { titel: 'Die Anfrage kommt über Ihre Webseite', text: 'Sie landet in der Anfrageliste mit Adresse und Wunschtermin. Eine Ampel zeigt, wie lange sie wartet.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Positionen kommen aus Ihrem Leistungskatalog. Sie sehen die Annahme sofort.' },
      { titel: 'Der Einsatz landet auf dem Handy des Monteurs', text: 'Mit Adresse und Route. Vor Ort macht er Fotos und lässt den Kunden unterschreiben.' },
      { titel: 'Die Rechnung entsteht aus dem Einsatz', text: 'Als E-Rechnung per Mail. Die Zahlung wird beim Einlesen des Kontoauszugs zugeordnet.' },
      { titel: 'Die Anlage steht im Objekt-Register', text: 'Mit Kontrollintervall und Fälligkeits-Ampel für die nächste Wartung.' },
    ],
    passt: [
      'Hausanschluss- und Serviceanfragen mit Angebot und Rechnung',
      'Einsätze der Monteure mit Fotos und Unterschrift',
      'Anlagen im Objekt-Register mit Kontrollintervall und Fälligkeits-Ampel',
      'Kundenanliegen als Service-Tickets mit Stand und Dringlichkeit',
    ],
    nicht: [
      'Energie- und Verbrauchsabrechnung mit Zählerständen, Tarifen und Abschlägen',
      'Marktkommunikation mit Netzbetreibern und Lieferanten',
      'Leitstellen- und Netzführungssysteme',
    ],
  },
  'stromnetze-netzbetrieb': {
    zielgruppe: 'Netzbetreiber',
    titel: 'Ihr Netzbetrieb. Ein System für Wartung und Einsatz.',
    lead: 'Stationen und Anlagen mit Fälligkeits-Ampel, Einsätze mit Fotos, Unterweisungen des Teams mit Fristen: in einer Software statt in vielen Tabellen.',
    rolle: 'Sie halten ein Netz am Laufen. Die Ablage soll mitlaufen.',
    ablaufTitel: 'Eine Ortsnetzstation ist zur regelmäßigen Wartung fällig.',
    ablauf: [
      { titel: 'Die Ampel zeigt die Fälligkeit', text: 'Die Station steht im Objekt-Register mit Kontrollintervall. Die Fälligkeits-Ampel zeigt, wann die Wartung ansteht.' },
      { titel: 'Der Einsatz wird geplant', text: 'Mit Termin, Adresse und Team. Schulungen und Unterweisungen stehen in der Personalakte.' },
      { titel: 'Vor Ort wird dokumentiert', text: 'Fotos, Arbeitsbericht und Unterschrift direkt im Einsatz auf dem Handy.' },
      { titel: 'Die Arbeitszeit ist erfasst', text: 'Die Stempeluhr hält die Zeiten fest, der Arbeitszeit-Nachweis entsteht daraus.' },
      { titel: 'Die Auswertung zeigt den Stand', text: 'Welche Anlagen fällig sind und welche Einsätze offen sind.' },
    ],
    passt: [
      'Stationen und Anlagen im Objekt-Register mit Fälligkeits-Ampel',
      'Einsatzplanung mit Fotos, Arbeitsbericht und Unterschrift vor Ort',
      'Schulungen und Unterweisungen in der Personalakte',
      'Anfragen von Anschlussnehmern mit Angebot und Rechnung',
    ],
    nicht: [
      'Netzleittechnik und Störungsmanagement im laufenden Netzbetrieb',
      'Netzentgelt- und Messstellenabrechnung',
      'Geoinformationssysteme für Leitungen',
    ],
  },
  'flugzeugwartung-luftfahrttechnik': {
    zielgruppe: 'Betriebe der Flugzeugwartung',
    titel: 'Ihr Wartungsbetrieb. Ein System für Kunden und Büro.',
    lead: 'Anfrage, Angebot, Auftrag, Stunden, Ersatzteile und Rechnung laufen in einer Software zusammen. Die luftrechtliche Dokumentation bleibt in Ihrem zugelassenen System.',
    rolle: 'Sie halten Flugzeuge in der Luft. Das Büro soll mitlaufen.',
    ablaufTitel: 'Ein Halter fragt die Jahreswartung seiner Maschine an.',
    ablauf: [
      { titel: 'Die Anfrage kommt über Ihre Webseite', text: 'Sie landet in der Anfrageliste. Eine Ampel zeigt, wie lange sie wartet.' },
      { titel: 'Das Angebot nimmt der Halter per Link an', text: 'Positionen kommen aus Ihrem Leistungskatalog. Sie sehen die Annahme sofort.' },
      { titel: 'Der Auftrag sammelt Stunden und Teile', text: 'Die Stempeluhr erfasst die Zeiten der Mechaniker, Ersatzteile kommen aus Artikel und Lager.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung per Mail. Die Zahlung wird beim Einlesen des Kontoauszugs zugeordnet.' },
      { titel: 'Offene Posten bleiben im Blick', text: 'Bleibt eine Zahlung aus, erinnert das Mahnwesen in Stufen.' },
    ],
    passt: [
      'Kunden, Angebote, Aufträge und Rechnungen',
      'Stunden je Auftrag über die Stempeluhr',
      'Ersatzteile und Verbrauchsmaterial in Artikel und Lager',
      'Schulungen der Mitarbeiter in der Personalakte',
    ],
    nicht: [
      'Instandhaltungsnachweise und Freigabebescheinigungen nach EASA-Vorgaben',
      'Lufttüchtigkeits- und Lebenslaufakten der Luftfahrzeuge',
      'Nachverfolgung zertifizierter Luftfahrtteile',
    ],
  },
  bergbau: {
    zielgruppe: 'Bergbau- und Rohstoffbetriebe',
    titel: 'Ihr Rohstoffbetrieb. Ein System für Vertrieb und Verwaltung.',
    lead: 'Von der Anfrage des Bauunternehmens bis zur bezahlten Rechnung, dazu Schichtplan, Arbeitszeit und Gerätekontrollen: in einer Software zusammen.',
    rolle: 'Sie gewinnen Rohstoffe. Nicht Formulare.',
    ablaufTitel: 'Ein Bauunternehmen fragt regelmäßige Lieferungen an.',
    ablauf: [
      { titel: 'Die Anfrage kommt per Formular oder Mail', text: 'Sie landet in der Anfrageliste. Eine Ampel zeigt, wie lange sie wartet.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Preise kommen aus Ihren Artikeln. Für Daueraufträge hinterlegen Sie einen Vertrag mit Laufzeit.' },
      { titel: 'Der Auftrag führt durch die Lieferungen', text: 'Positionen, Termine und Dokumente am Auftrag.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung per Mail. Offene Posten erinnert das Mahnwesen.' },
      { titel: 'Geräte bleiben im Blick', text: 'Maschinen im Objekt-Register mit Kontrollintervall und Fälligkeits-Ampel.' },
    ],
    passt: [
      'Kunden, Verträge, Angebote und Rechnungen für Lieferungen',
      'Geräte und Maschinen im Objekt-Register mit Fälligkeits-Ampel',
      'Schichtplan, Arbeitszeit und Schulungen in der Personalakte',
      'Einkauf und Lager für Verbrauchsmaterial',
    ],
    nicht: [
      'Bergrechtliche Betriebspläne und Markscheidewesen',
      'Waagen- und Verladesteuerung',
      'Sprengstoffrechtliche Bücher und Nachweise',
    ],
  },
  'halbleiter-mikroelektronik': {
    zielgruppe: 'Betriebe der Halbleiter- und Mikroelektronik',
    titel: 'Ihr Betrieb. Ein System für Vertrieb und Verwaltung.',
    lead: 'Anfrage, Angebot, Auftrag, Projekt, Einkauf und Rechnung laufen in einer Software zusammen. Die Fertigung im Reinraum steuert weiter Ihr Fertigungssystem.',
    rolle: 'Sie fertigen auf Nanometer genau. Das Büro soll mitlaufen.',
    ablaufTitel: 'Ein Kunde fragt eine Kleinserie an.',
    ablauf: [
      { titel: 'Die Anfrage kommt über Ihre Webseite', text: 'Sie landet in der Anfrageliste. Eine Ampel zeigt, wie lange sie wartet.' },
      { titel: 'Das Angebot nimmt der Kunde per Link an', text: 'Positionen kommen aus Ihren Artikeln und Leistungen. Sie sehen die Annahme sofort.' },
      { titel: 'Das Projekt bündelt die Arbeit', text: 'Aufgaben, Termine, Dokumente und Stunden der Beteiligten an einer Stelle.' },
      { titel: 'Material kommt über den Einkauf', text: 'Bestellungen und Wareneingang in Artikel und Lager.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung nach XRechnung oder ZUGFeRD. Die Zahlung wird beim Einlesen des Kontoauszugs zugeordnet.' },
    ],
    passt: [
      'Vertrieb mit Anfragen, Verkaufschancen, Angeboten und Aufträgen',
      'Projekte für Entwicklungs- und Musteraufträge',
      'Einkauf und Lager für Material',
      'Personalakte, Schichtplan und Schulungen',
    ],
    nicht: [
      'Fertigungssteuerung im Reinraum und Anlagenrezepte',
      'Auswertung von Prozess- und Ausbeutedaten',
      'Exportkontroll-Prüfungen',
    ],
  },
  'luft-raumfahrt': {
    zielgruppe: 'Zulieferer der Luft- und Raumfahrt',
    titel: 'Ihr Betrieb. Ein System für Vertrieb und Verwaltung.',
    lead: 'Anfrage, Angebot, Auftrag, Projekt, Einkauf und Rechnung laufen in einer Software zusammen. Qualitätsnachweise der Branche bleiben in Ihrem zugelassenen System.',
    rolle: 'Sie bauen für den Himmel. Das Büro soll mitlaufen.',
    ablaufTitel: 'Ein Auftraggeber fragt eine Baugruppe nach Zeichnung an.',
    ablauf: [
      { titel: 'Die Anfrage kommt mit Zeichnung', text: 'Sie landet in der Anfrageliste, die Zeichnung hängt als Dokument daran.' },
      { titel: 'Das Angebot nimmt der Auftraggeber per Link an', text: 'Positionen kommen aus Ihren Artikeln und Leistungen. Sie sehen die Annahme sofort.' },
      { titel: 'Das Projekt bündelt die Arbeit', text: 'Aufgaben, Termine, Dokumente und Stunden der Beteiligten an einer Stelle.' },
      { titel: 'Material kommt über den Einkauf', text: 'Bestellungen und Wareneingang in Artikel und Lager.' },
      { titel: 'Die Rechnung entsteht aus dem Auftrag', text: 'Als E-Rechnung nach XRechnung oder ZUGFeRD. Offene Posten erinnert das Mahnwesen.' },
    ],
    passt: [
      'Vertrieb mit Anfragen, Angeboten und Aufträgen',
      'Projekte mit Aufgaben, Dokumenten und Stunden',
      'Einkauf und Lager für Material',
      'Schulungen der Mitarbeiter in der Personalakte',
    ],
    nicht: [
      'Qualitätsnachweise nach EN 9100, zum Beispiel Erstmusterprüfberichte',
      'Exportkontroll- und Genehmigungsprüfungen',
      'Konfigurations- und Lebenslaufakten von Bauteilen',
    ],
  },
  stadtverwaltungen: {
    zielgruppe: 'Verwaltungen und Behörden',
    titel: 'Ihre Verwaltung. Ein System für das Drumherum.',
    lead: 'Online-Termine, Anliegen als Tickets, Projekte und Personal: in einer Software statt in vielen Tabellen. Ihre Fachverfahren bleiben, wo sie sind.',
    rolle: 'Sie arbeiten für Bürger. Nicht für Ablagen.',
    ablaufTitel: 'Eine Bürgerin möchte eine Beratung im Bauamt.',
    ablauf: [
      { titel: 'Den Termin bucht sie online', text: 'Über Ihren Buchungs-Link, zu Ihren Öffnungszeiten und Terminarten. Der Termin steht sofort im Kalender.' },
      { titel: 'Am Vortag kommt die Erinnerung', text: 'Eine Mail erinnert an den Termin, damit niemand umsonst kommt.' },
      { titel: 'Das Anliegen bekommt ein Ticket', text: 'Mit Stand und Dringlichkeit. Jeder Schritt steht im Verlauf.' },
      { titel: 'Die Vertretung findet alles', text: 'Der Schriftverkehr liegt am Kontakt, nicht im Postfach einer Person.' },
      { titel: 'Die Übersicht zeigt den Stand', text: 'Wie viele Anliegen offen sind und wie dringend.' },
    ],
    passt: [
      'Online-Terminvergabe mit Erinnerung am Vortag',
      'Anliegen und Rückfragen als Tickets mit Stand und Dringlichkeit',
      'Projekte wie Veranstaltungen oder Baumaßnahmen mit Aufgaben',
      'Personalakte, Schichtplan, Arbeitszeit und Team-Chat',
    ],
    nicht: [
      'Fachverfahren wie Melde-, Pass- und Ausweiswesen',
      'Haushalts- und Kassenwesen nach Gemeindehaushaltsrecht, Gebührenbescheide',
      'Anbindung an Bürgerkonten und Online-Dienste nach dem Onlinezugangsgesetz',
    ],
    oeffentlich: true,
  },
  'standesaemter-buergerbueros': {
    zielgruppe: 'Standesämter und Bürgerbüros',
    titel: 'Ihr Bürgerbüro. Ein System für Termine und Anliegen.',
    lead: 'Online-Termine mit Erinnerung, Anliegen als Tickets, Schichtplan und Arbeitszeit: in einer Software. Beurkundung und Register bleiben im zugelassenen Fachverfahren.',
    rolle: 'Sie sind für Menschen da. Der Kalender soll mitlaufen.',
    ablaufTitel: 'Ein Paar möchte einen Termin für die Anmeldung zur Eheschließung.',
    ablauf: [
      { titel: 'Den Termin bucht das Paar online', text: 'Über Ihren Buchungs-Link, zu Ihren Öffnungszeiten und Terminarten. Der Termin steht sofort im Kalender.' },
      { titel: 'Am Vortag kommt die Erinnerung', text: 'Eine Mail erinnert an den Termin, damit niemand umsonst wartet.' },
      { titel: 'Rückfragen landen an einer Stelle', text: 'Als Ticket mit Stand und Verlauf. Die Vertretung sieht, was offen ist.' },
      { titel: 'Die Besetzung passt zur Nachfrage', text: 'Der Schichtplan zeigt, wer an welchem Tag am Schalter ist.' },
      { titel: 'Die Zeiten stimmen', text: 'Die Stempeluhr hält die Arbeitszeit fest, der Nachweis entsteht daraus.' },
    ],
    passt: [
      'Online-Terminvergabe mit Erinnerung am Vortag',
      'Anliegen und Rückfragen als Tickets mit Stand und Verlauf',
      'Schichtplan und Arbeitszeit für den Schalterdienst',
      'Team-Chat für kurze Absprachen',
    ],
    nicht: [
      'Personenstandsregister und Beurkundung (zugelassene Fachverfahren)',
      'Melde-, Pass- und Ausweiswesen',
      'Gebührenbescheide und Kassenwesen',
    ],
    oeffentlich: true,
  },
  'verkehrsbetriebe-kommunale-betriebe': {
    zielgruppe: 'Verkehrsbetriebe und kommunale Betriebe',
    titel: 'Ihr kommunaler Betrieb. Ein System für Meldungen und Einsätze.',
    lead: 'Meldungen, Einsätze mit Fotos, Anlagen mit Fälligkeits-Ampel, Schichtplan und Arbeitszeit: in einer Software statt in vielen Tabellen.',
    rolle: 'Sie halten eine Stadt in Bewegung. Die Ablage soll mitlaufen.',
    ablaufTitel: 'Eine Haltestellenbeleuchtung ist defekt.',
    ablauf: [
      { titel: 'Die Meldung wird ein Ticket', text: 'Mit Stand und Dringlichkeit. Niemand muss nachfragen, ob sie angekommen ist.' },
      { titel: 'Der Einsatz landet auf dem Handy', text: 'Mit Adresse und Route. Vor Ort macht das Team Fotos und schreibt den Arbeitsbericht.' },
      { titel: 'Die Anlage steht im Register', text: 'Die Haltestelle steht im Objekt-Register mit Zustand und Kontrollintervall.' },
      { titel: 'Die nächste Kontrolle ist sichtbar', text: 'Die Fälligkeits-Ampel zeigt, wann sie ansteht.' },
      { titel: 'Die Übersicht zeigt, wo es hakt', text: 'Wie viele Meldungen offen sind und wie dringend.' },
    ],
    passt: [
      'Meldungen als Service-Tickets mit Stand und Dringlichkeit',
      'Einsätze von Werkstatt und Betriebshof mit Fotos und Arbeitsbericht',
      'Anlagen und Objekte mit Zustand und Fälligkeits-Ampel',
      'Schichtplan, Arbeitszeit und Schulungen in der Personalakte',
    ],
    nicht: [
      'Fahrplan- und Umlaufplanung',
      'Fahrscheinverkauf und Ticketing',
      'Betriebsleitsystem und Fahrgastinformation',
    ],
    oeffentlich: true,
  },
});

export function istStandardBranche(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(STANDARD_DOSSIER, String(slug ?? ''));
}
