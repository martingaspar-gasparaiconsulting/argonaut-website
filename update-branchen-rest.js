// update-branchen-rest.js — Script 3 (finale Ergänzung ~28 Branchen)
// node update-branchen-rest.js

const fs = require('fs');
const path = require('path');

const NEUE_BRANCHEN = [

  // ── HANDEL NISCHEN
  {
    name: 'Antiquitätenhandel',
    slug: 'antiquitaetenhandel',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Antiquitätenhändler: Inventarverwaltung, Kundenkommunikation und Online-Präsenz automatisieren.',
    schmerzen: ['Aufwendige Inventarverwaltung & Bewertung', 'Manuelle Kundenkommunikation', 'Zeitintensiver Online-Verkauf', 'Fehlende digitale Präsenz'],
    ergebnisse: ['Digitale Inventarverwaltung', '30% weniger Verwaltungszeit', 'Automatisierter Online-Verkauf', 'Mehr Kunden durch digitales Marketing'],
    agenten: ['Der Buchhalter','Der Empfänger','Der Schreiber','Der Verkäufer','Der Einkäufer','Der Wächter','Der Analyst','Der Planer','Der Assistent','Der Regisseur','Der Moderator','Der Forscher','Der Personalchef','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Empfänger'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 12 }
  },
  {
    name: 'Second-Hand & Vintage',
    slug: 'second-hand-laeden',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Second-Hand-Läden: Warenverwaltung, Kundenkommunikation und Online-Präsenz.',
    schmerzen: ['Aufwendige Warenverwaltung & Preisfindung', 'Manuelle Kundenkommunikation', 'Zeitintensiver Online-Verkauf', 'Fehlende Stammkundenpflege'],
    ergebnisse: ['Digitale Warenverwaltung', '30% weniger Verwaltungszeit', 'Automatisierter Online-Verkauf', 'Mehr Stammkunden durch Newsletter'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Schreiber','Der Verkäufer','Der Einkäufer','Der Wächter','Der Planer','Der Regisseur','Der Assistent','Der Moderator','Der Analyst','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Schreibwarenhandel',
    slug: 'schreibwarenhandel',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Schreibwarenhändler: Warenwirtschaft, Saisonplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Warenwirtschaft & Saisonplanung', 'Manuelle Bestellverwaltung', 'Zeitintensiver Schulanfangs-Betrieb', 'Fehlende Stammkundenpflege'],
    ergebnisse: ['Automatische Saisonbestellungen', '30% weniger Verwaltungszeit', 'Digitale Warenwirtschaft', 'Mehr Stammkunden durch Loyalty-Programm'],
    agenten: ['Der Einkäufer','Der Buchhalter','Der Empfänger','Der Verkäufer','Der Planer','Der Schreiber','Der Wächter','Der Assistent','Der Analyst','Der Moderator','Der Techniker','Der Regisseur','Der Personalchef','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Einkäufer','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Haushaltswaren & Geschenkartikel',
    slug: 'haushaltswaren-geschenkartikel',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Haushaltswarenhändler: Warenwirtschaft, Saisonplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Saisonplanung & Lagerhaltung', 'Manuelle Warenwirtschaft', 'Zeitintensiver Weihnachtsgeschäft-Betrieb', 'Fehlende Stammkundenpflege'],
    ergebnisse: ['Automatische Saisonbestellungen', '30% weniger Verwaltungszeit', 'Digitale Warenwirtschaft', 'Mehr Umsatz durch Stammkundenprogramm'],
    agenten: ['Der Einkäufer','Der Buchhalter','Der Verkäufer','Der Empfänger','Der Planer','Der Schreiber','Der Wächter','Der Regisseur','Der Assistent','Der Analyst','Der Moderator','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Einkäufer','Der Buchhalter','Der Verkäufer'],
    stundenProWoche: { klein: 5, mittel: 8, gross: 13 }
  },
  {
    name: 'Babyausstattung & Kindermode',
    slug: 'babyausstattung-kindermoebel',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Baby- und Kinderfachhändler: Warenwirtschaft, Beratung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Warenwirtschaft mit vielen Lieferanten', 'Manuelle Kundenkommunikation', 'Zeitintensiver Onlineshop-Betrieb', 'Fehlende Stammkundenpflege'],
    ergebnisse: ['Digitale Warenwirtschaft', '30% weniger Verwaltungszeit', 'Automatisierter Onlineshop', 'Mehr Stammkunden durch Newsletter'],
    agenten: ['Der Empfänger','Der Einkäufer','Der Buchhalter','Der Verkäufer','Der Schreiber','Der Planer','Der Wächter','Der Regisseur','Der Assistent','Der Moderator','Der Analyst','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Einkäufer','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 8, gross: 13 }
  },
  {
    name: 'Angelbedarf',
    slug: 'angelbedarfshandel',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Angelbedarfshändler: Warenwirtschaft, Saisonplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Saisonplanung & Lagerhaltung', 'Manuelle Warenwirtschaft', 'Zeitintensiver Onlineshop', 'Fehlende Stammkundenpflege'],
    ergebnisse: ['Automatische Saisonbestellungen', '30% weniger Verwaltungszeit', 'Digitaler Onlineshop', 'Mehr Stammkunden durch Newsletter'],
    agenten: ['Der Einkäufer','Der Buchhalter','Der Empfänger','Der Verkäufer','Der Planer','Der Schreiber','Der Wächter','Der Assistent','Der Analyst','Der Moderator','Der Regisseur','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Einkäufer','Der Buchhalter'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 11 }
  },
  {
    name: 'Jagdbedarf & Waffen',
    slug: 'jagdbedarf-waffen',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Jagdbedarfshändler: Waffenbuchhaltung, Warenwirtschaft und Kundenkommunikation.',
    schmerzen: ['Aufwendige gesetzliche Waffenbuchhaltung', 'Manuelle Warenwirtschaft', 'Zeitintensive Genehmigungsverwaltung', 'Hoher Dokumentationsaufwand'],
    ergebnisse: ['Automatische Waffenbuchhaltung', '35% weniger Verwaltungszeit', 'Digitale Warenwirtschaft', 'Effiziente Genehmigungsverwaltung'],
    agenten: ['Der Wächter','Der Buchhalter','Der Jurist','Der Einkäufer','Der Empfänger','Der Planer','Der Schreiber','Der Analyst','Der Assistent','Der Techniker','Der Personalchef','Der Moderator','Der Regisseur','Der Forscher','Der Verkäufer','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Integrator','Der Schmied','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Buchhalter','Der Jurist'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },

  // ── BEAUTY NISCHEN
  {
    name: 'Sonnenstudios',
    slug: 'sonnenstudios',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Sonnenstudios: Terminmanagement, Mitgliederverwaltung und Kundenkommunikation.',
    schmerzen: ['Aufwendiges Terminmanagement', 'Manuelle Mitgliederverwaltung', 'Zeitintensive Abrechnung', 'Fehlende Kundenbindungstools'],
    ergebnisse: ['Automatisches Terminmanagement', '30% weniger Verwaltungszeit', 'Digitale Mitgliederverwaltung', 'Mehr Stammkunden durch Loyalty-Programm'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Verkäufer','Der Schreiber','Der Wächter','Der Moderator','Der Assistent','Der Analyst','Der Regisseur','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 3, mittel: 6, gross: 10 }
  },
  {
    name: 'Piercing-Studios',
    slug: 'piercingstudios',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Piercing-Studios: Terminmanagement, Hygienekonzept-Dokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Hygienedokumentation', 'Manuelle Terminverwaltung', 'Zeitintensive Kundenkommunikation', 'Fehlende digitale Präsenz'],
    ergebnisse: ['Automatische Hygienedokumentation', '30% weniger Verwaltungszeit', 'Digitales Terminmanagement', 'Mehr Kunden durch Social Media'],
    agenten: ['Der Empfänger','Der Wächter','Der Buchhalter','Der Schreiber','Der Planer','Der Regisseur','Der Moderator','Der Assistent','Der Analyst','Der Personalchef','Der Verkäufer','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Wächter'],
    stundenProWoche: { klein: 3, mittel: 5, gross: 9 }
  },
  {
    name: 'Permanent-Makeup Studios',
    slug: 'permanent-makeup-studios',
    kategorie: 'Beauty & Lifestyle',
    beschreibung: 'KI-Automatisierung für Permanent-Makeup-Studios: Terminmanagement, Nachsorgedokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Terminplanung & Nachsorgekommunikation', 'Manuelle Dokumentation', 'Zeitintensive Kundenkommunikation', 'Fehlende digitale Präsenz'],
    ergebnisse: ['Automatisches Terminmanagement', '30% weniger Verwaltungszeit', 'Digitale Nachsorgedokumentation', 'Mehr Kunden durch Social Media'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Schreiber','Der Planer','Der Wächter','Der Regisseur','Der Moderator','Der Assistent','Der Analyst','Der Verkäufer','Der Personalchef','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 3, mittel: 6, gross: 10 }
  },

  // ── IT NISCHEN
  {
    name: 'IT-Sicherheit für KMU',
    slug: 'it-sicherheit-kmu',
    kategorie: 'IT & Technologie',
    beschreibung: 'KI-Automatisierung für IT-Sicherheitsdienstleister: Monitoring, Dokumentation und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendiges Sicherheits-Monitoring & Reporting', 'Manuelle Dokumentation von Vorfällen', 'Zeitintensive Kundenkommunikation', 'Hoher Beratungsaufwand'],
    ergebnisse: ['Automatisches Sicherheits-Monitoring', '35% weniger Verwaltungszeit', 'Digitale Vorfallsdokumentation', 'Effizientere Kundenkommunikation'],
    agenten: ['Der Sicherheitschef','Der Wächter','Der Techniker','Der Analyst','Der Schmied','Der Schreiber','Der Forscher','Der Buchhalter','Der Assistent','Der Planer','Der Empfänger','Der Regisseur','Der Personalchef','Der Moderator','Der Trainer','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Einkäufer','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Sicherheitschef','Der Wächter','Der Techniker'],
    stundenProWoche: { klein: 6, mittel: 11, gross: 17 }
  },
  {
    name: 'Kassensysteme & POS',
    slug: 'kassensysteme-pos',
    kategorie: 'IT & Technologie',
    beschreibung: 'KI-Automatisierung für Kassensystem-Anbieter: Kundenverwaltung, Support und Abrechnung automatisieren.',
    schmerzen: ['Aufwendiger technischer Support', 'Manuelle Kundenverwaltung', 'Zeitintensive Abrechnung', 'Hoher Dokumentationsaufwand'],
    ergebnisse: ['Automatisierter Support', '35% weniger Verwaltungszeit', 'Digitale Kundenverwaltung', 'Schnellere Abrechnung'],
    agenten: ['Der Techniker','Der Empfänger','Der Buchhalter','Der Schmied','Der Wächter','Der Analyst','Der Schreiber','Der Planer','Der Assistent','Der Verkäufer','Der Regisseur','Der Personalchef','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Techniker','Der Empfänger','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Industrieautomation',
    slug: 'industrieautomation',
    kategorie: 'IT & Technologie',
    beschreibung: 'KI-Automatisierung für Industrieautomations-Betriebe: Projektmanagement, Dokumentation und Kundenkommunikation.',
    schmerzen: ['Aufwendige Projektdokumentation', 'Manuelle Projektplanung & -koordination', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Projektdokumentation', '35% weniger Verwaltungszeit', 'Digitale Projektplanung', 'Effizientere Kundenkommunikation'],
    agenten: ['Der Schmied','Der Techniker','Der Planer','Der Analyst','Der Buchhalter','Der Wächter','Der Schreiber','Der Assistent','Der Forscher','Der Empfänger','Der Verkäufer','Der Regisseur','Der Personalchef','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Schmied','Der Techniker','Der Planer'],
    stundenProWoche: { klein: 8, mittel: 14, gross: 20 }
  },
  {
    name: 'Messtechnik & Prüfgeräte',
    slug: 'messtechnik-pruefgeraete',
    kategorie: 'IT & Technologie',
    beschreibung: 'KI-Automatisierung für Messtechnik-Unternehmen: Kalibrierungsdokumentation, Auftragsmanagement und Kundenkommunikation.',
    schmerzen: ['Aufwendige Kalibrierungsdokumentation', 'Manuelle Auftragsabwicklung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Kalibrierungsdokumentation', '35% weniger Verwaltungszeit', 'Digitale Auftragsabwicklung', 'Schnellere Rechnungsstellung'],
    agenten: ['Der Wächter','Der Techniker','Der Buchhalter','Der Analyst','Der Schmied','Der Planer','Der Schreiber','Der Assistent','Der Empfänger','Der Forscher','Der Personalchef','Der Regisseur','Der Moderator','Der Trainer','Der Verkäufer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Techniker','Der Buchhalter'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },

  // ── FINANZEN NISCHEN
  {
    name: 'Finanzierungsberatung',
    slug: 'finanzierungsberatung',
    kategorie: 'Finanzen & Versicherung',
    beschreibung: 'KI-Automatisierung für Finanzierungsberater: Kundenqualifizierung, Dokumentenmanagement und Kundenkommunikation.',
    schmerzen: ['Aufwendige Dokumentenprüfung & -verwaltung', 'Manuelle Kundenqualifizierung', 'Zeitintensive Kommunikation mit Banken', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Dokumentenprüfung', '40% weniger Verwaltungszeit', 'Digitale Kundenqualifizierung', 'Schnellere Bankenkommunikation'],
    agenten: ['Der Buchhalter','Der Analyst','Der Verkäufer','Der Wächter','Der Empfänger','Der Schreiber','Der Jurist','Der Planer','Der Forscher','Der Assistent','Der Netzwerker','Der Regisseur','Der Moderator','Der Personalchef','Der Techniker','Der Trainer','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Analyst','Der Verkäufer'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Erbschaftsberatung',
    slug: 'erbschaftsberatung',
    kategorie: 'Finanzen & Versicherung',
    beschreibung: 'KI-Automatisierung für Erbschaftsberater: Dokumentenmanagement, Mandantenkommunikation und Fallverwaltung.',
    schmerzen: ['Aufwendige Dokumentenverwaltung & -prüfung', 'Manuelle Mandantenkommunikation', 'Zeitintensive Behördenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Dokumentenverwaltung', '40% weniger Verwaltungszeit', 'Digitale Mandantenkommunikation', 'Effizientere Behördenkommunikation'],
    agenten: ['Der Jurist','Der Buchhalter','Der Wächter','Der Schreiber','Der Analyst','Der Empfänger','Der Planer','Der Assistent','Der Forscher','Der Techniker','Der Sicherheitschef','Der Personalchef','Der Moderator','Der Regisseur','Der Trainer','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Jurist','Der Buchhalter','Der Wächter'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Insolvenzberatung',
    slug: 'insolvenzberatung',
    kategorie: 'Finanzen & Versicherung',
    beschreibung: 'KI-Automatisierung für Insolvenzberater: Fallverwaltung, Dokumentenmanagement und Gläubigerkommunikation.',
    schmerzen: ['Aufwendige Fallverwaltung & Dokumentation', 'Manuelle Gläubigerkommunikation', 'Zeitintensive Behördenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Fallverwaltung', '40% weniger Verwaltungszeit', 'Digitale Gläubigerkommunikation', 'Effizientere Behördenkommunikation'],
    agenten: ['Der Jurist','Der Buchhalter','Der Wächter','Der Analyst','Der Schreiber','Der Empfänger','Der Planer','Der Assistent','Der Forscher','Der Techniker','Der Sicherheitschef','Der Personalchef','Der Moderator','Der Regisseur','Der Trainer','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Jurist','Der Buchhalter','Der Wächter'],
    stundenProWoche: { klein: 8, mittel: 14, gross: 20 }
  },

  // ── KULTUR & BILDUNG NISCHEN
  {
    name: 'Kunstschulen',
    slug: 'kunstschulen',
    kategorie: 'Bildung & Training',
    beschreibung: 'KI-Automatisierung für Kunstschulen: Kursbuchung, Materialverwaltung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Kursbuchungsverwaltung', 'Manuelle Materialbestellung', 'Zeitintensive Eltern- und Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Kursbuchung', '30% weniger Verwaltungszeit', 'Digitale Materialverwaltung', 'Mehr Anmeldungen durch automatisiertes Marketing'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Regisseur','Der Moderator','Der Wächter','Der Trainer','Der Assistent','Der Analyst','Der Personalchef','Der Einkäufer','Der Techniker','Der Forscher','Der Verkäufer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter','Der Regisseur'],
    stundenProWoche: { klein: 4, mittel: 7, gross: 12 }
  },
  {
    name: 'Musikproduktion',
    slug: 'musikproduktion',
    kategorie: 'Medien & Kommunikation',
    beschreibung: 'KI-Automatisierung für Musikproduzenten: Projektmanagement, Lizenzmanagement und Kundenkommunikation.',
    schmerzen: ['Aufwendiges Lizenz- und Rechteverwaltung', 'Manuelle Projektabwicklung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatisches Lizenzmanagement', '30% weniger Verwaltungszeit', 'Digitale Projektabwicklung', 'Effizientere Kundenkommunikation'],
    agenten: ['Der Regisseur','Der Schreiber','Der Buchhalter','Der Jurist','Der Schmied','Der Techniker','Der Empfänger','Der Planer','Der Analyst','Der Assistent','Der Moderator','Der Wächter','Der Forscher','Der Personalchef','Der Übersetzer','Der Verkäufer','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Stratege','Der Einkäufer','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Regisseur','Der Schreiber','Der Jurist'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },

  // ── BAU NISCHEN
  {
    name: 'Badstudios',
    slug: 'badstudios',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Badstudios: Angebotserstellung, Auftragsabwicklung und Kundenkommunikation automatisieren.',
    schmerzen: ['Aufwendige Planungs- und Angebotserstellung', 'Koordination mit Handwerkern & Lieferanten', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Handwerkerkoordination', 'Mehr Aufträge durch automatisiertes Marketing'],
    agenten: ['Der Verkäufer','Der Buchhalter','Der Planer','Der Empfänger','Der Schreiber','Der Einkäufer','Der Wächter','Der Analyst','Der Assistent','Der Regisseur','Der Moderator','Der Techniker','Der Personalchef','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Verkäufer','Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },
  {
    name: 'Gartengestaltung',
    slug: 'gartengestaltung',
    kategorie: 'Handwerk & Bau',
    beschreibung: 'KI-Automatisierung für Gartengestalter: Angebotserstellung, Projektplanung und Kundenkommunikation.',
    schmerzen: ['Aufwendige Aufmaß- und Angebotserstellung', 'Manuelle Projektplanung & Materialbeschaffung', 'Zeitintensive Kundenkommunikation', 'Hoher Abrechnungsaufwand'],
    ergebnisse: ['Automatische Angebotserstellung', '35% weniger Verwaltungszeit', 'Digitale Projektplanung', 'Mehr Aufträge durch automatisiertes Marketing'],
    agenten: ['Der Planer','Der Buchhalter','Der Einkäufer','Der Verkäufer','Der Schreiber','Der Wächter','Der Empfänger','Der Assistent','Der Analyst','Der Regisseur','Der Schmied','Der Personalchef','Der Techniker','Der Moderator','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Planer','Der Buchhalter','Der Einkäufer'],
    stundenProWoche: { klein: 6, mittel: 10, gross: 16 }
  },

  // ── SONSTIGE
  {
    name: 'Boots- & Yachthandel',
    slug: 'boots-yachthandel',
    kategorie: 'Handel',
    beschreibung: 'KI-Automatisierung für Bootshändler: Liegeplatz- und Serviceverwaltung, Kundenkommunikation und Abrechnung.',
    schmerzen: ['Aufwendige Liegeplatzverwaltung', 'Manuelle Service- und Wartungsplanung', 'Zeitintensive Kundenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Liegeplatzverwaltung', '35% weniger Verwaltungszeit', 'Digitale Wartungsplanung', 'Effizientere Kundenkommunikation'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Einkäufer','Der Techniker','Der Wächter','Der Schreiber','Der Verkäufer','Der Assistent','Der Analyst','Der Personalchef','Der Regisseur','Der Moderator','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 6, mittel: 11, gross: 17 }
  },
  {
    name: 'Reittherapie',
    slug: 'reittherapie',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Reittherapie-Einrichtungen: Terminmanagement, Krankenkassenabrechnung und Dokumentation.',
    schmerzen: ['Aufwendige Krankenkassenabrechnung', 'Manuelle Terminverwaltung', 'Zeitintensive Dokumentation', 'Hoher Verwaltungsaufwand für kleine Teams'],
    ergebnisse: ['Automatische Krankenkassenabrechnung', '40% weniger Verwaltungszeit', 'Digitale Patientendokumentation', 'Mehr Zeit für die Therapie'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Wächter','Der Schreiber','Der Assistent','Der Personalchef','Der Analyst','Der Techniker','Der Moderator','Der Trainer','Der Regisseur','Der Forscher','Der Verkäufer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Pilzzucht',
    slug: 'pilzzucht',
    kategorie: 'Landwirtschaft',
    beschreibung: 'KI-Automatisierung für Pilzzucht-Betriebe: Produktionsverwaltung, Direktvertrieb und Kundenkommunikation.',
    schmerzen: ['Aufwendige Produktionsdokumentation', 'Manueller Direktvertrieb', 'Zeitintensive Kundenkommunikation', 'Fehlende Online-Präsenz'],
    ergebnisse: ['Digitale Produktionsdokumentation', '30% weniger Verwaltungszeit', 'Automatisierter Direktvertrieb', 'Mehr Kunden durch digitales Marketing'],
    agenten: ['Der Buchhalter','Der Planer','Der Verkäufer','Der Einkäufer','Der Schreiber','Der Wächter','Der Empfänger','Der Analyst','Der Assistent','Der Regisseur','Der Moderator','Der Personalchef','Der Forscher','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Buchhalter','Der Planer'],
    stundenProWoche: { klein: 3, mittel: 6, gross: 10 }
  },
  {
    name: 'Psychologische Beratung',
    slug: 'psychologische-beratung',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für psychologische Beratungsstellen: Terminmanagement, Dokumentation und Abrechnung.',
    schmerzen: ['Aufwendige Terminverwaltung', 'Manuelle Dokumentation', 'Zeitintensive Abrechnung', 'Verwaltungsaufwand neben der Beratungsarbeit'],
    ergebnisse: ['Automatisches Terminmanagement', '40% weniger Verwaltungszeit', 'Digitale Dokumentation', 'Mehr Zeit für die Klienten'],
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Wächter','Der Schreiber','Der Assistent','Der Analyst','Der Moderator','Der Personalchef','Der Techniker','Der Trainer','Der Forscher','Der Regisseur','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Planer','Der Buchhalter'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Suchtberatung',
    slug: 'suchtberatung',
    kategorie: 'Soziales & NGO',
    beschreibung: 'KI-Automatisierung für Suchtberatungsstellen: Falldokumentation, Fördermittelverwaltung und Kommunikation.',
    schmerzen: ['Aufwendige Falldokumentation & Nachweise', 'Manuelle Fördermittelverwaltung', 'Zeitintensive Behördenkommunikation', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Falldokumentation', '40% weniger Verwaltungszeit', 'Digitale Fördermittelverwaltung', 'Effizientere Behördenkommunikation'],
    agenten: ['Der Personalchef','Der Buchhalter','Der Schreiber','Der Wächter','Der Empfänger','Der Planer','Der Moderator','Der Trainer','Der Assistent','Der Analyst','Der Forscher','Der Techniker','Der Jurist','Der Regisseur','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Personalchef','Der Buchhalter','Der Schreiber'],
    stundenProWoche: { klein: 5, mittel: 9, gross: 14 }
  },
  {
    name: 'Hospize & Palliativpflege',
    slug: 'hospize-palliativpflege',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für Hospize: Dokumentation, Fördermittelverwaltung und Kommunikation mit Angehörigen.',
    schmerzen: ['Aufwendige Pflegedokumentation', 'Manuelle Fördermittelverwaltung', 'Zeitintensive Kommunikation mit Angehörigen', 'Hoher Verwaltungsaufwand'],
    ergebnisse: ['Automatische Pflegedokumentation', '40% weniger Verwaltungszeit', 'Digitale Fördermittelverwaltung', 'Mehr Zeit für die Begleitung'],
    agenten: ['Der Empfänger','Der Buchhalter','Der Schreiber','Der Wächter','Der Planer','Der Personalchef','Der Assistent','Der Analyst','Der Moderator','Der Trainer','Der Jurist','Der Techniker','Der Forscher','Der Regisseur','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Empfänger','Der Buchhalter','Der Schreiber'],
    stundenProWoche: { klein: 7, mittel: 12, gross: 18 }
  },
  {
    name: 'Medizinische Labore',
    slug: 'medizinische-labore',
    kategorie: 'Medizin & Gesundheit',
    beschreibung: 'KI-Automatisierung für medizinische Labore: Auftragsmanagement, Befunddokumentation und Arztkommunikation.',
    schmerzen: ['Aufwendige Befunddokumentation & -übermittlung', 'Manuelle Auftragsabwicklung', 'Zeitintensive Arztkommunikation', 'Hoher Qualitätssicherungsaufwand'],
    ergebnisse: ['Automatische Befundübermittlung', '35% weniger Verwaltungszeit', 'Digitale Auftragsabwicklung', 'Effizientere Arztkommunikation'],
    agenten: ['Der Wächter','Der Analyst','Der Techniker','Der Buchhalter','Der Schreiber','Der Empfänger','Der Planer','Der Assistent','Der Forscher','Der Schmied','Der Personalchef','Der Sicherheitschef','Der Moderator','Der Regisseur','Der Trainer','Der Netzwerker','Der Übersetzer','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflichtagenten: ['Der Wächter','Der Analyst','Der Techniker'],
    stundenProWoche: { klein: 8, mittel: 14, gross: 20 }
  },
];

// ============================================================
// MAIN
// ============================================================
const filePath = path.join(__dirname, 'app', 'lib', 'branchen.ts');
let content = fs.readFileSync(filePath, 'utf8');

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

console.log(`\n✅ FERTIG — Script 3 abgeschlossen`);
console.log(`   ${NEUE_BRANCHEN.length} weitere Branchen hinzugefügt`);
console.log(`\n🎯 GESAMTBILANZ nach allen 3 Scripts:`);
console.log(`   100 bestehende Branchen (aktualisiert durch Script 1)`);
console.log(`   + 70 neue Branchen (Script 2)`);
console.log(`   + ${NEUE_BRANCHEN.length} neue Branchen (Script 3)`);
console.log(`   = ${100 + 70 + NEUE_BRANCHEN.length} Branchen GESAMT`);
console.log(`\n✅ Alle Branchen haben:`);
console.log(`   - 24 Agenten in Prioritätsreihenfolge`);
console.log(`   - pflichtagenten mit Warn-Badge im UI`);
console.log(`   - Vollständige Branchenseiten-Daten`);
console.log(`   - stundenProWoche (klein/mittel/groß)`);
