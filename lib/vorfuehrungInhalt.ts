// ============================================================================
// ARGONAUT OS · lib/vorfuehrungInhalt.ts — die Inhalte der öffentlichen Vorführung
//
// Je Vorführ-Betrieb der branchenspezifische Text: der Schmerzpunkt, die Frage
// die ein Chef dieser Branche wirklich stellt, was die KI darauf antwortet, und
// drei Höhepunkte, die es in dieser Branche gibt und in anderen nicht.
//
// GRUNDREGEL: Jede Branche wird einzeln betrachtet. Kein Baukasten mit
// ausgetauschtem Firmennamen — ein Speditionschef muss beim Lesen merken, dass
// hier jemand seinen Betrieb verstanden hat, und ein Tierarzt genauso.
//
// Die Betriebsgrößen (Mitarbeiter, Standorte, Sitz-Mix) sind realistische
// Durchschnitte ihrer Branche. Aus ihnen rechnet lib/vorfuehrung.ts mit
// lib/tarif.ts den echten Preis aus — es steht also nie eine geschätzte Zahl
// auf dem Bildschirm, sondern immer die, die auch der Rechner ausgibt.
//
// Keine Imports, keine Hooks — node-testbar, Client + Server.
// ============================================================================

export type VorfuehrInhalt = {
  /** Typische Betriebsgröße dieser Branche. */
  mitarbeiter: number;
  standorte: number;
  sitze: { voll: number; standard: number; self: number };
  /** Der Satz, bei dem ein Chef dieser Branche nickt. */
  schmerz: string;
  /** Was ein Chef dieser Branche die KI wirklich fragen würde. */
  kiFrage: string;
  /** Die Antwort — konkret, mit Zahlen, mit einem Vorschlag am Ende. */
  kiAntwort: string[];
  /** Drei Dinge, die es in dieser Branche gibt und in anderen nicht. */
  hoehepunkte: string[];
};

