// app/vorschau/_lib/branchen-verkauf.ts
// Verkaufs-Copy je Website-Kategorie — hebt die Branchenseite vom generischen
// SEO-Text zu einem überzeugenden (nicht aggressiven) Sales-Funnel. Reiner Text,
// KEINE Video-Platzhalter. Platzhalter {branche} / {kategorie} werden gefüllt.
// Alle 19 Kategorien ausformuliert; nicht gefüllte fallen auf DEFAULT zurück.
// Schlüssel = die 19 Kategorie-Namen aus branchen-web KATEGORIE_ORDER (exakt!).

export interface VerkaufBeweis { icon: string; titel: string; text: string }
export interface VerkaufPack {
  heroSub: string;      // Hero-Subline
  schmerzHint: string;  // Zeile unter „Kennen Sie das?"
  nutzenHint: string;   // Zeile unter dem Ergebnis-Titel
  beweis: VerkaufBeweis[]; // 3 Vertrauens-/Nutzen-Punkte
  ctaClaim: string;     // starke Zeile über dem Anfrage-Block
}

// Starker, branchenneutraler Standard — gilt sofort für alle 698, falls eine
// Kategorie (noch) keine eigene Copy hat.
export const DEFAULT_VERKAUF: VerkaufPack = {
  heroSub: 'Angebote, Aufträge, Rechnungen, Personal und Auswertungen für {branche} — in einem System, ein Login. Kein Zettel-Chaos, keine fünf Programme, die nicht miteinander reden.',
  schmerzHint: 'Das kostet jeden Tag Zeit, Nerven und bares Geld — muss aber nicht sein.',
  nutzenHint: 'Einmal eingerichtet, läuft der Papierkram im Hintergrund — Sie machen wieder das, wofür Sie {branche} geworden sind.',
  beweis: [
    { icon: '🇩🇪', titel: 'Deutscher Server, DSGVO', text: 'Ihre Daten bleiben in Deutschland und in Ihrer Hand — keine Cloud-Fragezeichen.' },
    { icon: '🤝', titel: 'Persönlich eingerichtet', text: 'Wir richten ARGONAUT gemeinsam mit Ihnen ein. Sie starten begleitet, nicht allein.' },
    { icon: '⚡', titel: 'In Tagen startklar', text: 'Bestehende Daten werden übernommen — Ihr Team arbeitet schnell produktiv.' },
  ],
  ctaClaim: 'In einer Stunde sehen Sie, wie {branche} mit einem System statt zwölf läuft — unverbindlich.',
};

