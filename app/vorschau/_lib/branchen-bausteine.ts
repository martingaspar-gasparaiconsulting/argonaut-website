// app/vorschau/_lib/branchen-bausteine.ts
// Branchenspezifische Zusatz-Bausteine + Nutzer-Rollen — je Website-Kategorie (19).
// Ergänzt den allgemeinen Basis-Stack auf der Branchen-Detailseite um passende
// Extra-Kacheln ("Speziell für Ihre Branche") und liefert branchengerechte
// Rollen-Beschreibungen für den Preis-Rechner (Voll / Standard / Self-Service).

export interface Baustein { icon: string; name: string; tag?: string; sub: string }
export interface Rollen { voll: string; std: string; self: string }

// --- Zusatz-Bausteine je Kategorie (3–5 Stück) ---
export const ZUSATZ_BAUSTEINE: Record<string, Baustein[]> = {
  'Handwerk & Bau': [
    { icon: '📐', name: 'Aufmaß & Kalkulation', sub: 'Vor Ort messen — das Angebot rechnet sich selbst' },
    { icon: '🏗️', name: 'Baustellen-Doku', sub: 'Fotos, Notizen & Nachträge direkt von der Baustelle' },
    { icon: '⏱️', name: 'Regie- & Materialerfassung', sub: 'Stunden und Material je Auftrag, nichts geht verloren' },
    { icon: '🔧', name: 'Werkzeug & Geräte', sub: 'Wer hat was — Wartung & Prüftermine im Blick' },
    { icon: '📆', name: 'Wartung & Serviceverträge', sub: 'Wiederkehrende Aufträge automatisch eingeplant' },
  ],
  'Industrie & Produktion': [
    { icon: '🏭', name: 'Produktionsplanung', sub: 'Aufträge, Maschinen & Kapazitäten im Takt' },
    { icon: '✅', name: 'Qualitätssicherung', sub: 'Prüfpläne, Chargen & Rückverfolgbarkeit' },
    { icon: '📦', name: 'Stückliste & Fertigung', sub: 'Vom Auftrag zur Fertigung, Material reserviert' },
    { icon: '🔩', name: 'Wartung & Instandhaltung', sub: 'Maschinen-Wartung geplant, Stillstand vermieden' },
    { icon: '📈', name: 'Betriebsdaten (BDE/MDE)', sub: 'Was läuft und was steht — in Echtzeit' },
  ],
  'Handel & E-Commerce': [
    { icon: '🛒', name: 'Onlineshop-Anbindung', sub: 'Bestellungen & Bestand automatisch synchron' },
    { icon: '🏷️', name: 'Artikel & Varianten', sub: 'Größen, Farben und Preise sauber gepflegt' },
    { icon: '🔁', name: 'Retouren & Reklamationen', sub: 'Rücksendungen ohne Chaos abwickeln' },
    { icon: '📦', name: 'Wareneingang & Inventur', sub: 'Lieferungen prüfen, Bestand per Scan' },
    { icon: '⭐', name: 'Kundenbindung & Aktionen', sub: 'Gutscheine, Rabatte & Stammkunden' },
  ],
  'Fahrzeuge & Mobilität': [
    { icon: '🔧', name: 'Werkstattaufträge', sub: 'Reparaturauftrag bis Rechnung in einem Fluss' },
    { icon: '🅿️', name: 'Reifenhotel & Einlagerung', sub: 'Welcher Satz, welcher Platz — immer auffindbar' },
    { icon: '🚗', name: 'Fahrzeugakte & Historie', sub: 'Jedes Fahrzeug mit kompletter Historie' },
    { icon: '📅', name: 'Termin- & Ersatzwagen', sub: 'Werkstatttermine und Leihwagen planen' },
    { icon: '🔩', name: 'Teile & Bestellungen', sub: 'Ersatzteile je Auftrag, direkt bestellt' },
  ],
  'Gastronomie, Hotellerie & Tourismus': [
    { icon: '🍽️', name: 'Tischplan & Reservierung', sub: 'Tische & Gäste jederzeit im Blick' },
    { icon: '🛏️', name: 'Zimmer & Belegung', sub: 'Buchungen, Check-in & Housekeeping' },
    { icon: '📋', name: 'Speisekarte & Rezepturen', sub: 'Karten, Allergene & Kalkulation' },
    { icon: '🧑‍🍳', name: 'Schicht- & Dienstplan', sub: 'Personal passend zur Auslastung' },
    { icon: '🥗', name: 'Wareneinsatz & Einkauf', sub: 'Food-Cost und Lieferanten im Griff' },
  ],
  'Lebensmittel & Nahversorgung': [
    { icon: '🥖', name: 'Rezepturen & Chargen', sub: 'Rezepte, Mengen & Rückverfolgbarkeit' },
    { icon: '🏷️', name: 'Allergene & Kennzeichnung', sub: 'Zutaten und Kennzeichnung rechtssicher' },
    { icon: '❄️', name: 'HACCP & Kühlkette', sub: 'Temperaturen & Hygiene lückenlos dokumentiert' },
    { icon: '🧾', name: 'Theke & Vorbestellung', sub: 'Vorbestellungen und Verkauf verbunden' },
    { icon: '🚚', name: 'Lieferung & Marktstände', sub: 'Touren, Märkte & Bestellungen planen' },
  ],
  'Logistik & Transport': [
    { icon: '🗺️', name: 'Tourenplanung', sub: 'Routen und Fahrzeuge optimal geplant' },
    { icon: '📦', name: 'Sendungsverfolgung', sub: 'Jede Sendung mit Status & Nachweis' },
    { icon: '✍️', name: 'Ablieferbeleg (ePOD)', sub: 'Unterschrift & Foto direkt digital' },
    { icon: '🚛', name: 'Fuhrpark & Wartung', sub: 'Fahrzeuge, Prüftermine & Kosten' },
    { icon: '⏱️', name: 'Fahrer & Zeiten', sub: 'Aufträge und Zeiten je Fahrer' },
  ],
  'IT & Technologie': [
    { icon: '🎫', name: 'Ticket- & Support-System', sub: 'Anfragen und SLAs, alles nachvollziehbar' },
    { icon: '⏲️', name: 'Projekt- & Zeiterfassung', sub: 'Zeiten je Projekt, sauber abgerechnet' },
    { icon: '🔁', name: 'Verträge & Wiederkehrendes', sub: 'Wartung & Abos automatisch fakturiert' },
    { icon: '🖥️', name: 'Assets & Lizenzen', sub: 'Geräte, Lizenzen & Kunden zugeordnet' },
    { icon: '📊', name: 'Auslastung & Marge', sub: 'Welches Projekt trägt sich wirklich' },
  ],
  'Energie & Umwelt': [
    { icon: '☀️', name: 'Anlagen & Objekte', sub: 'Jede Anlage mit Standort & Historie' },
    { icon: '🔧', name: 'Wartung & Service', sub: 'Wiederkehrende Prüfungen automatisch geplant' },
    { icon: '📊', name: 'Monitoring & Erträge', sub: 'Leistung und Störungen im Blick' },
    { icon: '📋', name: 'Förderung & Nachweise', sub: 'Dokumente und Nachweise geordnet' },
    { icon: '📆', name: 'Einsatz- & Tourenplanung', sub: 'Techniker und Termine planen' },
  ],
  'Immobilien & Verwaltung': [
    { icon: '🏠', name: 'Objekt- & Einheitenverwaltung', sub: 'Objekte, Einheiten & Mieter zentral' },
    { icon: '📄', name: 'Exposés & Vermarktung', sub: 'Exposé, Portale & Interessenten' },
    { icon: '🗓️', name: 'Besichtigungen & Interessenten', sub: 'Termine und Nachfassen automatisch' },
    { icon: '🧾', name: 'Neben- & Betriebskosten', sub: 'Abrechnungen sauber vorbereitet' },
    { icon: '🔧', name: 'Instandhaltung & Handwerker', sub: 'Aufträge und Dienstleister koordiniert' },
  ],
  'Marketing, Medien & Kreativ': [
    { icon: '🗂️', name: 'Projekt- & Kampagnenplanung', sub: 'Jedes Projekt mit Budget & Deadline' },
    { icon: '⏱️', name: 'Zeit & Abrechnung', sub: 'Kreativstunden erfassen und abrechnen' },
    { icon: '🖼️', name: 'Assets & Freigaben', sub: 'Dateien, Versionen & Kundenfreigabe' },
    { icon: '🔁', name: 'Retainer & Abos', sub: 'Wiederkehrende Leistungen automatisch' },
    { icon: '📊', name: 'Auslastung & Marge', sub: 'Wer ist ausgelastet, was lohnt sich' },
  ],
  'Recht, Steuern & Finanzen': [
    { icon: '📁', name: 'Mandanten & Akten', sub: 'Jeder Mandant mit kompletter Akte' },
    { icon: '⏱️', name: 'Leistungs- & Zeiterfassung', sub: 'Zeiten und Honorare nachvollziehbar' },
    { icon: '📅', name: 'Fristen & Wiedervorlagen', sub: 'Keine Frist geht mehr verloren' },
    { icon: '🔒', name: 'Sicherer Dokumententausch', sub: 'Unterlagen geschützt austauschen' },
    { icon: '🧾', name: 'Honorar & Abrechnung', sub: 'Nach Aufwand oder pauschal' },
  ],
  'Bildung & Wissenschaft': [
    { icon: '👨‍🎓', name: 'Teilnehmer & Kurse', sub: 'Anmeldungen, Gruppen & Belegung' },
    { icon: '🗓️', name: 'Stunden- & Raumplanung', sub: 'Kurse, Räume & Dozenten planen' },
    { icon: '🧾', name: 'Kursgebühren & Beiträge', sub: 'Gebühren und Zahlungen im Blick' },
    { icon: '📜', name: 'Zertifikate & Nachweise', sub: 'Teilnahmen und Zertifikate erzeugen' },
    { icon: '💬', name: 'Teilnehmer-Kommunikation', sub: 'Infos und Erinnerungen automatisch' },
  ],
  'Gesundheit & Wellness': [
    { icon: '🗓️', name: 'Termin- & Kundenverwaltung', sub: 'Termine und Kundenhistorie an einem Ort' },
    { icon: '📋', name: 'Beratungs- & Versorgungsdoku', sub: 'Beratung und Versorgung dokumentiert' },
    { icon: '🔁', name: 'Erinnerungen & Wiederkehr', sub: 'Kontroll- und Folgetermine automatisch' },
    { icon: '🧾', name: 'Verkauf & Abrechnung', sub: 'Produkte und Leistungen sauber abgerechnet' },
    { icon: '📦', name: 'Bestand & Bestellung', sub: 'Waren und Nachschub im Blick' },
  ],
  'Sport, Beauty & Lifestyle': [
    { icon: '📅', name: 'Termin- & Onlinebuchung', sub: 'Kunden buchen selbst, Kalender füllt sich' },
    { icon: '👥', name: 'Kundenkartei & Verlauf', sub: 'Vorlieben und Behandlungen gespeichert' },
    { icon: '🔁', name: 'Mitglieder & Abos', sub: 'Beiträge und Verträge automatisch' },
    { icon: '🧾', name: 'Kasse & Produktverkauf', sub: 'Behandlung und Verkauf in einem' },
    { icon: '💬', name: 'Erinnerungen & No-Show', sub: 'Weniger Ausfälle durch Erinnerungen' },
  ],
  'Tiere': [
    { icon: '🐾', name: 'Tier- & Halterakte', sub: 'Jedes Tier mit Halter und Historie' },
    { icon: '📅', name: 'Termin- & Betreuungsplan', sub: 'Termine und Betreuungszeiten planen' },
    { icon: '🔁', name: 'Pakete & Abos', sub: 'Betreuungspakete automatisch abgerechnet' },
    { icon: '🧾', name: 'Verkauf & Bestand', sub: 'Futter und Zubehör im Blick' },
    { icon: '💬', name: 'Erinnerungen & Kommunikation', sub: 'Halter automatisch erinnern' },
  ],
  'Landwirtschaft, Garten & Forst': [
    { icon: '🌱', name: 'Flächen & Kulturen', sub: 'Schläge, Flächen & Maßnahmen im Blick' },
    { icon: '🚜', name: 'Maschinen & Geräte', sub: 'Einsatz, Wartung & Kosten je Gerät' },
    { icon: '📋', name: 'Einsatz- & Auftragsplanung', sub: 'Kolonnen und Aufträge planen' },
    { icon: '🧾', name: 'Ernte & Direktvermarktung', sub: 'Vom Feld bis zur Rechnung' },
    { icon: '📆', name: 'Saison & Wiederkehr', sub: 'Pflege- und Saisonarbeiten geplant' },
  ],
  'Dienstleistungen': [
    { icon: '📆', name: 'Einsatz- & Objektplanung', sub: 'Wer ist wann bei welchem Kunden' },
    { icon: '📋', name: 'Leistungsnachweis & Doku', sub: 'Erledigt, dokumentiert, nachweisbar' },
    { icon: '🔁', name: 'Verträge & Wiederkehr', sub: 'Regelmäßige Aufträge automatisch' },
    { icon: '🧾', name: 'Aufwand & Abrechnung', sub: 'Nach Zeit, Objekt oder pauschal' },
    { icon: '👥', name: 'Personal & Schichten', sub: 'Teams passend eingeteilt' },
  ],
  'Kultur, Soziales & Öffentliches': [
    { icon: '👥', name: 'Mitglieder & Kontakte', sub: 'Mitglieder, Ehrenamt & Förderer' },
    { icon: '🗓️', name: 'Veranstaltungen & Anmeldungen', sub: 'Events planen und Teilnehmer verwalten' },
    { icon: '💶', name: 'Beiträge & Spenden', sub: 'Beiträge, Spenden & Zuwendungsnachweise' },
    { icon: '📋', name: 'Projekte & Fördermittel', sub: 'Projekte und Mittelverwendung dokumentiert' },
    { icon: '📄', name: 'Anträge & Dokumente', sub: 'Formulare und Nachweise geordnet' },
  ],
}