export const VORFUEHR_INHALT: Record<string, VorfuehrInhalt> = {
  maler: {
    mitarbeiter: 28, standorte: 1, sitze: { voll: 4, standard: 12, self: 12 },
    schmerz: 'Aufmaß auf dem Zettel, Angebot abends am Küchentisch, und der Nachtrag fällt erst beim Jahresabschluss auf.',
    kiFrage: 'Welche Baustellen laufen aus dem Ruder?',
    kiAntwort: [
      'Objekt „Wohnpark Süd": 62 % der kalkulierten Stunden verbraucht, gemeldet sind erst 40 % Leistung.',
      'Zwei Nachträge liegen seit 11 Tagen unabgerechnet — zusammen 4.180 € netto.',
      'Vorschlag: Nachträge heute stellen, Wohnpark Süd nachkalkulieren, bevor die nächste Abschlagsrechnung rausgeht.',
    ],
    hoehepunkte: [
      'Aufmaß direkt auf der Baustelle erfassen — daraus wird per Klick das Angebot',
      'Leistungskatalog mit deinen Preisen: Angebot in Minuten statt an einem Abend',
      'Objektzeiten je Baustelle — du siehst sofort, wo Stunden verbrennen',
    ],
  },
  heizung: {
    mitarbeiter: 34, standorte: 1, sitze: { voll: 5, standard: 17, self: 12 },
    schmerz: 'Wartungstermine im Kalender des Chefs, Ersatzteile im Kopf des Monteurs, Notdienst im WhatsApp-Chat.',
    kiFrage: 'Welche Wartungen sind fällig und wer kann sie machen?',
    kiAntwort: [
      '17 Wartungsverträge werden in den nächsten 30 Tagen fällig, 4 davon sind bereits überzogen.',
      'Aus den überzogenen ergeben sich 6.300 € abrechenbarer Umsatz, der gerade liegen bleibt.',
      'Vorschlag: Die vier überzogenen auf nächste Woche legen — zwei liegen in derselben Straße.',
    ],
    hoehepunkte: [
      'Wartungsverträge mit automatischer Erinnerung und fertiger Rechnung',
      'Prüfprotokolle rechtssicher dokumentiert statt im Aktenordner',
      'Material direkt vom Auftrag abbuchen — das Lager stimmt ohne Nachzählen',
    ],
  },
  metall: {
    mitarbeiter: 120, standorte: 2, sitze: { voll: 12, standard: 48, self: 60 },
    schmerz: 'Maschinenlaufzeiten im Kopf, Chargen im Ordner — und wenn ein Kunde reklamiert, wird die Rückverfolgung zur Handarbeit.',
    kiFrage: 'Wie lief die Fertigung letzte Woche?',
    kiAntwort: [
      'Gesamtanlageneffektivität über alle Maschinen: 71 % — in der Vorwoche 68 %.',
      'Maschine M-2000 hatte 14 Stunden ungeplanten Stillstand, das ist der größte Einzelposten.',
      'Charge L-2026-118 ist vollständig rückverfolgbar — Vormaterial, Schicht, Prüfprotokoll.',
    ],
    hoehepunkte: [
      'Betriebsdatenerfassung mit Anlageneffektivität je Maschine',
      'Chargen und Lose lückenlos rückverfolgbar — auf Knopfdruck',
      'Zuschnittoptimierung und Materialwirtschaft im selben System',
    ],
  },
  baustoff: {
    mitarbeiter: 62, standorte: 3, sitze: { voll: 8, standard: 26, self: 28 },
    schmerz: 'Drei Lager, drei Bestandslisten — und keine davon stimmt am Monatsende.',
    kiFrage: 'Was liegt zu lange im Lager und was fehlt gleich?',
    kiAntwort: [
      '84 Artikel bewegen sich seit über 180 Tagen nicht — gebundenes Kapital rund 61.000 €.',
      'Bei 11 Artikeln reicht der Bestand keine zwei Wochen mehr, davon 3 mit langer Lieferzeit.',
      'Vorschlag: Bestellvorschlag für die 11 kritischen erzeugen, Ladenhüter in eine Abverkaufsaktion.',
    ],
    hoehepunkte: [
      'Varianten-Matrix: Größe, Farbe, Stärke ohne Artikel-Wildwuchs',
      'Bestand über alle Standorte in einer Ansicht',
      'Kasse und Onlineshop hängen am selben Bestand',
    ],
  },
  autohaus: {
    mitarbeiter: 45, standorte: 1, sitze: { voll: 7, standard: 20, self: 18 },
    schmerz: 'Fahrzeughistorie im Ordner, Werkstattauslastung im Bauchgefühl, HU-Termine gehen verloren.',
    kiFrage: 'Wie ist die Werkstatt nächste Woche ausgelastet?',
    kiAntwort: [
      'Nächste Woche 78 % belegt — Dienstag und Mittwoch sind noch je 6 Stunden frei.',
      '23 Kunden haben in den nächsten 60 Tagen HU-Termin, 14 davon noch ohne Buchung.',
      'Vorschlag: Die 14 anschreiben und gezielt auf Dienstag und Mittwoch legen.',
    ],
    hoehepunkte: [
      'Fahrzeugakte mit vollständiger Historie je Kennzeichen',
      'Werkstattauftrag vom Annahmegespräch bis zur Rechnung in einem Fluss',
      'Erinnerungen zu HU, Inspektion und Reifenwechsel laufen von selbst',
    ],
  },
  hotel: {
    mitarbeiter: 55, standorte: 1, sitze: { voll: 7, standard: 20, self: 28 },
    schmerz: 'Buchungsportale, Kasse, Dienstplan und Housekeeping — vier Systeme, die nichts voneinander wissen.',
    kiFrage: 'Wie war der letzte Monat und worauf muss ich achten?',
    kiAntwort: [
      'Auslastung 74 %, durchschnittlicher Zimmerpreis 118 € — gegenüber Vorjahresmonat plus 6 %.',
      'Der Wareneinsatz im Restaurant ist auf 32 % gestiegen, üblich sind bei dir 28 %.',
      'Vorschlag: Kalkulation der fünf meistverkauften Gerichte prüfen — dort liegt die Abweichung.',
    ],
    hoehepunkte: [
      'Belegungsplan, Reservierung und Housekeeping in einer Oberfläche',
      'Rezepturen mit Wareneinsatz je Gericht — Kalkulation statt Schätzung',
      'Schichtplanung, die die Auslastung kennt',
    ],
  },
  metzger: {
    mitarbeiter: 38, standorte: 3, sitze: { voll: 5, standard: 12, self: 21 },
    schmerz: 'Allergene handschriftlich, Filialbestellungen per Zuruf, und die Kalkulation macht der Bauch.',
    kiFrage: 'Wie kalkuliere ich meine Partyplatten richtig?',
    kiAntwort: [
      'Bei den aktuellen Einkaufspreisen liegt der Wareneinsatz der großen Platte bei 41 %.',
      'Vor sechs Monaten waren es 34 % — Rind und Butter sind seither deutlich teurer geworden.',
      'Vorschlag: Verkaufspreis um 1,80 € anheben oder die Zusammenstellung anpassen. Beides ist hinterlegt.',
    ],
    hoehepunkte: [
      'Rezepturen mit automatischer Allergen- und LMIV-Kennzeichnung',
      'Etiketten direkt aus der Rezeptur — kein Handschreiben mehr',
      'Filialbestellungen laufen digital in die Produktion',
    ],
  },
  baeckerei: {
    mitarbeiter: 45, standorte: 5, sitze: { voll: 3, standard: 7, self: 35 },
    schmerz: 'Nachts backen, morgens ausliefern, tagsüber Papierkram — und die Retouren fallen erst im Abschluss auf.',
    kiFrage: 'Welche Filiale läuft am besten und wo verliere ich Geld?',
    kiAntwort: [
      'Filiale Bahnhof macht 31 % des Umsatzes bei 18 % der Personalkosten — deine stärkste.',
      'Filiale Weststadt hat 14 % Retourenquote, im Schnitt liegst du bei 6 %.',
      'Vorschlag: Bestellmengen Weststadt nachmittags um ein Fünftel senken — das sind rund 900 € im Monat.',
    ],
    hoehepunkte: [
      'Rezepturen mit Allergenen und automatischen Etiketten',
      'Filialbestellung und Backplanung greifen ineinander',
      'Kasse, Bestand und Buchhaltung hängen an denselben Zahlen',
    ],
  },
  spedition: {
    mitarbeiter: 85, standorte: 2, sitze: { voll: 10, standard: 30, self: 45 },
    schmerz: 'Touren auf dem Whiteboard, Lenkzeiten im Kopf, Ablieferbelege im Handschuhfach.',
    kiFrage: 'Wo verliere ich auf den Touren Geld?',
    kiAntwort: [
      'Tour Nord fährt seit sechs Wochen im Schnitt 62 Kilometer Leerfahrt pro Tag.',
      'Zwei Sendungen darauf liegen unter deiner Deckungsbeitragsgrenze.',
      'Vorschlag: Tour Nord und Tour Mitte zusammenlegen — die Route ist bereits gerechnet.',
    ],
    hoehepunkte: [
      'Tourenplanung mit echten Fahrzeiten statt Luftlinie',
      'Ablieferbeleg digital mit Unterschrift auf dem Handy',
      'Fahrzeugakte mit Prüfterminen, die von selbst erinnern',
    ],
  },
  itsystem: {
    mitarbeiter: 32, standorte: 1, sitze: { voll: 8, standard: 20, self: 4 },
    schmerz: 'Verträge in Excel, Lizenzen irgendwo, und beim Kunden weiß niemand, was da eigentlich läuft.',
    kiFrage: 'Welche Verträge laufen aus und was hängt daran?',
    kiAntwort: [
      'Sieben Verträge laufen in 90 Tagen aus, gemeinsam 38.400 € Jahresumsatz.',
      'Bei zweien wurde seit 14 Monaten nicht nachverhandelt, obwohl der Leistungsumfang gewachsen ist.',
      'Vorschlag: Beide zuerst angehen — der Aufwandsnachweis dafür liegt vollständig vor.',
    ],
    hoehepunkte: [
      'Asset- und Lizenzverwaltung je Kunde',
      'Wiederkehrende Abrechnung läuft ohne Zutun',
      'Aufwand je Ticket sauber erfasst und abrechenbar',
    ],
  },
  solar: {
    mitarbeiter: 42, standorte: 1, sitze: { voll: 6, standard: 18, self: 18 },
    schmerz: 'Anlagen laufen, aber niemand sieht, welche schwächelt. Fördermittel-Nachweise kosten jedes Mal einen Tag.',
    kiFrage: 'Welche Anlagen liefern weniger als erwartet?',
    kiAntwort: [
      'Drei Anlagen liegen mehr als 12 % unter ihrer Erwartung für diesen Monat.',
      'Bei einer davon fällt der Rückgang mit dem letzten Wartungstermin zusammen.',
      'Vorschlag: Diese Anlage zuerst prüfen — die Auswertung liegt als PDF bereit.',
    ],
    hoehepunkte: [
      'Ertragsüberwachung je Anlage mit Soll-Ist-Vergleich',
      'Fördermittel und Nachweise an der Anlage hinterlegt',
      'Wartungsplanung und Prüfprotokolle in einem System',
    ],
  },
  immobilien: {
    mitarbeiter: 24, standorte: 1, sitze: { voll: 6, standard: 14, self: 4 },
    schmerz: 'Betriebskostenabrechnung im Frühjahr — drei Wochen Excel, und danach kommen die Widersprüche.',
    kiFrage: 'Wo stehe ich bei den Betriebskosten?',
    kiAntwort: [
      'Für 4 von 19 Objekten fehlen noch Belege, insgesamt 11 Positionen.',
      'Bei zwei Objekten sind die Heizkosten um über 20 % gestiegen — das gibt Rückfragen.',
      'Vorschlag: Diese beiden vorab anschreiben, bevor die Abrechnung rausgeht.',
    ],
    hoehepunkte: [
      'Betriebskostenabrechnung je Einheit auf Knopfdruck',
      'Mietverträge mit Laufzeiten und Anpassungen im Blick',
      'Exposé und Objektakte im selben System',
    ],
  },
  agentur: {
    mitarbeiter: 26, standorte: 1, sitze: { voll: 8, standard: 16, self: 2 },
    schmerz: 'Projekte laufen, Stunden werden vergessen, und am Ende weiß niemand, ob der Kunde profitabel war.',
    kiFrage: 'Welche Kunden sind profitabel und welche nicht?',
    kiAntwort: [
      'Zwei Kunden liegen unter 15 % Deckungsbeitrag, einer sogar bei minus 4 %.',
      'Beim Verlustkunden wurden 62 Stunden über dem Angebot geleistet, davon 38 unabgerechnet.',
      'Vorschlag: Nachverhandeln oder das Budget deckeln — die Stundenauswertung ist fertig.',
    ],
    hoehepunkte: [
      'Projektabrechnung mit echtem Deckungsbeitrag je Kunde',
      'Freigaben und Proofing direkt mit dem Kunden',
      'Kampagnen und Leads im selben System wie die Abrechnung',
    ],
  },
  kanzlei: {
    mitarbeiter: 22, standorte: 1, sitze: { voll: 9, standard: 12, self: 1 },
    schmerz: 'Fristen im Kalender, Mandantenunterlagen per Mail, und der Überblick hängt an einer Person.',
    kiFrage: 'Welche Fristen laufen und wo fehlen mir Unterlagen?',
    kiAntwort: [
      'Neun Fristen in den nächsten 14 Tagen, zwei davon ohne zugeordneten Bearbeiter.',
      'Bei fünf Mandaten fehlen Unterlagen, die für die Abgabe gebraucht werden.',
      'Vorschlag: Sammelanschreiben an diese fünf — Vorlage liegt bereit.',
    ],
    hoehepunkte: [
      'Fristenverwaltung mit Ampel und Vertretungsregelung',
      'Mandantenakte mit sicherem Dokumentenaustausch',
      'DATEV-Schnittstelle ohne doppeltes Erfassen',
    ],
  },
  akademie: {
    mitarbeiter: 30, standorte: 2, sitze: { voll: 6, standard: 14, self: 10 },
    schmerz: 'Kurse in einer Liste, Räume in einer anderen, Teilnehmer im Mailpostfach.',
    kiFrage: 'Welche Kurse lohnen sich und welche nicht?',
    kiAntwort: [
      'Vier Kurse liegen unter der Mindestteilnehmerzahl, zwei starten in 12 Tagen.',
      'Der Abendkurs Elektrotechnik ist seit drei Durchläufen ausgebucht — hier ist Luft nach oben.',
      'Vorschlag: Die zwei kritischen zusammenlegen, Elektrotechnik ein zweites Mal anbieten.',
    ],
    hoehepunkte: [
      'Kurs-, Raum- und Dozentenplanung greifen ineinander',
      'Online-Buchung mit automatischer Bestätigung',
      'Teilnahmebescheinigungen entstehen von selbst',
    ],
  },
  physio: {
    mitarbeiter: 18, standorte: 1, sitze: { voll: 2, standard: 13, self: 3 },
    schmerz: 'Termine am Telefon, Ausfälle ohne Vorwarnung, Rezeptfristen im Kopf.',
    kiFrage: 'Wie voll bin ich nächste Woche und wo fallen Termine aus?',
    kiAntwort: [
      'Nächste Woche 81 % belegt, Donnerstagnachmittag ist auffällig leer.',
      'Die Ausfallquote liegt bei 9 %, seit den automatischen Erinnerungen vorher 14 %.',
      'Vorschlag: Donnerstag gezielt Rezepte mit ablaufender Frist einplanen.',
    ],
    hoehepunkte: [
      'Online-Buchung, die freie Zeiten selbst anbietet',
      'Automatische Terminerinnerung senkt Ausfälle messbar',
      'Rezept- und Verordnungsfristen im Blick',
    ],
  },
  fitness: {
    mitarbeiter: 26, standorte: 1, sitze: { voll: 4, standard: 10, self: 12 },
    schmerz: 'Mitgliederverwaltung in einer Insellösung, Kündigungen fallen erst auf, wenn sie durch sind.',
    kiFrage: 'Wer ist gerade abwanderungsgefährdet?',
    kiAntwort: [
      '46 Mitglieder waren seit über 6 Wochen nicht da — davon 31 mit Kündigungsfenster in Kürze.',
      'Erfahrungsgemäß kündigt daraus etwa ein Drittel, das wären rund 11.000 € Jahresumsatz.',
      'Vorschlag: Diese 31 mit einem persönlichen Angebot anschreiben — Vorlage liegt bereit.',
    ],
    hoehepunkte: [
      'Mitglieder und Abos mit automatischem Beitragseinzug',
      'Kursbuchung online, ohne Anruf an der Theke',
      'Gutscheine und Aktionen laufen im selben System',
    ],
  },
  tierarzt: {
    mitarbeiter: 14, standorte: 1, sitze: { voll: 2, standard: 9, self: 3 },
    schmerz: 'Impftermine in der Karteikarte, Rückrufe im Kopf, Nachweise auf Papier.',
    kiFrage: 'Welche Impfungen und Kontrollen stehen an?',
    kiAntwort: [
      '112 Patienten haben in den nächsten 60 Tagen eine fällige Impfung.',
      'Bei 29 davon ist der Termin bereits überschritten, ohne dass jemand nachgefasst hat.',
      'Vorschlag: Die 29 heute erinnern — das sind erfahrungsgemäß 40 zusätzliche Termine im Quartal.',
    ],
    hoehepunkte: [
      'Tierbestand und Behandlungshistorie je Patient',
      'Automatische Erinnerung an Impfung und Kontrolle',
      'Online-Buchung entlastet das Telefon spürbar',
    ],
  },
  galabau: {
    mitarbeiter: 40, standorte: 1, sitze: { voll: 5, standard: 20, self: 15 },
    schmerz: 'Wetter verschiebt alles, Maschinen sind mal hier mal dort, und die Pflegeverträge laufen nebenher.',
    kiFrage: 'Was muss diese Woche raus und was kann warten?',
    kiAntwort: [
      'Elf Pflegeeinsätze sind terminiert, für Mittwoch und Donnerstag ist Regen gemeldet.',
      'Vier davon sind wetterunabhängig und können vorgezogen werden.',
      'Vorschlag: Diese vier auf Mittwoch, die Pflanzarbeiten auf Freitag.',
    ],
    hoehepunkte: [
      'Schlagkartei und Flächen mit Historie',
      'Pflegeverträge, die sich selbst in den Plan schreiben',
      'Geräteverleih und Materialabbuchung am Auftrag',
    ],
  },
  reinigung: {
    mitarbeiter: 140, standorte: 1, sitze: { voll: 8, standard: 22, self: 110 },
    schmerz: 'Hundert Objekte, dreihundert Einsätze im Monat, und die Stundenzettel kommen auf Papier.',
    kiFrage: 'Welche Objekte sind unrentabel?',
    kiAntwort: [
      'Bei neun Objekten liegen die geleisteten Stunden mehr als 15 % über der Kalkulation.',
      'Drei davon sind seit über zwei Jahren nicht preislich angepasst worden.',
      'Vorschlag: Diese drei zur Nachverhandlung — die Stundenauswertung je Objekt liegt bereit.',
    ],
    hoehepunkte: [
      'Objektzeiten je Einsatz, erfasst auf dem Handy',
      'Einsatzplanung mit Vertretung und Springern',
      'Leistungsnachweis für den Kunden entsteht automatisch',
    ],
  },
  verein: {
    mitarbeiter: 65, standorte: 2, sitze: { voll: 7, standard: 18, self: 40 },
    schmerz: 'Mitgliedsbeiträge, Spenden, Fördermittel und Veranstaltungen — vier Welten, ein Ehrenamt.',
    kiFrage: 'Wie steht es um Beiträge und Spenden?',
    kiAntwort: [
      '38 Mitgliedsbeiträge sind offen, zusammen 4.560 €.',
      'Für 12 Spenden des Vorjahres wurde noch keine Zuwendungsbestätigung erstellt.',
      'Vorschlag: Bestätigungen jetzt erzeugen und mit der Beitragserinnerung zusammen versenden.',
    ],
    hoehepunkte: [
      'Mitgliedsbeiträge mit automatischem Einzug',
      'Zuwendungsbestätigungen auf Knopfdruck',
      'Veranstaltungen, Räume und Förderanträge im selben System',
    ],
  },
};

/** Inhalt zu einem Slug — nie undefined nach außen, damit die Seite nie leer bleibt. */
export function vorfuehrInhalt(slug: string): VorfuehrInhalt | null {
  return VORFUEHR_INHALT[slug] ?? null;
}