export const VERKAUF: Record<string, VerkaufPack> = {
  'Handwerk & Bau': {
    heroSub: 'Vom Aufmaß auf der Baustelle bis zur Rechnung im Büro — {branche} in einem System. Angebote schneller, Material und Stunden lückenlos, kein Zettel geht mehr verloren.',
    schmerzHint: 'Jeder verlorene Zettel und jede doppelt getippte Stunde ist bares Geld — auf dem Bau erst recht.',
    nutzenHint: 'Büro und Baustelle ziehen am selben Strang — Sie sehen jederzeit, wo jeder Auftrag steht.',
    beweis: [
      { icon: '📐', titel: 'Aufmaß & Angebot in einem', text: 'Vor Ort messen — das Angebot rechnet sich selbst. Minuten statt Feierabend-Abende.' },
      { icon: '🏗️', titel: 'Baustelle dokumentiert', text: 'Fotos, Nachträge und Stunden direkt von der Baustelle — nachweisbar, nichts vergessen.' },
      { icon: '🔧', titel: 'Wartung, die sich erinnert', text: 'Wiederkehrende Serviceaufträge planen sich selbst — wiederkehrender Umsatz ohne Nachhaken.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren typischen Auftrag — wir zeigen Ihnen, wie {branche} ihn ab morgen in einem System abwickelt.',
  },

  'Industrie & Produktion': {
    heroSub: 'Von der Auftragsannahme über die Fertigung bis zur Auslieferung — {branche} in einem System. Aufträge, Material, Maschinenzeiten und Qualität lückenlos verbunden.',
    schmerzHint: 'Stillstand, Ausschuss und Suchzeiten fressen die Marge — oft nur, weil die Zahlen erst am Monatsende zusammenkommen.',
    nutzenHint: 'Sie sehen in Echtzeit, wo jeder Auftrag steht, wie Ihre Maschinen laufen und wo die Marge wirklich entsteht.',
    beweis: [
      { icon: '📊', titel: 'OEE live im Blick', text: 'Verfügbarkeit, Leistung und Qualität je Maschine — Sie erkennen den größten Hebel sofort.' },
      { icon: '🏭', titel: 'Fertigung & Lager verzahnt', text: 'Material bucht sich mit dem Auftrag ab — kein Fehlteil überrascht Sie mehr mitten in der Serie.' },
      { icon: '📈', titel: 'Nachkalkuliert statt geschätzt', text: 'Jeder Auftrag zeigt echte Stunden und echtes Material — den nächsten kalkulieren Sie sicherer.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihre Fertigung — wir zeigen Ihnen, wie {branche} Aufträge, Maschinen und Marge in einem System steuert.',
  },

  'Handel & E-Commerce': {
    heroSub: 'Ladentheke, Lager und Onlineshop mit denselben Zahlen — {branche} in einem System. Bestände stimmen, Nachschub kommt rechtzeitig, jeder Verkauf ist verbucht.',
    schmerzHint: 'Überverkäufe, tote Ware im Regal und ein Kassensturz, der nie aufgeht — das kostet Marge, jeden einzelnen Tag.',
    nutzenHint: 'Ein Bestand, eine Wahrheit — vom Regal bis zum Shop rechnet alles miteinander.',
    beweis: [
      { icon: '🏷️', titel: 'Bestand, der stimmt', text: 'Jeder Verkauf bucht sich sofort ab — nie wieder verkaufen, was gar nicht mehr da ist.' },
      { icon: '🛒', titel: 'Kasse & Lager in einem', text: 'Von der Kasse bis zur Nachbestellung greift alles ineinander — kein doppeltes Tippen.' },
      { icon: '📦', titel: 'Nachschub zur rechten Zeit', text: 'Meldebestände erinnern von selbst — Renner sind da, Ladenhüter binden kein Kapital.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihr Sortiment — wir zeigen Ihnen, wie {branche} Laden, Lager und Shop mit einer Zahl führt.',
  },

  'Fahrzeuge & Mobilität': {
    heroSub: 'Vom Kostenvoranschlag über die Werkstatt bis zur Rechnung — {branche} in einem System. Aufträge, Teile, Termine und Fahrzeughistorie an einem Ort.',
    schmerzHint: 'Jede gesuchte Teilenummer und jeder verlorene Kostenvoranschlag ist Zeit, die Ihre Hebebühne nicht bezahlt.',
    nutzenHint: 'Werkstatt und Tresen ziehen zusammen — Sie wissen zu jedem Fahrzeug, was war und was ansteht.',
    beweis: [
      { icon: '🔧', titel: 'Auftrag bis Rechnung', text: 'Kostenvoranschlag, Arbeitswerte und Teile fließen direkt in die Rechnung — nichts geht verloren.' },
      { icon: '🚗', titel: 'Fahrzeughistorie parat', text: 'Jede Reparatur bleibt am Fahrzeug hängen — beim nächsten Besuch ist alles sofort da.' },
      { icon: '🗓️', titel: 'Termine & Auslastung', text: 'Werkstattplanung und Wiedervorlagen sorgen für volle, aber machbare Tage.' },
    ],
    ctaClaim: 'Zeigen Sie uns einen typischen Auftrag — wir zeigen Ihnen, wie {branche} ihn vom Voranschlag bis zur Rechnung in einem System führt.',
  },

  'Gastronomie, Hotellerie & Tourismus': {
    heroSub: 'Reservierung, Service, Küche und Abrechnung — {branche} in einem System. Tische und Zimmer voll, Wareneinsatz im Griff, Gäste, die wiederkommen.',
    schmerzHint: 'Leere Tische zur besten Zeit und ein Wareneinsatz, der aus dem Ruder läuft — beides frisst die Marge, die ohnehin knapp ist.',
    nutzenHint: 'Vom ersten Tisch bis zum Kassensturz läuft alles zusammen — Sie führen den Betrieb, nicht den Zettelstapel.',
    beweis: [
      { icon: '🍽️', titel: 'Tische & Zimmer im Griff', text: 'Reservierungen und Belegung auf einen Blick — keine Doppelbuchung, keine leere Spitzenzeit.' },
      { icon: '📋', titel: 'Wareneinsatz sichtbar', text: 'Einkauf, Lager und Speisekarte hängen zusammen — Sie sehen, wo die Marge bleibt.' },
      { icon: '💳', titel: 'Kassensturz, der aufgeht', text: 'Jeder Umsatz sauber verbucht — Tagesabschluss in Minuten statt im Hinterzimmer.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren Betrieb — wir zeigen Ihnen, wie {branche} Gäste, Küche und Kasse in einem System zusammenbringt.',
  },

  'Lebensmittel & Nahversorgung': {
    heroSub: 'Frische Ware, klare Herkunft und lückenlose Nachweise — {branche} in einem System. Chargen, Haltbarkeit und Kennzeichnung immer im Griff.',
    schmerzHint: 'Ein fehlender Nachweis bei der Kontrolle oder verderbliche Ware im Regal kostet mehr als Geld — es kostet Vertrauen.',
    nutzenHint: 'Herkunft, Charge und Haltbarkeit hängen an jedem Artikel — bei der nächsten Kontrolle liegt alles griffbereit.',
    beweis: [
      { icon: '🥖', titel: 'Frische im Blick', text: 'Haltbarkeiten und Bestände melden sich von selbst — Sie verkaufen frisch und werfen weniger weg.' },
      { icon: '🧾', titel: 'Kennzeichnung nach LMIV', text: 'Zutaten und Allergene sauber hinterlegt — Auszeichnung und Nachweis auf Knopfdruck.' },
      { icon: '🔍', titel: 'Rückverfolgbar bis zur Charge', text: 'Woher kam was, wohin ging es — die Kontrolle ist beantwortet, bevor sie fragt.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihr Sortiment — wir zeigen Ihnen, wie {branche} Frische, Herkunft und Nachweise in einem System sichert.',
  },

  'Logistik & Transport': {
    heroSub: 'Von der Auftragsannahme über die Tour bis zum Nachweis — {branche} in einem System. Sendungen, Fahrzeuge und Fahrer immer im Blick.',
    schmerzHint: 'Leerfahrten, gesuchte Lieferscheine und Fahrer, die nachfragen müssen — jede davon frisst Diesel, Zeit und Nerven.',
    nutzenHint: 'Disposition, Fahrzeuge und Nachweise laufen zusammen — Sie wissen jederzeit, wo jede Sendung steht.',
    beweis: [
      { icon: '🚚', titel: 'Touren sauber geplant', text: 'Aufträge und Fahrzeuge zusammengeführt — weniger Leerkilometer, vollere Touren.' },
      { icon: '📄', titel: 'Nachweis lückenlos', text: 'Lieferscheine und Ablieferbelege digital am Auftrag — kein Papier geht mehr verloren.' },
      { icon: '⏱️', titel: 'Status in Echtzeit', text: 'Wo ist welche Sendung? Sie und Ihr Kunde haben die Antwort, ohne anzurufen.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren Fuhrpark — wir zeigen Ihnen, wie {branche} Aufträge, Touren und Nachweise in einem System steuert.',
  },

  'IT & Technologie': {
    heroSub: 'Von der Anfrage über das Ticket bis zur Abrechnung — {branche} in einem System. Projekte, Verträge, Lizenzen und Zeiten ohne Reibung.',
    schmerzHint: 'Ungebuchte Stunden, vergessene Lizenzverlängerungen und SLAs, die durchrutschen — genau da versickert der Gewinn.',
    nutzenHint: 'Tickets, Verträge und Zeiten hängen zusammen — jede Leistung ist erfasst und wird auch abgerechnet.',
    beweis: [
      { icon: '🎫', titel: 'Kein Ticket verloren', text: 'Anfragen, Bearbeitung und SLA an einem Ort — Sie halten Zusagen ein, nachweisbar.' },
      { icon: '📅', titel: 'Verträge & Lizenzen im Blick', text: 'Laufzeiten und Verlängerungen erinnern von selbst — nie wieder eine Frist verpassen.' },
      { icon: '⏳', titel: 'Jede Stunde abgerechnet', text: 'Erfasste Zeiten fließen direkt in die Rechnung — aus geleisteter Arbeit wird bezahlter Umsatz.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihr Leistungsangebot — wir zeigen Ihnen, wie {branche} Tickets, Verträge und Abrechnung in einem System bündelt.',
  },

  'Energie & Umwelt': {
    heroSub: 'Von der Anlage über das Monitoring bis zur Abrechnung — {branche} in einem System. Erträge, Verbräuche und Wartung immer im Blick.',
    schmerzHint: 'Eine Anlage, die unbemerkt unter Soll läuft, kostet jeden Tag Ertrag — den Sie erst viel zu spät bemerken.',
    nutzenHint: 'Anlagen, Erträge und Wartung laufen zusammen — Sie sehen sofort, wo Leistung liegen bleibt.',
    beweis: [
      { icon: '☀️', titel: 'Ertrag gegen Soll', text: 'Jede Anlage zeigt, ob sie liefert, was sie soll — Minderleistung fällt sofort auf.' },
      { icon: '🔧', titel: 'Wartung, die sich meldet', text: 'Wiederkehrende Service-Termine planen sich selbst — Anlagen laufen, statt stillzustehen.' },
      { icon: '📊', titel: 'Abrechnung ohne Rätsel', text: 'Ertrag, Eigenverbrauch und Einspeisung sauber erfasst — die Zahlen stimmen von allein.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihre Anlagen — wir zeigen Ihnen, wie {branche} Ertrag, Wartung und Abrechnung in einem System überwacht.',
  },

  'Immobilien & Verwaltung': {
    heroSub: 'Von der Vermarktung über die Verwaltung bis zur Abrechnung — {branche} in einem System. Objekte, Mieter, Termine und Nebenkosten an einem Ort.',
    schmerzHint: 'Verstreute Objektunterlagen, verpasste Fristen und eine Nebenkostenabrechnung, die Wochen frisst — das muss nicht sein.',
    nutzenHint: 'Objekte, Mieter und Belege hängen zusammen — jede Frist und jeder Beleg ist da, wo Sie ihn suchen.',
    beweis: [
      { icon: '🏢', titel: 'Objekte & Mieter beisammen', text: 'Alle Unterlagen am Objekt — Verträge, Kontakte und Historie auf einen Griff.' },
      { icon: '🧾', titel: 'Nebenkosten nach BetrKV', text: 'Kostenarten und Verteiler sauber hinterlegt — die Abrechnung rechnet sich fast von selbst.' },
      { icon: '🔑', titel: 'Interessenten bis Zusage', text: 'Vom Exposé bis zum Vertrag jeder Lead im Blick — keine Anfrage versandet.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren Bestand — wir zeigen Ihnen, wie {branche} Objekte, Mieter und Abrechnung in einem System verwaltet.',
  },

  'Marketing, Medien & Kreativ': {
    heroSub: 'Von der Idee über die Freigabe bis zur Rechnung — {branche} in einem System. Projekte, Feedback, Zeiten und Budgets ohne Chaos.',
    schmerzHint: 'Freigaben in fünf E-Mail-Ketten, verlorene Versionen und ungebuchte Stunden — Kreativität leidet, wenn der Prozess bröckelt.',
    nutzenHint: 'Projekte, Freigaben und Zeiten laufen zusammen — Sie gestalten, statt Versionen zu suchen.',
    beweis: [
      { icon: '✅', titel: 'Freigaben statt E-Mail-Chaos', text: 'Jede Version, jedes Feedback an einem Ort — der Kunde gibt frei, Sie haben es schwarz auf weiß.' },
      { icon: '🎨', titel: 'Projekte im Überblick', text: 'Wer macht was bis wann — Auslastung und Deadlines auf einen Blick.' },
      { icon: '⏱️', titel: 'Zeiten, die sich rechnen', text: 'Erfasste Stunden fließen ins Budget und in die Rechnung — kein Aufwand bleibt unbezahlt.' },
    ],
    ctaClaim: 'Zeigen Sie uns ein typisches Projekt — wir zeigen Ihnen, wie {branche} Idee, Freigabe und Abrechnung in einem System führt.',
  },

  'Recht, Steuern & Finanzen': {
    heroSub: 'Von der Mandatsannahme über die Akte bis zur Abrechnung — {branche} in einem System. Fristen, Dokumente und Leistungen sicher im Griff.',
    schmerzHint: 'Eine verpasste Frist oder ein Dokument, das niemand findet, ist in Ihrem Metier keine Kleinigkeit — sondern ein echtes Risiko.',
    nutzenHint: 'Akten, Fristen und Leistungen hängen zusammen — nichts läuft ab, ohne dass Sie es kommen sehen.',
    beweis: [
      { icon: '⚖️', titel: 'Keine Frist rutscht durch', text: 'Fristen und Wiedervorlagen erinnern von selbst — Sie haben den Kalender im Griff, nicht andersherum.' },
      { icon: '🗂️', titel: 'Akte vollständig', text: 'Alle Dokumente am Mandat, DSGVO-konform und auf deutschem Server — sofort auffindbar.' },
      { icon: '💶', titel: 'Leistung sauber abgerechnet', text: 'Erfasste Tätigkeiten fließen direkt in die Rechnung — transparent und nachvollziehbar.' },
    ],
    ctaClaim: 'Zeigen Sie uns einen typischen Fall — wir zeigen Ihnen, wie {branche} Akten, Fristen und Abrechnung in einem System sichert.',
  },

  'Bildung & Wissenschaft': {
    heroSub: 'Von der Anmeldung über den Kurs bis zur Abrechnung — {branche} in einem System. Teilnehmer, Termine, Räume und Zahlungen an einem Ort.',
    schmerzHint: 'Überfüllte oder halbleere Kurse, doppelt belegte Räume und offene Zahlungen — das kostet Zeit, die in die Lehre gehört.',
    nutzenHint: 'Kurse, Teilnehmer und Räume laufen zusammen — Sie sehen sofort, was voll ist und was noch Plätze hat.',
    beweis: [
      { icon: '🎓', titel: 'Anmeldung bis Teilnahme', text: 'Jeder Teilnehmer, jeder Platz im Blick — Warteliste inklusive, nichts wird überbucht.' },
      { icon: '🏫', titel: 'Räume & Termine im Griff', text: 'Belegung auf einen Blick — keine Doppelbuchung, keine Suche nach dem freien Raum.' },
      { icon: '💳', titel: 'Zahlungen im Überblick', text: 'Wer hat gezahlt, wer nicht — offene Beträge sind sichtbar, statt vergessen.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihr Kursangebot — wir zeigen Ihnen, wie {branche} Anmeldung, Räume und Abrechnung in einem System organisiert.',
  },

  'Gesundheit & Wellness': {
    heroSub: 'Von der Terminvergabe über die Behandlung bis zur Abrechnung — {branche} in einem System. Termine, Kundenhistorie und Zahlungen ohne Papierberg.',
    schmerzHint: 'Leerlauf durch Ausfälle, gesuchte Karteikarten und offene Rechnungen — jede Lücke im Kalender ist Umsatz, der nicht wiederkommt.',
    nutzenHint: 'Termine, Historie und Abrechnung hängen zusammen — Sie kümmern sich um Menschen, nicht um Papier.',
    beweis: [
      { icon: '📅', titel: 'Kalender ohne Lücken', text: 'Termine und Erinnerungen laufen von selbst — weniger Ausfälle, vollere Tage.' },
      { icon: '📋', titel: 'Historie sofort parat', text: 'Jede Behandlung bleibt am Kunden — beim nächsten Termin ist alles da, DSGVO-konform.' },
      { icon: '💳', titel: 'Abrechnung ohne Aufwand', text: 'Leistungen fließen direkt in die Rechnung — offene Beträge bleiben sichtbar.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren typischen Tag — wir zeigen Ihnen, wie {branche} Termine, Historie und Abrechnung in einem System bündelt.',
  },

  'Sport, Beauty & Lifestyle': {
    heroSub: 'Von der Buchung über den Termin bis zur Kasse — {branche} in einem System. Kalender voll, Stammkunden gepflegt, jeder Umsatz verbucht.',
    schmerzHint: 'Lücken im Kalender, No-Shows und ein Kassenbuch, das nie stimmt — jede Leerzeit ist Umsatz, der nicht wiederkommt.',
    nutzenHint: 'Buchungen, Kunden und Kasse laufen zusammen — Sie machen Ihre Arbeit, das System hält den Laden zusammen.',
    beweis: [
      { icon: '📅', titel: 'Buchungen rund um die Uhr', text: 'Kunden buchen selbst, Erinnerungen laufen automatisch — weniger No-Shows, vollere Tage.' },
      { icon: '💇', titel: 'Stammkunden gepflegt', text: 'Jeder Besuch bleibt am Kunden — Sie wissen, was gut lief, und holen Gäste zurück.' },
      { icon: '💳', titel: 'Kasse & Umsatz im Griff', text: 'Jeder Verkauf sauber verbucht — Tagesabschluss ohne Zettelwirtschaft.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren Kalender — wir zeigen Ihnen, wie {branche} Buchung, Kunden und Kasse in einem System vereint.',
  },

  'Tiere': {
    heroSub: 'Von der Terminvergabe über die Betreuung bis zur Abrechnung — {branche} in einem System. Tiere, Halter, Termine und Historie an einem Ort.',
    schmerzHint: 'Verstreute Karteikarten, verpasste Anschlusstermine und offene Rechnungen — das kostet Zeit, die den Tieren gehört.',
    nutzenHint: 'Termine, Tierhistorie und Abrechnung hängen zusammen — Sie haben zu jedem Tier sofort das ganze Bild.',
    beweis: [
      { icon: '🐾', titel: 'Tier & Halter beisammen', text: 'Jede Betreuung bleibt am Tier hängen — beim nächsten Termin ist alles griffbereit.' },
      { icon: '📅', titel: 'Termine, die sich melden', text: 'Anschluss- und Folgetermine erinnern von selbst — nichts wird vergessen.' },
      { icon: '💳', titel: 'Abrechnung ohne Suchen', text: 'Leistungen fließen direkt in die Rechnung — offene Beträge bleiben im Blick.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren Alltag — wir zeigen Ihnen, wie {branche} Termine, Historie und Abrechnung in einem System zusammenführt.',
  },

  'Landwirtschaft, Garten & Forst': {
    heroSub: 'Von der Fläche über die Ernte bis zur Direktvermarktung — {branche} in einem System. Schläge, Bestände, Verkäufe und Nachweise im Griff.',
    schmerzHint: 'Aufzeichnungen auf Zetteln, Ware, die verdirbt, und Nachweise, die bei der Kontrolle fehlen — das kostet Ertrag und Nerven.',
    nutzenHint: 'Flächen, Erträge und Verkauf laufen zusammen — Sie sehen, was der Hof bringt, ohne Zettel zu wälzen.',
    beweis: [
      { icon: '🌾', titel: 'Vom Feld zum Nachweis', text: 'Erträge und Maßnahmen dokumentiert — bei der Kontrolle liegt alles bereit.' },
      { icon: '🥕', titel: 'Direktvermarktung im Griff', text: 'Hofladen, Marktstand und Bestände hängen zusammen — frische Ware, kein Überverkauf.' },
      { icon: '📊', titel: 'Zahlen statt Bauchgefühl', text: 'Sie sehen, welche Fläche und welches Produkt sich wirklich rechnet.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren Betrieb — wir zeigen Ihnen, wie {branche} Flächen, Ernte und Vermarktung in einem System führt.',
  },

  'Dienstleistungen': {
    heroSub: 'Von der Anfrage über den Auftrag bis zur Rechnung — {branche} in einem System. Kunden, Termine, Leistungen und Zahlungen ohne Reibungsverluste.',
    schmerzHint: 'Anfragen, die liegen bleiben, ungebuchte Stunden und offene Rechnungen — genau da geht der Gewinn leise verloren.',
    nutzenHint: 'Kunden, Aufträge und Rechnungen hängen zusammen — jede Leistung ist erfasst und wird auch bezahlt.',
    beweis: [
      { icon: '🤝', titel: 'Kein Kunde vergessen', text: 'Anfragen, Termine und Historie an einem Ort — Sie haben jeden Kontakt im Blick.' },
      { icon: '🗓️', titel: 'Aufträge im Fluss', text: 'Vom Auftrag bis zur Erledigung jeder Schritt sichtbar — nichts bleibt liegen.' },
      { icon: '💶', titel: 'Jede Leistung abgerechnet', text: 'Erfasste Zeiten und Leistungen fließen direkt in die Rechnung — kein Umsatz versickert.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren typischen Auftrag — wir zeigen Ihnen, wie {branche} Anfrage, Leistung und Rechnung in einem System verbindet.',
  },

  'Kultur, Soziales & Öffentliches': {
    heroSub: 'Von der Planung über die Veranstaltung bis zur Abrechnung — {branche} in einem System. Termine, Anmeldungen, Mitglieder und Mittel im Griff.',
    schmerzHint: 'Anmeldungen auf Papier, halbleere oder überfüllte Veranstaltungen und Abrechnungen, die niemand nachvollzieht — das bindet ehrenamtliche Kraft, die woanders fehlt.',
    nutzenHint: 'Veranstaltungen, Anmeldungen und Mittel laufen zusammen — Sie sehen sofort, wer kommt und was noch offen ist.',
    beweis: [
      { icon: '🎫', titel: 'Anmeldungen im Griff', text: 'Wer kommt, wer steht auf der Warteliste — Kapazität und Teilnehmer auf einen Blick.' },
      { icon: '👥', titel: 'Mitglieder & Kontakte gepflegt', text: 'Alle Daten an einem Ort — Einladungen und Erinnerungen laufen von selbst.' },
      { icon: '📊', titel: 'Mittel nachvollziehbar', text: 'Einnahmen und Ausgaben sauber erfasst — Abrechnung und Nachweis ohne Aktenberg.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihre Arbeit — wir zeigen Ihnen, wie {branche} Veranstaltungen, Mitglieder und Mittel in einem System bündelt.',
  },
};

/** Verkaufs-Pack einer Kategorie (Fallback: starker Standard). */
export function verkaufPack(kategorie: string): VerkaufPack {
  return VERKAUF[kategorie] ?? DEFAULT_VERKAUF;
}

/** Platzhalter {branche} / {kategorie} füllen. */
export function fuelleText(t: string, branche: string, kategorie: string): string {
  return (t || '')
    .replace(/\{branche\}/g, branche)
    .replace(/\{kategorie\}/g, kategorie);
}

/** Ist für diese Kategorie schon eigene Verkaufs-Copy hinterlegt? */
export function hatVerkaufCopy(kategorie: string): boolean {
  return kategorie in VERKAUF;
}
