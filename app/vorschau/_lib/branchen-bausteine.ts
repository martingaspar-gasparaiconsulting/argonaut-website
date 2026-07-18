// app/vorschau/_lib/branchen-bausteine.ts
// BAUKASTEN je Website-Kategorie (19). Modell:
//   • KERN — bekommt jede Branche (10 Module)
//   • Erweiterte Basis — Lager (Warenwirtschaft) und/oder Kasse (POS), je Kategorie zugeschaltet
//   • Spezial-Module — kuratiert & eingegrenzt pro Kategorie (der Metzger bekommt nichts aus der Industrie)
//   • Nutzer-Rollen — branchengerecht (kein "Monteur" in der Lebensmittelproduktion)
// Jederzeit erweiterbar: Module ergänzen oder je Kategorie zu-/abschalten.

export interface Baustein { icon: string; name: string; tag?: string; sub: string }
export interface Rollen { voll: string; std: string; self: string }
export interface Baukasten { stack: Baustein[]; spezial: Baustein[]; rollen: Rollen }

interface KatConfig { lager: boolean; kasse: boolean; spezial: Baustein[]; rollen: Rollen }

// --- KERN: bekommt jede Branche ---
export const KERN: Baustein[] = [
  { icon: '📇', name: 'Kunden & Kontakte', tag: 'CRM', sub: 'Alle Kunden & Historie an einem Ort' },
  { icon: '📋', name: 'Angebote & Aufträge', sub: 'Vom Angebot bis zum erledigten Auftrag' },
  { icon: '🧾', name: 'Rechnungen & Mahnwesen', tag: 'Faktura', sub: 'Zahlungen im Blick, E-Rechnung' },
  { icon: '📅', name: 'Termine & Kalender', sub: 'Planung & Erinnerungen, nichts vergessen' },
  { icon: '✅', name: 'Aufgaben & Projekte', sub: 'Jeder weiß, was zu tun ist' },
  { icon: '👥', name: 'Personal & Zeiten', sub: 'Stunden, Urlaub, Lohn-Brücke' },
  { icon: '📄', name: 'Dokumente & Verträge', tag: 'DMS', sub: 'Alles digital, DSGVO-konform' },
  { icon: '📊', name: 'Auswertungen & Dashboard', tag: 'BI', sub: 'Ihre Zahlen in Echtzeit' },
  { icon: '🧭', name: 'Ihre KI-Crew', sub: 'Nimmt Routine ab und denkt mit' },
  { icon: '🔒', name: 'Deutscher Server & DSGVO', sub: 'Sicher und rechtskonform' },
]

// --- Erweiterte Basis (situativ zugeschaltet) ---
const LAGER: Baustein = { icon: '📦', name: 'Lager & Material', tag: 'Warenwirtschaft', sub: 'Bestand & Bestellungen immer aktuell' }
const KASSE: Baustein = { icon: '💳', name: 'Kasse & Zahlungen', tag: 'POS', sub: 'Verkauf sauber erfasst' }

const DEFAULT_ROLLEN: Rollen = {
  voll: 'Chef, GF, Büro, Dispo',
  std: 'Sachbearbeiter mit Doku',
  self: 'Zeiterfassung, Lohnzettel, Mein Bereich',
}