// --- Nutzer-Rollen je Kategorie (branchengerechte Beispiele für den Rechner) ---
const DEFAULT_ROLLEN: Rollen = {
  voll: 'Chef, GF, Büro, Dispo',
  std: 'Sachbearbeiter mit Doku',
  self: 'Zeiterfassung, Lohnzettel, Mein Bereich',
}

export const NUTZER_ROLLEN: Record<string, Rollen> = {
  'Handwerk & Bau': { voll: 'Chef, Meister, Büro & Dispo', std: 'Geselle & Vorarbeiter mit Doku', self: 'Monteur & Azubi: Zeit & Baustellen-Doku' },
  'Industrie & Produktion': { voll: 'GF, Produktions- & Werksleitung', std: 'Schichtleiter & QS mit Doku', self: 'Produktion & Versand: Zeit & Meldungen' },
  'Handel & E-Commerce': { voll: 'Inhaber, GF & Einkauf', std: 'Verkauf & Lager mit Doku', self: 'Aushilfe & Lager: Zeit & Bestand' },
  'Fahrzeuge & Mobilität': { voll: 'Inhaber, Werkstattleitung & Büro', std: 'Serviceberater & Mechaniker mit Doku', self: 'Azubi & Aushilfe: Zeit & Auftragsstatus' },
  'Gastronomie, Hotellerie & Tourismus': { voll: 'Inhaber, GF & Schichtleitung', std: 'Service & Küche mit Doku', self: 'Aushilfe & Saison: Zeit & Dienstplan' },
  'Lebensmittel & Nahversorgung': { voll: 'Inhaber, Meister & Büro', std: 'Verkauf & Produktion mit Doku', self: 'Aushilfe: Zeit & Vorbestellungen' },
  'Logistik & Transport': { voll: 'Inhaber, Disposition & Büro', std: 'Lager & Lagerleitung mit Doku', self: 'Fahrer: Aufträge, Zeiten & Ablieferbeleg' },
  'IT & Technologie': { voll: 'GF, Projektleitung & Vertrieb', std: 'Entwickler & Consultants mit Doku', self: 'Werkstudent & Support: Zeit & Tickets' },
  'Energie & Umwelt': { voll: 'GF, Projekt- & Serviceleitung', std: 'Techniker & Planer mit Doku', self: 'Monteur: Zeit & Einsatzdoku' },
  'Immobilien & Verwaltung': { voll: 'Inhaber, GF & Verwaltung', std: 'Makler & Sachbearbeiter mit Doku', self: 'Aushilfe: Zeit & Termine' },
  'Marketing, Medien & Kreativ': { voll: 'GF, Beratung & Projektleitung', std: 'Kreative & Redaktion mit Doku', self: 'Freelancer & Praktikant: Zeit & Aufgaben' },
  'Recht, Steuern & Finanzen': { voll: 'Partner/Inhaber & Berater', std: 'Fachangestellte & Sachbearbeiter mit Doku', self: 'Azubi & Assistenz: Zeit & Fristen' },
  'Bildung & Wissenschaft': { voll: 'Leitung & Verwaltung', std: 'Dozenten & Lehrkräfte mit Doku', self: 'Aushilfe: Zeit & Kurslisten' },
  'Gesundheit & Wellness': { voll: 'Inhaber, Leitung & Büro', std: 'Fachkräfte & Beratung mit Doku', self: 'Aushilfe & Empfang: Zeit & Termine' },
  'Sport, Beauty & Lifestyle': { voll: 'Inhaber & Studioleitung', std: 'Stylisten, Trainer & Fachkräfte mit Doku', self: 'Aushilfe & Empfang: Zeit & Buchungen' },
  'Tiere': { voll: 'Inhaber, Leitung & Büro', std: 'Betreuer & Fachkräfte mit Doku', self: 'Aushilfe: Zeit & Betreuungsplan' },
  'Landwirtschaft, Garten & Forst': { voll: 'Betriebsleiter & Büro', std: 'Vorarbeiter & Fachkräfte mit Doku', self: 'Saisonkraft & Aushilfe: Zeit & Einsatzdoku' },
  'Dienstleistungen': { voll: 'Inhaber, GF & Disposition', std: 'Objekt- & Teamleitung mit Doku', self: 'Servicekraft & Aushilfe: Zeit & Nachweis' },
  'Kultur, Soziales & Öffentliches': { voll: 'Vorstand, Leitung & Verwaltung', std: 'Mitarbeiter & Koordination mit Doku', self: 'Ehrenamt & Aushilfe: Zeit & Aufgaben' },
}

export function zusatzBausteineFor(kategorie: string): Baustein[] {
  return ZUSATZ_BAUSTEINE[kategorie] ?? []
}

export function nutzerRollenFor(kategorie: string): Rollen {
  return NUTZER_ROLLEN[kategorie] ?? DEFAULT_ROLLEN
}
