// update-branchen-komplett.js
// Fuegt alle neuen Branchen zu app/lib/branchen.ts hinzu
// node update-branchen-komplett.js

const fs = require('fs');
const path = require('path');

const NEUE_BRANCHEN = [
  // ── LEBENSMITTEL & NAHVERSORGUNG
  {
    name: 'Bäckereien',
    slug: 'baeckereien',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Bäckereien: Bestellmanagement, Personalplanung und Kundenkommunikation ohne Mehraufwand.',
    schmerzen: ['Manuelle Bestellverwaltung & Lieferantenkommunikation', 'Aufwendige Personalplanung für Frühschichten', 'Hoher Verwaltungsaufwand bei Abrechnung', 'Kundenbindung ohne digitale Tools'],
    ergebnisse: ['30% weniger Verwaltungsaufwand', 'Automatische Bestellbenachrichtigungen', 'Digitale Personalplanung', 'Mehr Stammkunden durch automatisierte Kommunikation'],
    agenten: ['Der Buchhalter','Der Einkäufer','Der Empfänger','Der Planer','Der Schreiber','Der Wächter','Der Verkäufer','Der Personalchef','Der Assistent','Der Moderator','Der Analyst','Der Schmied','Der Regisseur','Der Techniker','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Einkäufer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Metzgereien',
    slug: 'metzgereien',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Metzgereien: Warenwirtschaft, Hygienedokumentation und Kundenkommunikation effizient gestalten.',
    schmerzen: ['Aufwendige Hygiene- und HACCP-Dokumentation', 'Manuelle Warenwirtschaft & Bestellungen', 'Hoher Abrechnungsaufwand', 'Personalplanung für Früh- und Spätschichten'],
    ergebnisse: ['Automatische Hygienedokumentation', '40% weniger Verwaltungszeit', 'Digitale Warenwirtschaft', 'Effiziente Personalplanung'],
    agenten: ['Der Wächter','Der Buchhalter','Der Einkäufer','Der Planer','Der Empfänger','Der Personalchef','Der Schreiber','Der Assistent','Der Analyst','Der Techniker','Der Schmied','Der Moderator','Der Regisseur','Der Verkäufer','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Buchhalter','Der Einkäufer'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Weingüter',
    slug: 'weingueter',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Weingüter: Weinbau-Dokumentation, Direktvertrieb und Kundenkommunikation ohne Mehraufwand.',
    schmerzen: ['Aufwendige Weinbau- und Kellerdokumentation', 'Manueller Direktvertrieb & Versand', 'Zeitintensive Kundenkommunikation', 'Verwaltung von Weinproben & Events'],
    ergebnisse: ['Digitale Kellerbuchhaltung', 'Automatisierter Onlineversand', '50% weniger Verwaltungsaufwand', 'Mehr Direktkunden durch automatisierte Kommunikation'],
    agenten: ['Der Buchhalter','Der Einkäufer','Der Verkäufer','Der Planer','Der Schreiber','Der Wächter','Der Analyst','Der Empfänger','Der Regisseur','Der Assistent','Der Moderator','Der Personalchef','Der Forscher','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Einkäufer','Der Verkäufer'],
    stundenProWoche: { klein: 8, mittel: 14, gross: 20 }
  },
  {
    name: 'Brennereien & Destillerien',
    slug: 'brennereien-destillerien',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Brennereien: Produktionsdokumentation, Zollabwicklung und Vertriebsmanagement.',
    schmerzen: ['Aufwendige Zoll- und Steuerdokumentation', 'Manuelle Produktionsprotokollierung', 'Zeitintensiver Direktvertrieb', 'Komplexe Lizenz- und Genehmigungsverwaltung'],
    ergebnisse: ['Automatische Zolldokumentation', 'Digitale Produktionsprotokolle', '40% weniger Verwaltungszeit', 'Effizienterer Direktvertrieb'],
    agenten: ['Der Wächter','Der Buchhalter','Der Einkäufer','Der Jurist','Der Planer','Der Schreiber','Der Analyst','Der Verkäufer','Der Assistent','Der Empfänger','Der Techniker','Der Personalchef','Der Moderator','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Integrator','Der Schmied','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Buchhalter','Der Jurist'],
    stundenProWoche: { klein: 9, mittel: 15, gross: 22 }
  },
  {
    name: 'Eisdielen & Cafés',
    slug: 'eisdielen-cafes',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Eisdielen und Cafés: Bestellmanagement, Social Media und Kundenbindung ohne Mehraufwand.',
    schmerzen: ['Aufwendige Social-Media-Pflege', 'Manuelle Reservierungs- und Bestellverwaltung', 'Hoher Personalaufwand in Stoßzeiten', 'Fehlende Kundenbindungstools'],
    ergebnisse: ['Automatisiertes Social Media', '30% weniger Verwaltungsaufwand', 'Digitales Reservierungssystem', 'Mehr Stammkunden durch Loyalty-Automatisierung'],
    agenten: ['Der Empfänger','Der Schreiber','Der Buchhalter','Der Regisseur','Der Planer','Der Moderator','Der Verkäufer','Der Wächter','Der Assistent','Der Personalchef','Der Analyst','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Schreiber','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Delikatessen & Feinkost',
    slug: 'delikatessen-feinkost',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Feinkostläden: Warenwirtschaft, Kundenkommunikation und Onlineverkauf effizient gestalten.',
    schmerzen: ['Aufwendige Warenwirtschaft mit vielen Lieferanten', 'Manuelle Kundenkommunikation', 'Zeitintensiver Onlineshop-Betrieb', 'Fehlende Stammkundenpflege'],
    ergebnisse: ['Automatische Lieferantenbestellungen', '35% weniger Verwaltungsaufwand', 'Automatisierter Onlineshop', 'Mehr Stammkunden durch digitale Kommunikation'],
    agenten: ['Der Einkäufer','Der Buchhalter','Der Verkäufer','Der Empfänger','Der Schreiber','Der Wächter','Der Planer','Der Analyst','Der Assistent','Der Moderator','Der Regisseur','Der Personalchef','Der Forscher','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Einkäufer','Der Buchhalter','Der Verkäufer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Bio- & Naturkostläden',
    slug: 'bio-naturkostlaeden',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Bio-Läden: Warenwirtschaft, Zertifizierungsdokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Bio-Zertifizierungsdokumentation', 'Viele kleine Lieferanten verwalten', 'Zeitintensive Kundenkommunikation', 'Manuelle Warenwirtschaft'],
    ergebnisse: ['Automatische Zertifizierungsdokumentation', '40% weniger Verwaltungszeit', 'Digitale Lieferantenverwaltung', 'Mehr Stammkunden durch Newsletter-Automatisierung'],
    agenten: ['Der Wächter','Der Einkäufer','Der Buchhalter','Der Empfänger','Der Schreiber','Der Planer','Der Analyst','Der Verkäufer','Der Assistent','Der Moderator','Der Personalchef','Der Techniker','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Einkäufer','Der Buchhalter'],
    stundenProWoche: { klein: 6, mittel: 11, gross: 17 }
  },
  {
    name: 'Getränkehandel',
    slug: 'getraenkehandel',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Getränkehändler: Logistik, Bestellmanagement und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Lager- und Tourenplanung', 'Manuelle Bestellverwaltung', 'Hoher Abrechnungsaufwand', 'Pfandverwaltung & Retouren'],
    ergebnisse: ['Automatische Tourenplanung', '35% weniger Verwaltungsaufwand', 'Digitale Bestellabwicklung', 'Effiziente Pfandverwaltung'],
    agenten: ['Der Planer','Der Buchhalter','Der Einkäufer','Der Empfänger','Der Wächter','Der Verkäufer','Der Schmied','Der Techniker','Der Assistent','Der Analyst','Der Personalchef','Der Schreiber','Der Regisseur','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Planer','Der Buchhalter','Der Einkäufer'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Fischhändler',
    slug: 'fischhaendler',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Fischhändler: Frischelogistik, Dokumentation und Kundenkommunikation ohne Mehraufwand.',
    schmerzen: ['Zeitkritische Frischelogistik', 'Aufwendige Hygienedokumentation', 'Manuelle Bestellverwaltung', 'Hoher Personalaufwand'],
    ergebnisse: ['Automatische Lieferantenbestellungen', 'Digitale Hygienedokumentation', '30% weniger Verwaltungszeit', 'Effizientere Personalplanung'],
    agenten: ['Der Wächter','Der Einkäufer','Der Buchhalter','Der Planer','Der Empfänger','Der Personalchef','Der Schreiber','Der Analyst','Der Assistent','Der Techniker','Der Schmied','Der Moderator','Der Regisseur','Der Verkäufer','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Einkäufer','Der Buchhalter'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Süßwarenhandel',
    slug: 'suesswarenhandel',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Süßwarenhändler: Warenwirtschaft, Saisonplanung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Saisonplanung & Lagerhaltung', 'Manuelle Bestellverwaltung', 'Zeitintensiver Onlineshop', 'Fehlende Stammkundenpflege'],
    ergebnisse: ['Automatische Saisonbestellungen', '30% weniger Verwaltungsaufwand', 'Digitaler Onlineshop', 'Mehr Umsatz durch Stammkundenprogramm'],
    agenten: ['Der Einkäufer','Der Buchhalter','Der Verkäufer','Der Planer','Der Empfänger','Der Schreiber','Der Wächter','Der Analyst','Der Assistent','Der Moderator','Der Regisseur','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Einkäufer','Der Buchhalter','Der Verkäufer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },

  // ── HANDWERK (LÜCKEN)
  {
    name: 'Dachdecker',
    slug: 'dachdecker',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Dachdeckerbetriebe: Angebotserstellung, Materialplanung und Kundenkommunikation ohne Mehraufwand.',
    schmerzen: ['Aufwendige Angebotserstellung & Kalkulation', 'Manuelle Materialbestellung', 'Zeitintensive Kundenkommunikation', 'Baustellen-Koordination per Hand'],
    ergebnisse: ['Automatische Angebotserstellung', '40% weniger Verwaltungszeit', 'Digitale Materialplanung', 'Effiziente Baustellenkoordination'],
    agenten: ['Der Planer','Der Buchhalter','Der Einkäufer','Der Wächter','Der Schreiber','Der Verkäufer','Der Techniker','Der Schmied','Der Assistent','Der Empfänger','Der Personalchef','Der Analyst','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Bodenleger & Raumausstatter',
    slug: 'bodenleger-raumausstatter',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Bodenleger: Angebotserstellung, Materialplanung und Auftragsabwicklung automatisieren.',
    schmerzen: ['Aufwendige Aufmaß- und Angebotserstellung', 'Manuelle Materialbestellung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Materialplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Buchhalter','Der Planer','Der Einkäufer','Der Schreiber','Der Wächter','Der Verkäufer','Der Schmied','Der Techniker','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Kaminkehrer & Schornsteinfeger',
    slug: 'kaminkehrer',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Schornsteinfeger: Terminplanung, Messprotokolle und Kundenkommunikation ohne Mehraufwand.',
    schmerzen: ['Aufwendige Jahres-Terminplanung', 'Manuelle Messprotokoll-Erstellung', 'Zeitintensive Kundenkommunikation', 'Hoher Dokumentationsaufwand'],
    ergebnisse: ['Automatische Terminplanung', 'Digitale Messprotokolle', '50% weniger Verwaltungszeit', 'Automatische Kundenerinnerungen'],
    agenten: ['Der Planer','Der Wächter','Der Buchhalter','Der Schreiber','Der Empfänger','Der Techniker','Der Analyst','Der Assistent','Der Schmied','Der Personalchef','Der Moderator','Der Regisseur','Der Verkäufer','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Planer','Der Wächter','Der Buchhalter'],
    stundenProWoche: { klein: 8, mittel: 14, gross: 20 }
  },
  {
    name: 'Glaserei',
    slug: 'glaserei',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Glasereibetriebe: Angebotserstellung, Materialplanung und Auftragsabwicklung effizient gestalten.',
    schmerzen: ['Aufwendige Aufmaß- und Angebotserstellung', 'Manuelle Glasbestellung', 'Zeitintensive Kundenkommunikation', 'Notruf-Koordination außerhalb der Öffnungszeiten'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Materialplanung', 'Automatisierter Notrufdienst'],
    agenten: ['Der Buchhalter','Der Planer','Der Einkäufer','Der Empfänger','Der Wächter','Der Schreiber','Der Verkäufer','Der Techniker','Der Assistent','Der Analyst','Der Schmied','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Zahntechniker',
    slug: 'zahntechniker',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Zahntechnik-Labore: Auftragsmanagement, Dokumentation und Kommunikation mit Zahnarztpraxen.',
    schmerzen: ['Aufwendige Auftragsverwaltung', 'Manuelle Dokumentation & Protokollierung', 'Zeitintensive Kommunikation mit Praxen', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Auftragsverwaltung', '40% weniger Verwaltungszeit', 'Digitale Labordokumentation', 'Schnellere Abrechnung mit Praxen'],
    agenten: ['Der Wächter','Der Buchhalter','Der Empfänger','Der Planer','Der Schreiber','Der Techniker','Der Analyst','Der Assistent','Der Schmied','Der Personalchef','Der Moderator','Der Einkäufer','Der Regisseur','Der Verkäufer','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Buchhalter','Der Empfänger'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Orthopädie-Schuhmacher',
    slug: 'orthopaedie-schuhmacher',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für orthopädische Schuhmacher: Auftragsmanagement, Krankenkassenabrechnung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Krankenkassenabrechnung', 'Manuelle Auftragsverwaltung', 'Zeitintensive Kundenkommunikation', 'Hoher Dokumentationsaufwand'],
    ergebnisse: ['Automatische Krankenkassenabrechnung', '45% weniger Verwaltungszeit', 'Digitale Auftragsverwaltung', 'Automatische Kundenerinnerungen'],
    agenten: ['Der Buchhalter','Der Wächter','Der Empfänger','Der Planer','Der Schreiber','Der Analyst','Der Assistent','Der Techniker','Der Personalchef','Der Schmied','Der Moderator','Der Einkäufer','Der Regisseur','Der Verkäufer','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Wächter'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 15 }
  },
  {
    name: 'Uhrmacher & Juweliere',
    slug: 'uhrmacher-juweliere',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Uhrmacher und Juweliere: Reparaturverwaltung, Kundenkommunikation und Warenwirtschaft.',
    schmerzen: ['Aufwendige Reparaturverwaltung', 'Manuelle Kundenkommunikation', 'Zeitintensive Warenwirtschaft', 'Fehlende digitale Präsenz'],
    ergebnisse: ['Automatische Reparaturstatusbenachrichtigung', '35% weniger Verwaltungszeit', 'Digitale Warenwirtschaft', 'Mehr Kunden durch digitales Marketing'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Einkäufer','Der Schreiber','Der Wächter','Der Planer','Der Verkäufer','Der Assistent','Der Analyst','Der Techniker','Der Moderator','Der Regisseur','Der Personalchef','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 8, gross: 13 }
  },
  {
    name: 'Schlosserei',
    slug: 'schlosserei',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Schlossereien: Auftragsmanagement, Materialplanung und Kundenkommunikation ohne Mehraufwand.',
    schmerzen: ['Aufwendige Angebotserstellung', 'Manuelle Materialbestellung', 'Zeitintensive Auftragsabwicklung', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Materialplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Buchhalter','Der Einkäufer','Der Planer','Der Wächter','Der Techniker','Der Schmied','Der Schreiber','Der Verkäufer','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Einkäufer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Schweißerei',
    slug: 'schweisserei',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Schweißbetriebe: Auftragsmanagement, Zertifizierungsdokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Schweißnaht-Dokumentation', 'Manuelle Auftragsabwicklung', 'Zeitintensive Angebotserstellung', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Digitale Schweißdokumentation', '35% weniger Verwaltungszeit', 'Automatische Angebotserstellung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Wächter','Der Buchhalter','Der Einkäufer','Der Planer','Der Techniker','Der Schmied','Der Schreiber','Der Verkäufer','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Buchhalter'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 15 }
  },
  {
    name: 'Haustechnik & Gebäudeautomation',
    slug: 'haustechnik-gebaeudeautomation',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Haustechnik-Betriebe: Wartungsmanagement, Dokumentation und Kundenkommunikation effizient gestalten.',
    schmerzen: ['Aufwendige Wartungsplanung & -dokumentation', 'Manuelle Auftragsabwicklung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Wartungsplanung', '40% weniger Verwaltungszeit', 'Digitale Dokumentation', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Techniker','Der Planer','Der Buchhalter','Der Wächter','Der Schmied','Der Einkäufer','Der Schreiber','Der Empfänger','Der Assistent','Der Verkäufer','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Techniker','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Rollladen & Sonnenschutz',
    slug: 'rollladen-sonnenschutz',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Rollladen- und Sonnenschutzbetriebe: Angebotserstellung, Montageplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Aufmaß- und Angebotserstellung', 'Manuelle Montageterminplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Montageplanung', 'Automatische Kundenbenachrichtigungen'],
    agenten: ['Der Buchhalter','Der Planer','Der Einkäufer','Der Schreiber','Der Wächter','Der Verkäufer','Der Techniker','Der Assistent','Der Empfänger','Der Analyst','Der Schmied','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Trockenbau & Innenausbau',
    slug: 'trockenbau-innenausbau',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Trockenbau-Betriebe: Angebotserstellung, Materialplanung und Auftragsabwicklung automatisieren.',
    schmerzen: ['Aufwendige Aufmaß- und Angebotserstellung', 'Manuelle Materialbestellung', 'Zeitintensive Baustellenkoordination', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Materialplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Buchhalter','Der Planer','Der Einkäufer','Der Wächter','Der Schreiber','Der Verkäufer','Der Techniker','Der Schmied','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Estrich & Fliesen',
    slug: 'estrich-fliesen',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Estrich- und Fliesenleger: Angebotserstellung, Materialplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Aufmaß- und Angebotserstellung', 'Manuelle Materialbestellung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Materialplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Buchhalter','Der Planer','Der Einkäufer','Der Wächter','Der Schreiber','Der Verkäufer','Der Techniker','Der Schmied','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Gerüstbau',
    slug: 'geruestbau',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Gerüstbaubetriebe: Auftragsmanagement, Sicherheitsdokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Sicherheits- und Prüfdokumentation', 'Manuelle Auftragsplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Digitale Sicherheitsdokumentation', '40% weniger Verwaltungszeit', 'Automatische Auftragsplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Wächter','Der Planer','Der Buchhalter','Der Einkäufer','Der Techniker','Der Schmied','Der Schreiber','Der Verkäufer','Der Assistent','Der Empfänger','Der Personalchef','Der Analyst','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Baggerbetriebe & Erdbau',
    slug: 'baggerbetriebe-erdbau',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Erdbau-Betriebe: Auftragsmanagement, Maschinendokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Maschinenwartungsdokumentation', 'Manuelle Auftragsabwicklung', 'Zeitintensive Angebotserstellung', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Digitale Maschinendokumentation', '35% weniger Verwaltungszeit', 'Automatische Angebotserstellung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Techniker','Der Planer','Der Buchhalter','Der Wächter','Der Einkäufer','Der Schmied','Der Schreiber','Der Verkäufer','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Techniker','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Kälte- & Klimaanlagenbau',
    slug: 'kaelteanlagenbau',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Kälte- und Klimatechnik-Betriebe: Wartungsmanagement, Dokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Wartungsdokumentation', 'Manuelle Auftragsplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Wartungsplanung', '40% weniger Verwaltungszeit', 'Digitale Dokumentation', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Techniker','Der Planer','Der Buchhalter','Der Wächter','Der Schmied','Der Einkäufer','Der Schreiber','Der Empfänger','Der Assistent','Der Verkäufer','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Techniker','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },

  // ── KFZ & MOBILITÄT
  {
    name: 'Autowäsche & Autopflege',
    slug: 'autowaesche-autopflege',
    kategorie: 'KFZ & Mobilität',
    beschreibung: 'KI-Automatisierung für Autowaschanlagen und Autopflege: Terminmanagement, Kundenbindung und Abrechnung automatisieren.',
    schmerzen: ['Aufwendiges Terminmanagement', 'Fehlende Kundenbindungstools', 'Manuelle Abrechnung', 'Hoher Personalaufwand in Stoßzeiten'],
    ergebnisse: ['Automatisches Terminmanagement', 'Mehr Stammkunden durch Loyalty-Programm', '30% weniger Verwaltungszeit', 'Effizientere Personalplanung'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Verkäufer','Der Schreiber','Der Moderator','Der Wächter','Der Assistent','Der Analyst','Der Regisseur','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Reifenhandel',
    slug: 'reifenhandel',
    kategorie: 'KFZ & Mobilität',
    beschreibung: 'KI-Automatisierung für Reifenhändler: Saisongeschäft, Einlagerungsmanagement und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendiges Saisongeschäft & Einlagerungsverwaltung', 'Manuelle Terminplanung für Reifenwechsel', 'Hoher Verwaltungsaufwand in Stoßzeiten', 'Fehlende Kundenbindungstools'],
    ergebnisse: ['Automatische Saison-Terminplanung', '40% weniger Verwaltungszeit', 'Digitale Einlagerungsverwaltung', 'Mehr Stammkunden durch automatisierte Erinnerungen'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Einkäufer','Der Wächter','Der Schreiber','Der Verkäufer','Der Techniker','Der Assistent','Der Analyst','Der Personalchef','Der Moderator','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 6, mittel: 11, gross: 17 }
  },
  {
    name: 'Motorradwerkstatt',
    slug: 'motorradwerkstatt',
    kategorie: 'KFZ & Mobilität',
    beschreibung: 'KI-Automatisierung für Motorradwerkstätten: Werkstattmanagement, Teilebeschaffung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Werkstattplanung', 'Manuelle Teilebeschaffung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Werkstattplanung', '35% weniger Verwaltungszeit', 'Digitale Teilebeschaffung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Techniker','Der Buchhalter','Der Einkäufer','Der Planer','Der Wächter','Der Empfänger','Der Schreiber','Der Verkäufer','Der Assistent','Der Analyst','Der Schmied','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Techniker','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Fahrradhandel & Werkstatt',
    slug: 'fahrradhandel-werkstatt',
    kategorie: 'KFZ & Mobilität',
    beschreibung: 'KI-Automatisierung für Fahrradhändler: Werkstattmanagement, Warenwirtschaft und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Werkstattplanung in der Saison', 'Manuelle Warenwirtschaft', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Werkstattplanung', '30% weniger Verwaltungszeit', 'Digitale Warenwirtschaft', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Techniker','Der Empfänger','Der Buchhalter','Der Einkäufer','Der Planer','Der Wächter','Der Schreiber','Der Verkäufer','Der Assistent','Der Analyst','Der Moderator','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Techniker','Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Caravan & Wohnmobil',
    slug: 'caravan-wohnmobil',
    kategorie: 'KFZ & Mobilität',
    beschreibung: 'KI-Automatisierung für Caravan-Händler: Verkauf, Vermietung, Wartung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Vermietungsverwaltung', 'Manuelle Wartungsplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Vermietungsverwaltung', '35% weniger Verwaltungszeit', 'Digitale Wartungsplanung', 'Mehr Buchungen durch automatisiertes Marketing'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Verkäufer','Der Wächter','Der Schreiber','Der Techniker','Der Assistent','Der Einkäufer','Der Analyst','Der Moderator','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },

  // ── GESUNDHEIT & PFLEGE (LÜCKEN)
  {
    name: 'Ergotherapie',
    slug: 'ergotherapie',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Ergotherapie-Praxen: Terminmanagement, Krankenkassenabrechnung und Dokumentation.',
    schmerzen: ['Aufwendige Krankenkassenabrechnung', 'Manuelle Terminverwaltung', 'Zeitintensive Dokumentation', 'Überlastetes Praxispersonal'],
    ergebnisse: ['Automatische Krankenkassenabrechnung', '40% weniger Verwaltungszeit', 'Digitale Patientendokumentation', 'Entspannteres Praxispersonal'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Wächter','Der Schreiber','Der Assistent','Der Personalchef','Der Analyst','Der Techniker','Der Schmied','Der Moderator','Der Regisseur','Der Verkäufer','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Logopädie',
    slug: 'logopaedie',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Logopädie-Praxen: Terminmanagement, Abrechnung und Patientenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Krankenkassenabrechnung', 'Manuelle Terminverwaltung', 'Zeitintensive Dokumentation', 'Überlastetes Praxispersonal'],
    ergebnisse: ['Automatische Krankenkassenabrechnung', '40% weniger Verwaltungszeit', 'Digitale Patientendokumentation', 'Mehr Zeit für die Therapie'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Wächter','Der Schreiber','Der Assistent','Der Analyst','Der Techniker','Der Personalchef','Der Schmied','Der Moderator','Der Regisseur','Der Verkäufer','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 15 }
  },
  {
    name: 'Hebammen',
    slug: 'hebammen',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Hebammen-Praxen: Terminmanagement, Abrechnung und Dokumentation ohne Mehraufwand.',
    schmerzen: ['Aufwendige Krankenkassenabrechnung', 'Manuelle Terminverwaltung', 'Zeitintensive Dokumentation', 'Verwaltungsaufwand neben der Betreuungsarbeit'],
    ergebnisse: ['Automatische Krankenkassenabrechnung', '45% weniger Verwaltungszeit', 'Digitale Patientendokumentation', 'Mehr Zeit für die Betreuung'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Wächter','Der Schreiber','Der Assistent','Der Analyst','Der Techniker','Der Personalchef','Der Moderator','Der Schmied','Der Regisseur','Der Verkäufer','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Sanitätshaus',
    slug: 'sanitaetshaus',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Sanitätshäuser: Hilfsmittelabrechnung, Krankenkassenkommunikation und Kundenverwaltung.',
    schmerzen: ['Aufwendige Krankenkassenabrechnung für Hilfsmittel', 'Manuelle Bestellverwaltung', 'Zeitintensive Kundenkommunikation', 'Hoher Dokumentationsaufwand'],
    ergebnisse: ['Automatische Krankenkassenabrechnung', '40% weniger Verwaltungszeit', 'Digitale Bestellverwaltung', 'Schnellere Hilfsmittelversorgung'],
    agenten: ['Der Buchhalter','Der Wächter','Der Empfänger','Der Einkäufer','Der Planer','Der Schreiber','Der Assistent','Der Analyst','Der Techniker','Der Personalchef','Der Schmied','Der Moderator','Der Regisseur','Der Verkäufer','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Wächter','Der Einkäufer'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Podologie & Fußpflege',
    slug: 'podologie-fusspflege',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Podologie-Praxen: Terminmanagement, Abrechnung und Patientenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Terminverwaltung', 'Manuelle Abrechnung', 'Zeitintensive Patientenkommunikation', 'Fehlende Erinnerungssysteme'],
    ergebnisse: ['Automatisches Terminmanagement', '35% weniger Verwaltungszeit', 'Digitale Abrechnung', 'Weniger No-Shows durch Erinnerungen'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Wächter','Der Assistent','Der Analyst','Der Moderator','Der Personalchef','Der Techniker','Der Verkäufer','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Massagepraxen',
    slug: 'massagepraxen',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Massagepraxen: Terminmanagement, Abrechnung und Kundenbindung ohne Mehraufwand.',
    schmerzen: ['Aufwendiges Terminmanagement', 'Manuelle Abrechnung', 'Fehlende Kundenbindungstools', 'Zeitintensive Kommunikation'],
    ergebnisse: ['Automatisches Terminmanagement', '30% weniger Verwaltungszeit', 'Mehr Stammkunden durch Loyalty-Automatisierung', 'Schnellere Abrechnung'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Verkäufer','Der Moderator','Der Wächter','Der Assistent','Der Analyst','Der Regisseur','Der Personalchef','Der Trainer','Der Forscher','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Osteopathie & Chiropraktik',
    slug: 'osteopathie-chiropraktik',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Osteopathie-Praxen: Terminmanagement, Dokumentation und Patientenkommunikation.',
    schmerzen: ['Aufwendige Terminverwaltung', 'Manuelle Patientendokumentation', 'Zeitintensive Abrechnung', 'Überlastetes Praxispersonal'],
    ergebnisse: ['Automatisches Terminmanagement', '40% weniger Verwaltungszeit', 'Digitale Patientendokumentation', 'Mehr Zeit für die Therapie'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Wächter','Der Schreiber','Der Assistent','Der Analyst','Der Techniker','Der Personalchef','Der Moderator','Der Schmied','Der Regisseur','Der Verkäufer','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Ernährungsberatung',
    slug: 'ernaehrungsberatung',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Ernährungsberater: Terminmanagement, Dokumentation und Patientenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Dokumentation & Ernährungspläne', 'Manuelle Terminverwaltung', 'Zeitintensive Patientenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Ernährungsplan-Erstellung', '35% weniger Verwaltungszeit', 'Digitale Patientendokumentation', 'Mehr Zeit für die Beratung'],
    agenten: ['Der Empfänger','Der Schreiber','Der Planer','Der Buchhalter','Der Wächter','Der Assistent','Der Analyst','Der Moderator','Der Personalchef','Der Techniker','Der Trainer','Der Regisseur','Der Forscher','Der Verkäufer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Schreiber','Der Planer'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },

  // ── TIERE & NATUR
  {
    name: 'Tierbetreuung & Hundesalon',
    slug: 'tierbetreuung-hundesalon',
    kategorie: 'Tiere & Natur',
    beschreibung: 'KI-Automatisierung für Tierbetreuung und Hundesalons: Terminmanagement, Kundenkommunikation und Abrechnung automatisieren.',
    schmerzen: ['Aufwendiges Terminmanagement', 'Manuelle Kundenkommunikation', 'Zeitintensive Abrechnung', 'Fehlende Kundenbindungstools'],
    ergebnisse: ['Automatisches Terminmanagement', '30% weniger Verwaltungszeit', 'Mehr Stammkunden durch Loyalty-Automatisierung', 'Schnellere Abrechnung'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Verkäufer','Der Moderator','Der Wächter','Der Assistent','Der Analyst','Der Personalchef','Der Regisseur','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Tierhandlungen',
    slug: 'tierhandlungen',
    kategorie: 'Tiere & Natur',
    beschreibung: 'KI-Automatisierung für Tierhandlungen: Warenwirtschaft, Kundenkommunikation und Beratung automatisieren.',
    schmerzen: ['Aufwendige Warenwirtschaft', 'Manuelle Bestellverwaltung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Digitale Warenwirtschaft', '30% weniger Verwaltungszeit', 'Automatische Bestellungen', 'Mehr Stammkunden durch Newsletter'],
    agenten: ['Der Einkäufer','Der Buchhalter','Der Empfänger','Der Verkäufer','Der Wächter','Der Schreiber','Der Planer','Der Assistent','Der Analyst','Der Moderator','Der Techniker','Der Regisseur','Der Personalchef','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Einkäufer','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 12 }
  },
  {
    name: 'Reiterhöfe',
    slug: 'reithoefe',
    kategorie: 'Tiere & Natur',
    beschreibung: 'KI-Automatisierung für Reiterhöfe: Stallverwaltung, Kursbuchung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Stallverwaltung & Boxenbelegung', 'Manuelle Kursbuchungsverwaltung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Digitale Stallverwaltung', '35% weniger Verwaltungszeit', 'Automatische Kursbuchung', 'Schnellere Abrechnung'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Schreiber','Der Wächter','Der Personalchef','Der Moderator','Der Assistent','Der Analyst','Der Einkäufer','Der Regisseur','Der Techniker','Der Forscher','Der Trainer','Der Verkäufer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Schädlingsbekämpfung',
    slug: 'schaedlingsbekaempfung',
    kategorie: 'Tiere & Natur',
    beschreibung: 'KI-Automatisierung für Schädlingsbekämpfer: Auftragsmanagement, Dokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Behandlungsdokumentation', 'Manuelle Auftragsplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Behandlungsdokumentation', '35% weniger Verwaltungszeit', 'Digitale Auftragsplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Wächter','Der Planer','Der Buchhalter','Der Empfänger','Der Techniker','Der Schmied','Der Schreiber','Der Analyst','Der Assistent','Der Personalchef','Der Regisseur','Der Verkäufer','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Imkereien',
    slug: 'imkereien',
    kategorie: 'Tiere & Natur',
    beschreibung: 'KI-Automatisierung für Imkereien: Produktverwaltung, Direktvertrieb und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendiger Direktvertrieb & Versand', 'Manuelle Produktionsdokumentation', 'Zeitintensive Kundenkommunikation', 'Fehlende Online-Präsenz'],
    ergebnisse: ['Automatisierter Onlinevertrieb', '30% weniger Verwaltungszeit', 'Digitale Produktionsdokumentation', 'Mehr Kunden durch digitales Marketing'],
    agenten: ['Der Buchhalter','Der Verkäufer','Der Schreiber','Der Empfänger','Der Planer','Der Wächter','Der Analyst','Der Assistent','Der Moderator','Der Regisseur','Der Einkäufer','Der Personalchef','Der Forscher','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Verkäufer'],
    stundenProWoche: { klein: 3, mittel: 6, gross: 10 }
  },

  // ── BEAUTY & LIFESTYLE
  {
    name: 'Nähateliers & Schneider',
    slug: 'naehateliers-schneider',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Nähateliers: Auftragsmanagement, Kundenkommunikation und Abrechnung automatisieren.',
    schmerzen: ['Aufwendige Auftragsverwaltung', 'Manuelle Terminplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Auftragsverwaltung', '30% weniger Verwaltungszeit', 'Digitale Terminplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Wächter','Der Verkäufer','Der Assistent','Der Moderator','Der Analyst','Der Regisseur','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Wäschereien & Reinigungen',
    slug: 'waeschereien-reinigungen',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Wäschereien: Auftragsmanagement, Kundenkommunikation und Abrechnung ohne Mehraufwand.',
    schmerzen: ['Aufwendige Auftragsabwicklung', 'Manuelle Kundenkommunikation', 'Zeitintensive Abrechnung', 'Hoher Personalaufwand'],
    ergebnisse: ['Automatische Auftragsabwicklung', '35% weniger Verwaltungszeit', 'Digitale Kundenkommunikation', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Wächter','Der Schreiber','Der Personalchef','Der Verkäufer','Der Assistent','Der Analyst','Der Techniker','Der Moderator','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 12 }
  },
  {
    name: 'Brautmoden',
    slug: 'brautmoden',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Brautmodengeschäfte: Terminmanagement, Kundenkommunikation und Auftragsabwicklung.',
    schmerzen: ['Aufwendige Terminplanung für Anproben', 'Manuelle Auftragsabwicklung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatisches Terminmanagement', '30% weniger Verwaltungszeit', 'Digitale Auftragsabwicklung', 'Mehr Empfehlungen durch automatisierte Kommunikation'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Schreiber','Der Verkäufer','Der Moderator','Der Wächter','Der Assistent','Der Regisseur','Der Analyst','Der Personalchef','Der Forscher','Der Trainer','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Yogastudios',
    slug: 'yogastudios',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Yogastudios: Kursbuchung, Mitgliederverwaltung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Kursbuchungsverwaltung', 'Manuelle Mitgliederverwaltung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Kursbuchung', '35% weniger Verwaltungszeit', 'Digitale Mitgliederverwaltung', 'Mehr Mitglieder durch automatisiertes Marketing'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Moderator','Der Verkäufer','Der Wächter','Der Assistent','Der Analyst','Der Regisseur','Der Personalchef','Der Trainer','Der Forscher','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter','Der Moderator'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 12 }
  },
  {
    name: 'Pilatesstudios',
    slug: 'pilatesstudios',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Pilatesstudios: Kursbuchung, Mitgliederverwaltung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Kursbuchungsverwaltung', 'Manuelle Mitgliederverwaltung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Kursbuchung', '35% weniger Verwaltungszeit', 'Digitale Mitgliederverwaltung', 'Mehr Mitglieder durch automatisiertes Marketing'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Moderator','Der Verkäufer','Der Wächter','Der Assistent','Der Analyst','Der Regisseur','Der Personalchef','Der Trainer','Der Forscher','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter','Der Moderator'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 12 }
  },
  {
    name: 'Kampfsportschulen',
    slug: 'kampfsportschulen',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Kampfsportschulen: Kursbuchung, Mitgliederverwaltung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Kursbuchungsverwaltung', 'Manuelle Mitgliederverwaltung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Kursbuchung', '30% weniger Verwaltungszeit', 'Digitale Mitgliederverwaltung', 'Mehr Mitglieder durch automatisiertes Marketing'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Moderator','Der Verkäufer','Der Wächter','Der Assistent','Der Analyst','Der Regisseur','Der Personalchef','Der Trainer','Der Forscher','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Tanzschulen',
    slug: 'tanzschulen',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Tanzschulen: Kursbuchung, Mitgliederverwaltung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Kursbuchungsverwaltung', 'Manuelle Mitgliederverwaltung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Kursbuchung', '35% weniger Verwaltungszeit', 'Digitale Mitgliederverwaltung', 'Mehr Anmeldungen durch automatisiertes Marketing'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Moderator','Der Verkäufer','Der Wächter','Der Assistent','Der Regisseur','Der Analyst','Der Personalchef','Der Trainer','Der Forscher','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter','Der Moderator'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 12 }
  },

  // ── DIENSTLEISTUNG LOKAL
  {
    name: 'Hausmeisterservice',
    slug: 'hausmeisterservice',
    kategorie: 'Dienstleistungen',
    beschreibung: 'KI-Automatisierung für Hausmeisterdienste: Auftragsmanagement, Terminplanung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Auftragsplanung', 'Manuelle Kundenkommunikation', 'Zeitintensive Abrechnung', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Auftragsplanung', '35% weniger Verwaltungszeit', 'Digitale Kundenkommunikation', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Planer','Der Buchhalter','Der Empfänger','Der Wächter','Der Techniker','Der Schreiber','Der Personalchef','Der Assistent','Der Analyst','Der Schmied','Der Verkäufer','Der Regisseur','Der Moderator','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Schlüsseldienst',
    slug: 'schluesseldienst',
    kategorie: 'Dienstleistungen',
    beschreibung: 'KI-Automatisierung für Schlüsseldienste: Auftragsmanagement, Notrufdienst-Koordination und Abrechnung.',
    schmerzen: ['Aufwendige Notrufdienst-Koordination', 'Manuelle Auftragsabwicklung', 'Zeitintensive Abrechnung', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Notrufdienst-Weiterleitung', '35% weniger Verwaltungszeit', 'Digitale Auftragsabwicklung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Wächter','Der Techniker','Der Schreiber','Der Assistent','Der Analyst','Der Personalchef','Der Verkäufer','Der Moderator','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 12 }
  },
  {
    name: 'Umzugsunternehmen',
    slug: 'umzugsunternehmen',
    kategorie: 'Dienstleistungen',
    beschreibung: 'KI-Automatisierung für Umzugsunternehmen: Auftragsmanagement, Personalplanung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Auftragsplanung & Kalkulation', 'Manuelle Personalplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Auftragsplanung', '40% weniger Verwaltungszeit', 'Digitale Personalplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Planer','Der Buchhalter','Der Empfänger','Der Wächter','Der Schreiber','Der Personalchef','Der Verkäufer','Der Schmied','Der Techniker','Der Assistent','Der Analyst','Der Einkäufer','Der Regisseur','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Planer','Der Buchhalter','Der Empfänger'],
    stundenProWoche: { klein: 6, mittel: 11, gross: 17 }
  },
  {
    name: 'Bestattungsunternehmen',
    slug: 'bestattungsunternehmen',
    kategorie: 'Dienstleistungen',
    beschreibung: 'KI-Automatisierung für Bestattungsunternehmen: Auftragsmanagement, Dokumentation und Kundenkommunikation einfühlsam gestalten.',
    schmerzen: ['Aufwendige Behördenkommunikation & Dokumentation', 'Manuelle Auftragsabwicklung', 'Zeitintensive Kundenkommunikation in sensiblen Momenten', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Behördenkommunikation', '40% weniger Verwaltungszeit', 'Digitale Auftragsabwicklung', 'Mehr Zeit für die Begleitung der Hinterbliebenen'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Wächter','Der Assistent','Der Jurist','Der Personalchef','Der Analyst','Der Moderator','Der Techniker','Der Regisseur','Der Trainer','Der Forscher','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Entrümpelungen',
    slug: 'entruempelungen',
    kategorie: 'Dienstleistungen',
    beschreibung: 'KI-Automatisierung für Entrümpelungsbetriebe: Auftragsmanagement, Angebotserstellung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Angebotserstellung', 'Manuelle Auftragsplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Auftragsplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Wächter','Der Verkäufer','Der Personalchef','Der Assistent','Der Analyst','Der Techniker','Der Moderator','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 12 }
  },
  {
    name: 'Fahrdienste & Krankenfahrten',
    slug: 'fahrdienste-krankenfahrten',
    kategorie: 'Dienstleistungen',
    beschreibung: 'KI-Automatisierung für Fahrdienste: Disposition, Abrechnung mit Krankenkassen und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Disposition & Tourenplanung', 'Manuelle Krankenkassenabrechnung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Disposition', '40% weniger Verwaltungszeit', 'Automatische Krankenkassenabrechnung', 'Digitale Kundenkommunikation'],
    agenten: ['Der Planer','Der Buchhalter','Der Empfänger','Der Wächter','Der Schmied','Der Techniker','Der Personalchef','Der Schreiber','Der Assistent','Der Analyst','Der Verkäufer','Der Moderator','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Planer','Der Buchhalter','Der Empfänger'],
    stundenProWoche: { klein: 6, mittel: 11, gross: 17 }
  },

  // ── BILDUNG (NISCHEN)
  {
    name: 'Nachhilfeinstitute',
    slug: 'nachhilfeinstitute',
    kategorie: 'Bildung & Training',
    beschreibung: 'KI-Automatisierung für Nachhilfeinstitute: Kursbuchung, Lehrerverwaltung und Elternkommunikation automatisieren.',
    schmerzen: ['Aufwendige Kursbuchungsverwaltung', 'Manuelle Lehrereinsatzplanung', 'Zeitintensive Elternkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Kursbuchung', '40% weniger Verwaltungszeit', 'Digitale Lehrerverwaltung', 'Automatisierte Elternkommunikation'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Trainer','Der Schreiber','Der Personalchef','Der Wächter','Der Moderator','Der Assistent','Der Analyst','Der Regisseur','Der Techniker','Der Forscher','Der Verkäufer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Trainer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Musikschulen',
    slug: 'musikschulen',
    kategorie: 'Bildung & Training',
    beschreibung: 'KI-Automatisierung für Musikschulen: Kursbuchung, Lehrerverwaltung und Elternkommunikation automatisieren.',
    schmerzen: ['Aufwendige Stunden- und Raumplanung', 'Manuelle Abrechnung & Inkasso', 'Zeitintensive Elternkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Stundenplanung', '40% weniger Verwaltungszeit', 'Digitale Abrechnung', 'Automatisierte Elternkommunikation'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Trainer','Der Schreiber','Der Personalchef','Der Wächter','Der Moderator','Der Assistent','Der Analyst','Der Regisseur','Der Techniker','Der Forscher','Der Verkäufer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Sprachschulen',
    slug: 'sprachschulen',
    kategorie: 'Bildung & Training',
    beschreibung: 'KI-Automatisierung für Sprachschulen: Kursbuchung, Lernfortschrittsverwaltung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Kursbuchungsverwaltung', 'Manuelle Lernfortschrittsdokumentation', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Kursbuchung', '35% weniger Verwaltungszeit', 'Digitale Lernfortschrittsdokumentation', 'Automatisierte Kundenkommunikation'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Trainer','Der Schreiber','Der Übersetzer','Der Personalchef','Der Moderator','Der Wächter','Der Assistent','Der Analyst','Der Regisseur','Der Techniker','Der Forscher','Der Verkäufer','Der Sicherheitschef','Der Netzwerker','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Trainer','Der Übersetzer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },

  // ── HANDEL NISCHEN
  {
    name: 'Blumenhandel & Floristik',
    slug: 'blumenhandel-floristik',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Floristen: Auftragsmanagement, Saisonplanung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Saisonplanung & Bestellungen', 'Manuelle Auftragsabwicklung für Events', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Saisonbestellungen', '30% weniger Verwaltungszeit', 'Digitale Eventabwicklung', 'Mehr Stammkunden durch Newsletter'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Einkäufer','Der Planer','Der Schreiber','Der Verkäufer','Der Wächter','Der Regisseur','Der Assistent','Der Moderator','Der Analyst','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter','Der Einkäufer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Buchhandlungen',
    slug: 'buchhandlungen',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Buchhandlungen: Warenwirtschaft, Bestellmanagement und Kundenkommunikation.',
    schmerzen: ['Aufwendige Warenwirtschaft & Titelbestellungen', 'Manuelle Kundenkommunikation', 'Zeitintensiver Onlineshop-Betrieb', 'Fehlende Stammkundenpflege'],
    ergebnisse: ['Automatische Titelbestellungen', '30% weniger Verwaltungszeit', 'Digitaler Onlineshop', 'Mehr Stammkunden durch Newsletter'],
    agenten: ['Der Einkäufer','Der Buchhalter','Der Empfänger','Der Schreiber','Der Verkäufer','Der Wächter','Der Planer','Der Assistent','Der Analyst','Der Moderator','Der Regisseur','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Einkäufer','Der Buchhalter','Der Empfänger'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Sportartikelhandel',
    slug: 'sportartikelhandel',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Sportartikelhändler: Warenwirtschaft, Saisonplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Saisonplanung & Lagerhaltung', 'Manuelle Warenwirtschaft', 'Zeitintensiver Onlineshop', 'Fehlende Stammkundenpflege'],
    ergebnisse: ['Automatische Saisonbestellungen', '30% weniger Verwaltungszeit', 'Digitaler Onlineshop', 'Mehr Umsatz durch Stammkundenprogramm'],
    agenten: ['Der Einkäufer','Der Buchhalter','Der Verkäufer','Der Planer','Der Empfänger','Der Schreiber','Der Wächter','Der Analyst','Der Assistent','Der Moderator','Der Regisseur','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Einkäufer','Der Buchhalter','Der Verkäufer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Küchenstudios',
    slug: 'kuechenstudios',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Küchenstudios: Angebotserstellung, Auftragsabwicklung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Angebots- und Planungserstellung', 'Manuelle Auftragsabwicklung', 'Zeitintensive Kundenkommunikation', 'Koordination mit Lieferanten & Monteuren'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Auftragsabwicklung', 'Effiziente Lieferanten- und Monteurkoordination'],
    agenten: ['Der Verkäufer','Der Buchhalter','Der Planer','Der Empfänger','Der Schreiber','Der Einkäufer','Der Wächter','Der Analyst','Der Assistent','Der Regisseur','Der Moderator','Der Techniker','Der Personalchef','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Verkäufer','Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Musikinstrumentenhandel',
    slug: 'musikinstrumentenhandel',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Musikinstrumentenhändler: Warenwirtschaft, Reparaturservice und Kundenkommunikation.',
    schmerzen: ['Aufwendige Warenwirtschaft mit vielen Herstellern', 'Manuelle Reparaturauftragsverwaltung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Digitale Warenwirtschaft', '30% weniger Verwaltungszeit', 'Automatische Reparaturstatusmeldungen', 'Mehr Stammkunden durch Newsletter'],
    agenten: ['Der Einkäufer','Der Buchhalter','Der Empfänger','Der Verkäufer','Der Schreiber','Der Wächter','Der Planer','Der Assistent','Der Techniker','Der Analyst','Der Moderator','Der Regisseur','Der Personalchef','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Einkäufer','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 8, gross: 13 }
  },

  // ── BAU & IMMOBILIEN NISCHEN
  {
    name: 'Parkettleger',
    slug: 'parkettleger',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Parkettleger: Angebotserstellung, Materialplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Aufmaß- und Angebotserstellung', 'Manuelle Materialbestellung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Materialplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Buchhalter','Der Planer','Der Einkäufer','Der Wächter','Der Schreiber','Der Verkäufer','Der Techniker','Der Schmied','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Zaunbau',
    slug: 'zaunbau',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Zaunbaubetriebe: Angebotserstellung, Materialplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Aufmaß- und Angebotserstellung', 'Manuelle Materialbestellung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Materialplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Buchhalter','Der Planer','Der Einkäufer','Der Wächter','Der Schreiber','Der Verkäufer','Der Techniker','Der Schmied','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 5, mittel: 8, gross: 13 }
  },
  {
    name: 'Pflasterbau',
    slug: 'pflasterbau',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Pflasterbaubetriebe: Angebotserstellung, Materialplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Aufmaß- und Angebotserstellung', 'Manuelle Materialbestellung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Materialplanung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Buchhalter','Der Planer','Der Einkäufer','Der Wächter','Der Schreiber','Der Verkäufer','Der Techniker','Der Schmied','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Schwimmbadtechnik',
    slug: 'schwimmbadtechnik',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Schwimmbadtechnik-Betriebe: Wartungsmanagement, Auftragsabwicklung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Wartungsplanung & -dokumentation', 'Manuelle Auftragsabwicklung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Wartungsplanung', '35% weniger Verwaltungszeit', 'Digitale Dokumentation', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Techniker','Der Planer','Der Buchhalter','Der Wächter','Der Schmied','Der Einkäufer','Der Schreiber','Der Empfänger','Der Assistent','Der Verkäufer','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Techniker','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },

  // ── FINANZEN LOKAL
  {
    name: 'Lohnbüros',
    slug: 'lohnbueros',
    kategorie: 'Finanzen & Versicherung',
    beschreibung: 'KI-Automatisierung für Lohnbüros: Lohnabrechnung, Meldewesen und Mandantenkommunikation automatisieren.',
    schmerzen: ['Aufwendige monatliche Lohnabrechnung', 'Komplexes Meldewesen & Fristen', 'Zeitintensive Mandantenkommunikation', 'Hoher Dokumentationsaufwand'],
    ergebnisse: ['Automatisierte Lohnabrechnung', '40% weniger Verwaltungszeit', 'Automatisches Meldewesen', 'Effiziente Mandantenkommunikation'],
    agenten: ['Der Buchhalter','Der Wächter','Der Analyst','Der Schreiber','Der Empfänger','Der Planer','Der Assistent','Der Jurist','Der Techniker','Der Personalchef','Der Schmied','Der Forscher','Der Sicherheitschef','Der Moderator','Der Regisseur','Der Trainer','Der Netzwerker','Der Einkäufer','Der Übersetzer','Der Stratege','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Wächter','Der Analyst'],
    stundenProWoche: { klein: 8, mittel: 14, gross: 20 }
  },
  {
    name: 'Buchführungsbüros',
    slug: 'buchfuehrungsbueros',
    kategorie: 'Finanzen & Versicherung',
    beschreibung: 'KI-Automatisierung für Buchführungsbüros: Belegverarbeitung, Abschlüsse und Mandantenkommunikation automatisieren.',
    schmerzen: ['Aufwendige manuelle Belegverarbeitung', 'Zeitintensive Mandantenkommunikation', 'Komplexe Jahresabschlüsse', 'Hoher Dokumentationsaufwand'],
    ergebnisse: ['Automatische Belegverarbeitung', '45% weniger Verwaltungszeit', 'Digitale Mandantenkommunikation', 'Schnellere Jahresabschlüsse'],
    agenten: ['Der Buchhalter','Der Wächter','Der Analyst','Der Schreiber','Der Empfänger','Der Planer','Der Assistent','Der Jurist','Der Techniker','Der Schmied','Der Personalchef','Der Forscher','Der Sicherheitschef','Der Moderator','Der Regisseur','Der Trainer','Der Netzwerker','Der Einkäufer','Der Übersetzer','Der Stratege','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Wächter','Der Analyst'],
    stundenProWoche: { klein: 8, mittel: 14, gross: 20 }
  },

  // ── BW-SPEZIFISCH
  {
    name: 'Keltereien & Mostereien',
    slug: 'keltereien-mostereien',
    kategorie: 'Lebensmittel & Nahversorgung',
    beschreibung: 'KI-Automatisierung für Keltereien: Produktionsdokumentation, Direktvertrieb und Kundenkommunikation.',
    schmerzen: ['Aufwendige Produktionsdokumentation', 'Manueller Direktvertrieb & Versand', 'Zeitintensive Kundenkommunikation', 'Saisonaler Verwaltungsaufwand'],
    ergebnisse: ['Digitale Produktionsdokumentation', '30% weniger Verwaltungszeit', 'Automatisierter Direktvertrieb', 'Mehr Kunden durch digitales Marketing'],
    agenten: ['Der Buchhalter','Der Einkäufer','Der Verkäufer','Der Planer','Der Schreiber','Der Wächter','Der Empfänger','Der Analyst','Der Assistent','Der Regisseur','Der Moderator','Der Personalchef','Der Forscher','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Einkäufer','Der Verkäufer'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Gärtnereien & Baumschulen',
    slug: 'gaertnereien-baumschulen',
    kategorie: 'Landwirtschaft',
    beschreibung: 'KI-Automatisierung für Gärtnereien: Produktionsverwaltung, Saisonplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Saisonplanung & Produktionsverwaltung', 'Manuelle Bestellabwicklung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Saisonplanung', '30% weniger Verwaltungszeit', 'Digitale Bestellabwicklung', 'Mehr Kunden durch digitales Marketing'],
    agenten: ['Der Planer','Der Buchhalter','Der Einkäufer','Der Wächter','Der Empfänger','Der Verkäufer','Der Schreiber','Der Assistent','Der Analyst','Der Personalchef','Der Techniker','Der Moderator','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Planer','Der Buchhalter','Der Einkäufer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Waldkindergärten',
    slug: 'waldkindergaerten',
    kategorie: 'Bildung & Training',
    beschreibung: 'KI-Automatisierung für Waldkindergärten: Elternkommunikation, Dokumentation und Verwaltung ohne Mehraufwand.',
    schmerzen: ['Aufwendige Elternkommunikation', 'Manuelle Verwaltung & Dokumentation', 'Zeitintensive Behördenkommunikation', 'Hoher Verwaltungsaufwand für kleine Teams'],
    ergebnisse: ['Automatisierte Elternkommunikation', '40% weniger Verwaltungszeit', 'Digitale Dokumentation', 'Mehr Zeit für die Kinder'],
    agenten: ['Der Empfänger','Der Schreiber','Der Buchhalter','Der Planer','Der Wächter','Der Personalchef','Der Moderator','Der Trainer','Der Assistent','Der Analyst','Der Regisseur','Der Techniker','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Schreiber','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Sozialpädagogische Einrichtungen',
    slug: 'sozialpaedagogische-einrichtungen',
    kategorie: 'Soziales & NGO',
    beschreibung: 'KI-Automatisierung für sozialpädagogische Einrichtungen: Dokumentation, Fördermittelverwaltung und Kommunikation.',
    schmerzen: ['Aufwendige Fördermittel- und Behördendokumentation', 'Manuelle Fallverwaltung', 'Zeitintensive Kommunikation mit Behörden', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Fördermitteldokumentation', '40% weniger Verwaltungszeit', 'Digitale Fallverwaltung', 'Effizientere Behördenkommunikation'],
    agenten: ['Der Personalchef','Der Buchhalter','Der Schreiber','Der Wächter','Der Empfänger','Der Planer','Der Moderator','Der Trainer','Der Assistent','Der Analyst','Der Forscher','Der Techniker','Der Jurist','Der Regisseur','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Personalchef','Der Buchhalter','Der Schreiber'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Pharmaindustrie',
    slug: 'pharmaindustrie',
    kategorie: 'Industrie & Produktion',
    beschreibung: 'KI-Automatisierung für Pharmaunternehmen: Compliance-Dokumentation, Qualitätsmanagement und Prozessautomatisierung.',
    schmerzen: ['Aufwendige Compliance- und Zulassungsdokumentation', 'Manuelle Qualitätssicherungsprozesse', 'Zeitintensive Behördenkommunikation', 'Hoher Dokumentationsaufwand'],
    ergebnisse: ['Automatische Compliance-Dokumentation', '40% weniger Verwaltungszeit', 'Digitales Qualitätsmanagement', 'Effizientere Behördenkommunikation'],
    agenten: ['Der Wächter','Der Forscher','Der Buchhalter','Der Analyst','Der Techniker','Der Schreiber','Der Einkäufer','Der Jurist','Der Sicherheitschef','Der Planer','Der Assistent','Der Personalchef','Der Empfänger','Der Moderator','Der Regisseur','Der Trainer','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Forscher','Der Buchhalter'],
    stundenProWoche: { klein: 10, mittel: 18, gross: 28 }
  },
  {
    name: 'Biotechnologie',
    slug: 'biotechnologie',
    kategorie: 'Industrie & Produktion',
    beschreibung: 'KI-Automatisierung für Biotechnologie-Unternehmen: Forschungsdokumentation, Compliance und Prozessautomatisierung.',
    schmerzen: ['Aufwendige Forschungs- und Labordokumentation', 'Komplexe Zulassungsverfahren', 'Zeitintensive Behördenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Labordokumentation', '35% weniger Verwaltungszeit', 'Digitales Compliance-Management', 'Effizientere Behördenkommunikation'],
    agenten: ['Der Forscher','Der Wächter','Der Analyst','Der Techniker','Der Schreiber','Der Buchhalter','Der Jurist','Der Schmied','Der Sicherheitschef','Der Planer','Der Assistent','Der Einkäufer','Der Personalchef','Der Empfänger','Der Regisseur','Der Trainer','Der Moderator','Der Netzwerker','Der Übersetzer','Der Stratege','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Forscher','Der Wächter','Der Analyst'],
    stundenProWoche: { klein: 10, mittel: 18, gross: 28 }
  },
  {
    name: 'Recycling & Entsorgung',
    slug: 'recycling-entsorgung',
    kategorie: 'Energie & Umwelt',
    beschreibung: 'KI-Automatisierung für Recycling- und Entsorgungsunternehmen: Auftragsmanagement, Dokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Entsorgungsdokumentation & Nachweise', 'Manuelle Tourenplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Entsorgungsdokumentation', '35% weniger Verwaltungszeit', 'Digitale Tourenplanung', 'Effizientere Kundenkommunikation'],
    agenten: ['Der Wächter','Der Buchhalter','Der Techniker','Der Planer','Der Einkäufer','Der Analyst','Der Schmied','Der Schreiber','Der Personalchef','Der Assistent','Der Empfänger','Der Regisseur','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Verkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Buchhalter','Der Techniker'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Messe & Ausstellungen',
    slug: 'messe-ausstellungen',
    kategorie: 'Medien & Kommunikation',
    beschreibung: 'KI-Automatisierung für Messeveranstalter: Ausstellerverwaltung, Besucherkommunikation und Logistik automatisieren.',
    schmerzen: ['Aufwendige Ausstellerverwaltung', 'Manuelle Besucherkommunikation', 'Zeitintensive Logistikkoordination', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Ausstellerverwaltung', '40% weniger Verwaltungszeit', 'Digitale Besucherkommunikation', 'Effizientere Logistikkoordination'],
    agenten: ['Der Planer','Der Regisseur','Der Empfänger','Der Schreiber','Der Buchhalter','Der Verkäufer','Der Moderator','Der Analyst','Der Wächter','Der Assistent','Der Techniker','Der Personalchef','Der Forscher','Der Netzwerker','Der Trainer','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Planer','Der Regisseur','Der Empfänger'],
    stundenProWoche: { klein: 8, mittel: 14, gross: 20 }
  },
];

// ============================================================
// MAIN: neue Branchen an branchen.ts anhaengen
// ============================================================
const filePath = path.join(__dirname, 'app', 'lib', 'branchen.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Interface um pflichtagenten erweitern falls noetig
if (!content.includes('pflichtagenten')) {
  content = content.replace(
    'agenten: string[]',
    'agenten: string[]\n  pflichtagenten?: string[]'
  );
}

// Vor dem letzten "];" einfuegen (Ende des branchen-Arrays)
const insertPoint = content.indexOf('export function getBranchenByKategorie') !== -1 ? content.indexOf('export function getBranchenByKategorie') : content.indexOf('export default branchen');
if (insertPoint === -1) {
  console.error('FEHLER: Konnte das Ende des branchen-Arrays nicht finden.');
  process.exit(1);
}

let newEntries = '\n';
for (const b of NEUE_BRANCHEN) {
  newEntries += `  {\n`;
  newEntries += `    name: '${b.name}',\n`;
  newEntries += `    slug: '${b.slug}',\n`;
  newEntries += `    kategorie: '${b.kategorie}',\n`;
  newEntries += `    beschreibung: '${b.beschreibung}',\n`;
  newEntries += `    schmerzen: [${b.schmerzen.map(s => `'${s}'`).join(', ')}],\n`;
  newEntries += `    ergebnisse: [${b.ergebnisse.map(e => `'${e}'`).join(', ')}],\n`;
  newEntries += `    agenten: [${b.agenten.map(a => `'${a}'`).join(', ')}],\n`;
  newEntries += `    pflichtagenten: [${b.pflichtagenten.map(a => `'${a}'`).join(', ')}],\n`;
  newEntries += `    stundenProWoche: { klein: ${b.stundenProWoche.klein}, mittel: ${b.stundenProWoche.mittel}, gross: ${b.stundenProWoche.gross} },\n`;
  newEntries += `  },\n`;
}

content = content.slice(0, insertPoint) + newEntries + content.slice(insertPoint);
fs.writeFileSync(filePath, content, 'utf8');

console.log(`\n✅ FERTIG`);
console.log(`   ${NEUE_BRANCHEN.length} neue Branchen hinzugefügt`);
console.log(`   Neue Gesamtzahl: 100 (bestehend) + ${NEUE_BRANCHEN.length} = ${100 + NEUE_BRANCHEN.length} Branchen`);
console.log(`\n📋 Neue Kategorien:`);
const kats = [...new Set(NEUE_BRANCHEN.map(b => b.kategorie))];
kats.forEach(k => {
  const count = NEUE_BRANCHEN.filter(b => b.kategorie === k).length;
  console.log(`   ${k}: ${count} neue Branchen`);
});