// --- Konfiguration je Kategorie ---
export const KATEGORIE_KONFIG: Record<string, KatConfig> = {
  'Handwerk & Bau': {
    lager: true, kasse: false,
    spezial: [
      { icon: '📐', name: 'Aufmaß & Kalkulation', sub: 'Vor Ort messen — das Angebot rechnet sich selbst' },
      { icon: '🏗️', name: 'Baustellen-Doku', sub: 'Fotos, Notizen & Nachträge direkt von der Baustelle' },
      { icon: '⏱️', name: 'Regie- & Materialerfassung', sub: 'Stunden und Material je Auftrag, nichts geht verloren' },
      { icon: '🔧', name: 'Werkzeug & Geräte', sub: 'Wer hat was — Wartung & Prüftermine im Blick' },
      { icon: '📆', name: 'Wartung & Serviceverträge', sub: 'Wiederkehrende Aufträge automatisch eingeplant' },
    ],
    rollen: { voll: 'Chef, Meister, Büro & Dispo', std: 'Geselle & Vorarbeiter mit Doku', self: 'Monteur & Azubi: Zeit & Baustellen-Doku' },
  },
  'Industrie & Produktion': {
    lager: true, kasse: false,
    spezial: [
      { icon: '🏭', name: 'Produktionsplanung', tag: 'PPS', sub: 'Aufträge, Maschinen & Kapazitäten im Takt' },
      { icon: '📦', name: 'Stückliste & Fertigung', sub: 'Vom Auftrag zur Fertigung, Material reserviert' },
      { icon: '✅', name: 'Qualitätssicherung & Chargen', sub: 'Prüfpläne, Chargen & Rückverfolgbarkeit' },
      { icon: '🔩', name: 'Wartung & Instandhaltung', sub: 'Maschinen-Wartung geplant, Stillstand vermieden' },
      { icon: '📈', name: 'Betriebsdaten', tag: 'BDE/MDE', sub: 'Was läuft und was steht — in Echtzeit' },
      { icon: '🛒', name: 'Einkauf & Lieferanten', sub: 'Bestellungen, Preise & Liefertermine im Griff' },
      { icon: '🧮', name: 'Kalkulation & Nachkalkulation', sub: 'Was ein Auftrag wirklich kostet' },
    ],
    rollen: { voll: 'GF, Produktions- & Werksleitung, Vertrieb/Einkauf', std: 'Schichtleiter, QS & Meister mit Doku', self: 'Produktion & Versand: Zeit & BDE-Meldungen' },
  },
  'Handel & E-Commerce': {
    lager: true, kasse: true,
    spezial: [
      { icon: '🛒', name: 'Onlineshop-Anbindung', sub: 'Bestellungen & Bestand automatisch synchron' },
      { icon: '🏷️', name: 'Artikel & Varianten', sub: 'Größen, Farben und Preise sauber gepflegt' },
      { icon: '🔁', name: 'Retouren & Reklamationen', sub: 'Rücksendungen ohne Chaos abwickeln' },
      { icon: '📥', name: 'Wareneingang & Inventur', sub: 'Lieferungen prüfen, Bestand per Scan' },
      { icon: '⭐', name: 'Kundenbindung & Aktionen', sub: 'Gutscheine, Rabatte & Stammkunden' },
    ],
    rollen: { voll: 'Inhaber, GF & Einkauf', std: 'Verkauf & Lager mit Doku', self: 'Aushilfe & Lager: Zeit & Bestand' },
  },
  'Fahrzeuge & Mobilität': {
    lager: true, kasse: true,
    spezial: [
      { icon: '🔧', name: 'Werkstattaufträge', sub: 'Reparaturauftrag bis Rechnung in einem Fluss' },
      { icon: '🅿️', name: 'Reifenhotel & Einlagerung', sub: 'Welcher Satz, welcher Platz — immer auffindbar' },
      { icon: '🚗', name: 'Fahrzeugakte & Historie', sub: 'Jedes Fahrzeug mit kompletter Historie' },
      { icon: '🔩', name: 'Teile & Bestellungen', sub: 'Ersatzteile je Auftrag, direkt bestellt' },
      { icon: '📅', name: 'Termin- & Ersatzwagen', sub: 'Werkstatttermine und Leihwagen planen' },
    ],
    rollen: { voll: 'Inhaber, Werkstattleitung & Büro', std: 'Serviceberater & Mechaniker mit Doku', self: 'Azubi & Aushilfe: Zeit & Auftragsstatus' },
  },
  'Gastronomie, Hotellerie & Tourismus': {
    lager: true, kasse: true,
    spezial: [
      { icon: '🍽️', name: 'Tischplan & Reservierung', sub: 'Tische & Gäste jederzeit im Blick' },
      { icon: '🛏️', name: 'Zimmer & Belegung', sub: 'Buchungen, Check-in & Housekeeping' },
      { icon: '📋', name: 'Speisekarte & Rezepturen', sub: 'Karten, Allergene & Kalkulation' },
      { icon: '🧑‍🍳', name: 'Schicht- & Dienstplan', sub: 'Personal passend zur Auslastung' },
      { icon: '🥗', name: 'Wareneinsatz & Einkauf', sub: 'Food-Cost und Lieferanten im Griff' },
    ],
    rollen: { voll: 'Inhaber, GF & Schichtleitung', std: 'Service & Küche mit Doku', self: 'Aushilfe & Saison: Zeit & Dienstplan' },
  },
  'Lebensmittel & Nahversorgung': {
    lager: true, kasse: true,
    spezial: [
      { icon: '🥖', name: 'Rezepturen & Chargen', sub: 'Rezepte, Mengen & Rückverfolgbarkeit' },
      { icon: '🏷️', name: 'Allergene & Kennzeichnung', sub: 'Zutaten und Kennzeichnung rechtssicher' },
      { icon: '❄️', name: 'HACCP & Kühlkette', sub: 'Temperaturen & Hygiene lückenlos dokumentiert' },
      { icon: '🧾', name: 'Theke & Vorbestellung', sub: 'Vorbestellungen und Verkauf verbunden' },
      { icon: '🚚', name: 'Lieferung & Marktstände', sub: 'Touren, Märkte & Bestellungen planen' },
    ],
    rollen: { voll: 'Inhaber, Meister & Büro', std: 'Verkauf & Produktion mit Doku', self: 'Aushilfe: Zeit & Vorbestellungen' },
  },
  'Logistik & Transport': {
    lager: true, kasse: false,
    spezial: [
      { icon: '🗺️', name: 'Tourenplanung', sub: 'Routen und Fahrzeuge optimal geplant' },
      { icon: '📦', name: 'Sendungsverfolgung', sub: 'Jede Sendung mit Status & Nachweis' },
      { icon: '✍️', name: 'Ablieferbeleg (ePOD)', sub: 'Unterschrift & Foto direkt digital' },
      { icon: '🚛', name: 'Fuhrpark & Wartung', sub: 'Fahrzeuge, Prüftermine & Kosten' },
      { icon: '⏱️', name: 'Fahrer & Zeiten', sub: 'Aufträge und Zeiten je Fahrer' },
    ],
    rollen: { voll: 'Inhaber, Disposition & Büro', std: 'Lager & Lagerleitung mit Doku', self: 'Fahrer: Aufträge, Zeiten & Ablieferbeleg' },
  },
  'IT & Technologie': {
    lager: false, kasse: false,
    spezial: [
      { icon: '🎫', name: 'Ticket- & Support-System', sub: 'Anfragen und SLAs, alles nachvollziehbar' },
      { icon: '⏲️', name: 'Projekt- & Zeiterfassung', sub: 'Zeiten je Projekt, sauber abgerechnet' },
      { icon: '🔁', name: 'Verträge & Wiederkehrendes', sub: 'Wartung & Abos automatisch fakturiert' },
      { icon: '🖥️', name: 'Assets & Lizenzen', sub: 'Geräte, Lizenzen & Kunden zugeordnet' },
      { icon: '📊', name: 'Auslastung & Marge', sub: 'Welches Projekt trägt sich wirklich' },
    ],
    rollen: { voll: 'GF, Projektleitung & Vertrieb', std: 'Entwickler & Consultants mit Doku', self: 'Werkstudent & Support: Zeit & Tickets' },
  },
  'Energie & Umwelt': {
    lager: true, kasse: false,
    spezial: [
      { icon: '☀️', name: 'Anlagen & Objekte', sub: 'Jede Anlage mit Standort & Historie' },
      { icon: '🔧', name: 'Wartung & Service', sub: 'Wiederkehrende Prüfungen automatisch geplant' },
      { icon: '📊', name: 'Monitoring & Erträge', sub: 'Leistung und Störungen im Blick' },
      { icon: '📋', name: 'Förderung & Nachweise', sub: 'Dokumente und Nachweise geordnet' },
      { icon: '📆', name: 'Einsatz- & Tourenplanung', sub: 'Techniker und Termine planen' },
    ],
    rollen: { voll: 'GF, Projekt- & Serviceleitung', std: 'Techniker & Planer mit Doku', self: 'Monteur: Zeit & Einsatzdoku' },
  },
  'Immobilien & Verwaltung': {
    lager: false, kasse: false,
    spezial: [
      { icon: '🏠', name: 'Objekt- & Einheitenverwaltung', sub: 'Objekte, Einheiten & Mieter zentral' },
      { icon: '📄', name: 'Exposés & Vermarktung', sub: 'Exposé, Portale & Interessenten' },
      { icon: '🗓️', name: 'Besichtigungen & Interessenten', sub: 'Termine und Nachfassen automatisch' },
      { icon: '🧾', name: 'Neben- & Betriebskosten', sub: 'Abrechnungen sauber vorbereitet' },
      { icon: '🔧', name: 'Instandhaltung & Handwerker', sub: 'Aufträge und Dienstleister koordiniert' },
    ],
    rollen: { voll: 'Inhaber, GF & Verwaltung', std: 'Makler & Sachbearbeiter mit Doku', self: 'Aushilfe: Zeit & Termine' },
  },
  'Marketing, Medien & Kreativ': {
    lager: false, kasse: false,
    spezial: [
      { icon: '🗂️', name: 'Projekt- & Kampagnenplanung', sub: 'Jedes Projekt mit Budget & Deadline' },
      { icon: '⏱️', name: 'Zeit & Abrechnung', sub: 'Kreativstunden erfassen und abrechnen' },
      { icon: '🖼️', name: 'Assets & Freigaben', sub: 'Dateien, Versionen & Kundenfreigabe' },
      { icon: '🔁', name: 'Retainer & Abos', sub: 'Wiederkehrende Leistungen automatisch' },
      { icon: '📊', name: 'Auslastung & Marge', sub: 'Wer ist ausgelastet, was lohnt sich' },
    ],
    rollen: { voll: 'GF, Beratung & Projektleitung', std: 'Kreative & Redaktion mit Doku', self: 'Freelancer & Praktikant: Zeit & Aufgaben' },
  },
  'Recht, Steuern & Finanzen': {
    lager: false, kasse: false,
    spezial: [
      { icon: '📁', name: 'Mandanten & Akten', sub: 'Jeder Mandant mit kompletter Akte' },
      { icon: '⏱️', name: 'Leistungs- & Zeiterfassung', sub: 'Zeiten und Honorare nachvollziehbar' },
      { icon: '📅', name: 'Fristen & Wiedervorlagen', sub: 'Keine Frist geht mehr verloren' },
      { icon: '🔒', name: 'Sicherer Dokumententausch', sub: 'Unterlagen geschützt austauschen' },
      { icon: '🧾', name: 'Honorar & Abrechnung', sub: 'Nach Aufwand oder pauschal' },
    ],
    rollen: { voll: 'Partner/Inhaber & Berater', std: 'Fachangestellte & Sachbearbeiter mit Doku', self: 'Azubi & Assistenz: Zeit & Fristen' },
  },
  'Bildung & Wissenschaft': {
    lager: false, kasse: false,
    spezial: [
      { icon: '👨‍🎓', name: 'Teilnehmer & Kurse', sub: 'Anmeldungen, Gruppen & Belegung' },
      { icon: '🗓️', name: 'Stunden- & Raumplanung', sub: 'Kurse, Räume & Dozenten planen' },
      { icon: '🧾', name: 'Kursgebühren & Beiträge', sub: 'Gebühren und Zahlungen im Blick' },
      { icon: '📜', name: 'Zertifikate & Nachweise', sub: 'Teilnahmen und Zertifikate erzeugen' },
      { icon: '💬', name: 'Teilnehmer-Kommunikation', sub: 'Infos und Erinnerungen automatisch' },
    ],
    rollen: { voll: 'Leitung & Verwaltung', std: 'Dozenten & Lehrkräfte mit Doku', self: 'Aushilfe: Zeit & Kurslisten' },
  },
  'Gesundheit & Wellness': {
    lager: true, kasse: true,
    spezial: [
      { icon: '🗓️', name: 'Termin- & Kundenverwaltung', sub: 'Termine und Kundenhistorie an einem Ort' },
      { icon: '📋', name: 'Beratungs- & Versorgungsdoku', sub: 'Beratung und Versorgung dokumentiert' },
      { icon: '🛠️', name: 'Anpassung & Service', sub: 'Anpassungen und Nachjustierung im Blick' },
      { icon: '🔁', name: 'Erinnerungen & Wiederkehr', sub: 'Kontroll- und Folgetermine automatisch' },
      { icon: '🧾', name: 'Kostenvoranschlag & Abrechnung', sub: 'Angebote und Abrechnung sauber erstellt' },
    ],
    rollen: { voll: 'Inhaber, Leitung & Büro', std: 'Fachkräfte & Beratung mit Doku', self: 'Aushilfe & Empfang: Zeit & Termine' },
  },
  'Sport, Beauty & Lifestyle': {
    lager: false, kasse: true,
    spezial: [
      { icon: '📅', name: 'Termin- & Onlinebuchung', sub: 'Kunden buchen selbst, Kalender füllt sich' },
      { icon: '👥', name: 'Kundenkartei & Verlauf', sub: 'Vorlieben und Behandlungen gespeichert' },
      { icon: '🔁', name: 'Mitglieder & Abos', sub: 'Beiträge und Verträge automatisch' },
      { icon: '🎁', name: 'Gutscheine & Pakete', sub: 'Gutscheine und Pakete verkaufen & einlösen' },
      { icon: '💬', name: 'Erinnerungen & No-Show', sub: 'Weniger Ausfälle durch Erinnerungen' },
    ],
    rollen: { voll: 'Inhaber & Studioleitung', std: 'Stylisten, Trainer & Fachkräfte mit Doku', self: 'Aushilfe & Empfang: Zeit & Buchungen' },
  },
  'Tiere': {
    lager: true, kasse: true,
    spezial: [
      { icon: '🐾', name: 'Tier- & Halterakte', sub: 'Jedes Tier mit Halter und Historie' },
      { icon: '📅', name: 'Termin- & Betreuungsplan', sub: 'Termine und Betreuungszeiten planen' },
      { icon: '🔁', name: 'Pakete & Abos', sub: 'Betreuungspakete automatisch abgerechnet' },
      { icon: '🎓', name: 'Kurse & Training', sub: 'Gruppen, Anmeldungen & Termine' },
      { icon: '💬', name: 'Erinnerungen & Kommunikation', sub: 'Halter automatisch erinnern' },
    ],
    rollen: { voll: 'Inhaber, Leitung & Büro', std: 'Betreuer & Fachkräfte mit Doku', self: 'Aushilfe: Zeit & Betreuungsplan' },
  },
  'Landwirtschaft, Garten & Forst': {
    lager: true, kasse: false,
    spezial: [
      { icon: '🌱', name: 'Flächen & Kulturen', sub: 'Schläge, Flächen & Maßnahmen im Blick' },
      { icon: '🚜', name: 'Maschinen & Geräte', sub: 'Einsatz, Wartung & Kosten je Gerät' },
      { icon: '📋', name: 'Einsatz- & Auftragsplanung', sub: 'Kolonnen und Aufträge planen' },
      { icon: '🧺', name: 'Ernte & Direktvermarktung', sub: 'Vom Feld bis zur Rechnung' },
      { icon: '📆', name: 'Saison & Wiederkehr', sub: 'Pflege- und Saisonarbeiten geplant' },
    ],
    rollen: { voll: 'Betriebsleiter & Büro', std: 'Vorarbeiter & Fachkräfte mit Doku', self: 'Saisonkraft & Aushilfe: Zeit & Einsatzdoku' },
  },
  'Dienstleistungen': {
    lager: false, kasse: false,
    spezial: [
      { icon: '📆', name: 'Einsatz- & Objektplanung', sub: 'Wer ist wann bei welchem Kunden' },
      { icon: '📋', name: 'Leistungsnachweis & Doku', sub: 'Erledigt, dokumentiert, nachweisbar' },
      { icon: '🔁', name: 'Verträge & Wiederkehr', sub: 'Regelmäßige Aufträge automatisch' },
      { icon: '🧾', name: 'Aufwand & Abrechnung', sub: 'Nach Zeit, Objekt oder pauschal' },
      { icon: '👥', name: 'Personal & Schichten', sub: 'Teams passend eingeteilt' },
    ],
    rollen: { voll: 'Inhaber, GF & Disposition', std: 'Objekt- & Teamleitung mit Doku', self: 'Servicekraft & Aushilfe: Zeit & Nachweis' },
  },
  'Kultur, Soziales & Öffentliches': {
    lager: false, kasse: false,
    spezial: [
      { icon: '👥', name: 'Mitglieder & Kontakte', sub: 'Mitglieder, Ehrenamt & Förderer' },
      { icon: '🗓️', name: 'Veranstaltungen & Anmeldungen', sub: 'Events planen und Teilnehmer verwalten' },
      { icon: '💶', name: 'Beiträge & Spenden', sub: 'Beiträge, Spenden & Zuwendungsnachweise' },
      { icon: '📋', name: 'Projekte & Fördermittel', sub: 'Projekte und Mittelverwendung dokumentiert' },
      { icon: '📄', name: 'Anträge & Dokumente', sub: 'Formulare und Nachweise geordnet' },
    ],
    rollen: { voll: 'Vorstand, Leitung & Verwaltung', std: 'Mitarbeiter & Koordination mit Doku', self: 'Ehrenamt & Aushilfe: Zeit & Aufgaben' },
  },
}

// Baukasten einer Kategorie: Kern + zugeschaltete Basis, Spezial-Module, Rollen.
export function baukastenFor(kategorie: string): Baukasten {
  const c = KATEGORIE_KONFIG[kategorie]
  if (!c) {
    // Fallback: voller Basis-Stack, keine Spezial-Module.
    return { stack: [...KERN, LAGER, KASSE], spezial: [], rollen: DEFAULT_ROLLEN }
  }
  const stack = [...KERN]
  if (c.lager) stack.push(LAGER)
  if (c.kasse) stack.push(KASSE)
  return { stack, spezial: c.spezial, rollen: c.rollen }
}

// Kompatibilität (frühere Signaturen) — falls noch irgendwo importiert.
export function zusatzBausteineFor(kategorie: string): Baustein[] { return baukastenFor(kategorie).spezial }
export function nutzerRollenFor(kategorie: string): Rollen { return baukastenFor(kategorie).rollen }
