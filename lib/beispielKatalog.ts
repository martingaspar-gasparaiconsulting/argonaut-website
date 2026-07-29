// ============================================================================
// ARGONAUT OS · lib/beispielKatalog.ts — Beispiel-Daten je Branche
//
// Speist den „Beispiel laden"-Knopf im Onboarding (/dashboard/onboarding).
// Ein Klick legt ein kleines, branchentypisches Netz aus Beispiel-Kontakten
// im CRM an — damit ein frischer Kunde sofort ein lebendiges System sieht,
// statt vor leeren Listen zu stehen.
//
// Sicher & reversibel: Alle Zeilen tragen quelle = BEISPIEL_QUELLE. So lassen
// sie sich jederzeit sauber wieder entfernen, ohne echte Kontakte zu berühren.
// Schluessel = exakt die 19 Kategorie-Strings aus branchenkatalog.ts
// (KATEGORIE_MODULE), so wie sie in profiles.kategorie gespeichert sind.
//
// Keine Imports, keine Hooks — node-testbar, von Client + Server nutzbar.
// ============================================================================

/** Markierung aller Beispiel-Datensaetze (Spalte kontakte.quelle). */
export const BEISPIEL_QUELLE = 'Beispiel';

/** Fester Zusatz, der jeder Beispiel-Notiz angehaengt wird. */
const BEISPIEL_HINWEIS = 'Beispiel-Datensatz zum Ausprobieren — jederzeit loeschbar.';

export type BeispielStatus = 'kunde' | 'interessent';

export type BeispielKontakt = {
  firma: string;
  vorname: string;
  nachname: string;
  ort: string;
  status: BeispielStatus;
  /** Kurze Rollen-Notiz („Stammkunde", „Lieferant …", „Interessent von der Messe"). */
  notiz: string;
  telefon?: string;
  email?: string;
};

/** Fallback, wenn keine oder eine unbekannte Branche hinterlegt ist. */
export const GENERISCHE_KONTAKTE: BeispielKontakt[] = [
  { firma: 'Muster GmbH', vorname: 'Andrea', nachname: 'Berger', ort: 'Stuttgart', status: 'kunde', notiz: 'Stammkunde — erhaelt regelmaessig Angebote.', telefon: '0711 1234560', email: 'kontakt@muster-gmbh.de' },
  { firma: 'Beispiel Handels KG', vorname: 'Thomas', nachname: 'Krause', ort: 'Muenchen', status: 'kunde', notiz: 'Groesserer Kunde mit mehreren Auftraegen pro Jahr.', telefon: '089 9876540' },
  { firma: 'Neukunde Interessent', vorname: 'Sabine', nachname: 'Wolf', ort: 'Koeln', status: 'interessent', notiz: 'Interessent — hat eine Anfrage ueber die Website gestellt.', email: 'anfrage@interessent-beispiel.de' },
];

// Je Kategorie ein kleines, typisches Netz: Stammkunde, Partner/Lieferant, Interessent.
export const BEISPIEL_KONTAKTE: Record<string, BeispielKontakt[]> = {
  'Handwerk & Bau': [
    { firma: 'Musterbau GmbH', vorname: 'Michael', nachname: 'Bauer', ort: 'Boeblingen', status: 'kunde', notiz: 'Bautraeger — regelmaessige Rohbau-Auftraege.', telefon: '07031 445500' },
    { firma: 'Hausverwaltung Sonnenhof', vorname: 'Petra', nachname: 'Lang', ort: 'Sindelfingen', status: 'kunde', notiz: 'Verwaltet mehrere Objekte — Wartung und Reparaturen.', telefon: '07031 220110' },
    { firma: 'Baustoff Handel Sued', vorname: 'Jens', nachname: 'Hoffmann', ort: 'Stuttgart', status: 'interessent', notiz: 'Lieferant fuer Material — Konditionen anfragen.', email: 'einkauf@baustoff-sued.de' },
  ],
  'Industrie & Produktion': [
    { firma: 'Praezisionsteile Wagner GmbH', vorname: 'Ralf', nachname: 'Wagner', ort: 'Esslingen', status: 'kunde', notiz: 'Serienfertigung — feste Rahmenauftraege.', telefon: '0711 330220' },
    { firma: 'Zulieferer Metall Nord', vorname: 'Carsten', nachname: 'Schmitt', ort: 'Heilbronn', status: 'kunde', notiz: 'Lieferant fuer Vormaterial und Halbzeuge.' },
    { firma: 'Maschinenbau Vogel', vorname: 'Ute', nachname: 'Vogel', ort: 'Reutlingen', status: 'interessent', notiz: 'Interessent — Anfrage fuer Zulieferteile.', email: 'einkauf@maschinenbau-vogel.de' },
  ],
  'Handel & E-Commerce': [
    { firma: 'Fachhandel Kroeger', vorname: 'Dieter', nachname: 'Kroeger', ort: 'Ludwigsburg', status: 'kunde', notiz: 'Wiederverkaeufer — bestellt regelmaessig groessere Mengen.', telefon: '07141 556677' },
    { firma: 'Online-Shop Nordlicht', vorname: 'Lena', nachname: 'Schulz', ort: 'Hamburg', status: 'kunde', notiz: 'Reiner Online-Kunde — Versandbestellungen.', email: 'bestellung@nordlicht-shop.de' },
    { firma: 'Import Partner Asien', vorname: 'Marco', nachname: 'Bianchi', ort: 'Frankfurt', status: 'interessent', notiz: 'Lieferant — Sortiments-Erweiterung geplant.' },
  ],
  'Fahrzeuge & Mobilität': [
    { firma: 'Fuhrpark Meier Logistik', vorname: 'Stefan', nachname: 'Meier', ort: 'Kornwestheim', status: 'kunde', notiz: 'Flottenkunde — Wartung und Inspektionen mehrerer Fahrzeuge.', telefon: '07154 889900' },
    { firma: 'Autohaus am Ring', vorname: 'Nadine', nachname: 'Fischer', ort: 'Waiblingen', status: 'kunde', notiz: 'Kooperationspartner — vermittelt Werkstatt-Auftraege.' },
    { firma: 'Teile Grosshandel KFZ', vorname: 'Ali', nachname: 'Yilmaz', ort: 'Stuttgart', status: 'interessent', notiz: 'Lieferant fuer Ersatzteile — Konditionen pruefen.', email: 'verkauf@kfz-teile-gh.de' },
  ],
  'Gastronomie, Hotellerie & Tourismus': [
    { firma: 'Restaurant Zur Post', vorname: 'Maria', nachname: 'Huber', ort: 'Tuebingen', status: 'kunde', notiz: 'Stammkunde — Catering und Veranstaltungen.', telefon: '07071 334455' },
    { firma: 'Getraenke Service Bodensee', vorname: 'Frank', nachname: 'Keller', ort: 'Konstanz', status: 'kunde', notiz: 'Lieferant fuer Getraenke — woechentliche Lieferung.' },
    { firma: 'Eventagentur Sonnenschein', vorname: 'Julia', nachname: 'Roth', ort: 'Stuttgart', status: 'interessent', notiz: 'Interessent — Anfrage fuer Firmenfeier.', email: 'kontakt@event-sonnenschein.de' },
  ],
  'Lebensmittel & Nahversorgung': [
    { firma: 'Hofladen Gruenberg', vorname: 'Werner', nachname: 'Gruenberg', ort: 'Herrenberg', status: 'kunde', notiz: 'Bezieht regelmaessig Backwaren und Wurst.', telefon: '07032 112233' },
    { firma: 'Gastro Belieferung Sued', vorname: 'Heike', nachname: 'Braun', ort: 'Stuttgart', status: 'kunde', notiz: 'Grosskunde — beliefert eigene Filialen.' },
    { firma: 'Wochenmarkt Staende', vorname: 'Olaf', nachname: 'Peters', ort: 'Reutlingen', status: 'interessent', notiz: 'Interessent — moechte Marktstand beliefern lassen.' },
  ],
  'Logistik & Transport': [
    { firma: 'Handel Zentrallager Sued', vorname: 'Bernd', nachname: 'Schaefer', ort: 'Kornwestheim', status: 'kunde', notiz: 'Fester Kunde — taegliche Touren.', telefon: '07154 667788' },
    { firma: 'Produktion Werk Ost', vorname: 'Katrin', nachname: 'Neumann', ort: 'Heilbronn', status: 'kunde', notiz: 'Regelmaessige Werksverkehre.' },
    { firma: 'Speditions-Partner West', vorname: 'Tom', nachname: 'Berg', ort: 'Karlsruhe', status: 'interessent', notiz: 'Partner — Subunternehmer fuer Spitzenlasten.' },
  ],
  'IT & Technologie': [
    { firma: 'Steuerkanzlei Wolf & Partner', vorname: 'Andreas', nachname: 'Wolf', ort: 'Stuttgart', status: 'kunde', notiz: 'Managed-Service-Kunde — Support und Wartung.', telefon: '0711 445566' },
    { firma: 'Autohaus Digital', vorname: 'Sandra', nachname: 'Klein', ort: 'Ludwigsburg', status: 'kunde', notiz: 'Kunde mit SLA-Vertrag — Server und Clients.' },
    { firma: 'Startup NextCloud Solutions', vorname: 'Kevin', nachname: 'Frey', ort: 'Karlsruhe', status: 'interessent', notiz: 'Interessent — Anfrage fuer IT-Betreuung.', email: 'hallo@nextcloud-solutions.de' },
  ],
  'Energie & Umwelt': [
    { firma: 'Wohnbau Genossenschaft', vorname: 'Gerd', nachname: 'Maier', ort: 'Esslingen', status: 'kunde', notiz: 'Betreibt mehrere PV-Anlagen — Wartung und Monitoring.', telefon: '0711 778899' },
    { firma: 'Landwirt Sonnenhof', vorname: 'Klaus', nachname: 'Bauer', ort: 'Kirchheim', status: 'kunde', notiz: 'BHKW-Anlage — jaehrliche Wartung.' },
    { firma: 'Gemeinde Musterhausen', vorname: 'Birgit', nachname: 'Sommer', ort: 'Nuertingen', status: 'interessent', notiz: 'Interessent — Foerderprojekt geplant.' },
  ],
  'Immobilien & Verwaltung': [
    { firma: 'Eigentuemergemeinschaft Parkstrasse', vorname: 'Renate', nachname: 'Hartmann', ort: 'Stuttgart', status: 'kunde', notiz: 'WEG — Verwaltung und Betriebskostenabrechnung.', telefon: '0711 223344' },
    { firma: 'Vermietung Stadtmitte', vorname: 'Joerg', nachname: 'Weber', ort: 'Ludwigsburg', status: 'kunde', notiz: 'Mehrere Mietobjekte — Vertraege und Wartung.' },
    { firma: 'Kaufinteressent Wohnung', vorname: 'Melanie', nachname: 'Koch', ort: 'Fellbach', status: 'interessent', notiz: 'Interessent — Anfrage zu einem Expose.', email: 'm.koch@example.de' },
  ],
  'Marketing, Medien & Kreativ': [
    { firma: 'Mittelstand Maschinen GmbH', vorname: 'Holger', nachname: 'Schneider', ort: 'Stuttgart', status: 'kunde', notiz: 'Kunde — laufende Kampagne und Website-Pflege.', telefon: '0711 556600' },
    { firma: 'Genussmanufaktur Sued', vorname: 'Christine', nachname: 'Bauer', ort: 'Tuebingen', status: 'kunde', notiz: 'Projekt-Kunde — Rebranding und Social Media.' },
    { firma: 'Neukunde Praxis Dr. Lang', vorname: 'Markus', nachname: 'Lang', ort: 'Reutlingen', status: 'interessent', notiz: 'Interessent — Anfrage fuer neues Logo.', email: 'praxis@dr-lang.de' },
  ],
  'Recht, Steuern & Finanzen': [
    { firma: 'Handwerk Mueller e.K.', vorname: 'Josef', nachname: 'Mueller', ort: 'Boeblingen', status: 'kunde', notiz: 'Mandant — laufende Buchhaltung und Jahresabschluss.', telefon: '07031 334400' },
    { firma: 'Gastro Betriebe Sued GmbH', vorname: 'Elena', nachname: 'Popovic', ort: 'Stuttgart', status: 'kunde', notiz: 'Mandant — mehrere Betriebe, Lohn und Steuer.' },
    { firma: 'Gruender Interessent', vorname: 'Philipp', nachname: 'Arnold', ort: 'Esslingen', status: 'interessent', notiz: 'Interessent — Erstberatung zur Existenzgruendung.', email: 'p.arnold@example.de' },
  ],
  'Bildung & Wissenschaft': [
    { firma: 'Volkshochschule Musterstadt', vorname: 'Barbara', nachname: 'Frei', ort: 'Tuebingen', status: 'kunde', notiz: 'Kooperationspartner — gemeinsame Kursangebote.', telefon: '07071 445500' },
    { firma: 'Firma Weiterbildung intern', vorname: 'Dirk', nachname: 'Sommer', ort: 'Stuttgart', status: 'kunde', notiz: 'Firmenkunde — Inhouse-Schulungen fuer Mitarbeiter.' },
    { firma: 'Teilnehmer Interessent', vorname: 'Anja', nachname: 'Vogel', ort: 'Reutlingen', status: 'interessent', notiz: 'Interessent — Anfrage zu einem Kurstermin.', email: 'a.vogel@example.de' },
  ],
  'Gesundheit & Wellness': [
    { firma: 'Privatkundin Wellness', vorname: 'Claudia', nachname: 'Wagner', ort: 'Stuttgart', status: 'kunde', notiz: 'Stammkundin — bucht regelmaessig Behandlungen.', telefon: '0711 998877' },
    { firma: 'Firmen-Gesundheit Partner', vorname: 'Robert', nachname: 'Kern', ort: 'Ludwigsburg', status: 'kunde', notiz: 'Firmenkunde — Gesundheitstage fuer Mitarbeiter.' },
    { firma: 'Interessent Probetermin', vorname: 'Nina', nachname: 'Baumann', ort: 'Waiblingen', status: 'interessent', notiz: 'Interessent — moechte einen Probetermin.', email: 'n.baumann@example.de' },
  ],
  'Sport, Beauty & Lifestyle': [
    { firma: 'Mitglied Jahresabo', vorname: 'Tobias', nachname: 'Richter', ort: 'Stuttgart', status: 'kunde', notiz: 'Mitglied — Jahresabo, kommt regelmaessig.', telefon: '0711 112200' },
    { firma: 'Firmen-Kooperation Fitness', vorname: 'Sabrina', nachname: 'Lorenz', ort: 'Fellbach', status: 'kunde', notiz: 'Firmenpartner — verguenstigte Mitgliedschaften.' },
    { firma: 'Interessent Schnuppertraining', vorname: 'Marc', nachname: 'Adler', ort: 'Esslingen', status: 'interessent', notiz: 'Interessent — moechte ein Probetraining.', email: 'm.adler@example.de' },
  ],
  'Tiere': [
    { firma: 'Tierhalterin Stammkunde', vorname: 'Ingrid', nachname: 'Busch', ort: 'Tuebingen', status: 'kunde', notiz: 'Stammkundin — regelmaessige Kontrolltermine.', telefon: '07071 223300' },
    { firma: 'Zuchtbetrieb Waldblick', vorname: 'Harald', nachname: 'Stein', ort: 'Reutlingen', status: 'kunde', notiz: 'Kunde mit mehreren Tieren — Bestandsbetreuung.' },
    { firma: 'Neukunde Welpe', vorname: 'Laura', nachname: 'Fuchs', ort: 'Stuttgart', status: 'interessent', notiz: 'Interessent — erste Anfrage fuer einen Termin.', email: 'l.fuchs@example.de' },
  ],
  'Landwirtschaft, Garten & Forst': [
    { firma: 'Hofladen Kunde Sued', vorname: 'Ernst', nachname: 'Bauer', ort: 'Herrenberg', status: 'kunde', notiz: 'Abnehmer fuer Direktvermarktung — feste Wochenmengen.', telefon: '07032 445566' },
    { firma: 'Lohnunternehmen Feld & Wald', vorname: 'Walter', nachname: 'Schmid', ort: 'Nagold', status: 'kunde', notiz: 'Partner — uebernimmt Erntearbeiten im Lohn.' },
    { firma: 'Brennholz Interessent', vorname: 'Georg', nachname: 'Wild', ort: 'Calw', status: 'interessent', notiz: 'Interessent — Anfrage fuer Brennholz-Lieferung.' },
  ],
  'Dienstleistungen': [
    { firma: 'Buerogebaeude Verwaltung', vorname: 'Susanne', nachname: 'Graf', ort: 'Stuttgart', status: 'kunde', notiz: 'Kunde — wiederkehrende Dienstleistung nach Vertrag.', telefon: '0711 665544' },
    { firma: 'Filialbetrieb Handel', vorname: 'Martin', nachname: 'Herrmann', ort: 'Ludwigsburg', status: 'kunde', notiz: 'Grosskunde — mehrere Standorte im Einsatzplan.' },
    { firma: 'Interessent Angebot', vorname: 'Diana', nachname: 'Scholz', ort: 'Fellbach', status: 'interessent', notiz: 'Interessent — Anfrage fuer regelmaessigen Service.', email: 'd.scholz@example.de' },
  ],
  'Kultur, Soziales & Öffentliches': [
    { firma: 'Foerdermitglied aktiv', vorname: 'Helmut', nachname: 'Krueger', ort: 'Stuttgart', status: 'kunde', notiz: 'Aktives Mitglied — zahlt Jahresbeitrag, spendet regelmaessig.', telefon: '0711 334422' },
    { firma: 'Stiftung Partner', vorname: 'Christa', nachname: 'Behrens', ort: 'Tuebingen', status: 'kunde', notiz: 'Foerderpartner — unterstuetzt Veranstaltungen.' },
    { firma: 'Interessent Vereinsbeitritt', vorname: 'Paul', nachname: 'Winter', ort: 'Reutlingen', status: 'interessent', notiz: 'Interessent — moechte dem Verein beitreten.', email: 'p.winter@example.de' },
  ],
};

/** Beispiel-Kontakte zu einer Kategorie (Fallback: generische Kontakte). */
export function beispielKontakte(kategorie: string | null | undefined): BeispielKontakt[] {
  if (kategorie && kategorie in BEISPIEL_KONTAKTE) return BEISPIEL_KONTAKTE[kategorie];
  return GENERISCHE_KONTAKTE;
}

/**
 * Eine einzelne DB-Zeile fuer die kontakte-Tabelle bauen (mit owner + Markierung).
 * owner_user_id wird bewusst in dieser Payload-Variable gesetzt (nicht inline im
 * .insert()-Aufruf) — spart TS-Fallstricke und bleibt gut testbar.
 */
export function beispielZeile(k: BeispielKontakt, ownerId: string): Record<string, unknown> {
  return {
    owner_user_id: ownerId,
    vorname: k.vorname,
    nachname: k.nachname,
    firma: k.firma,
    ort: k.ort,
    telefon: k.telefon ?? null,
    email: k.email ?? null,
    status: k.status,
    quelle: BEISPIEL_QUELLE,
    notizen: k.notiz + ' · ' + BEISPIEL_HINWEIS,
  };
}

/** Alle DB-Zeilen fuer eine Kategorie bauen (fertig zum Insert). */
export function beispielZeilen(kategorie: string | null | undefined, ownerId: string): Record<string, unknown>[] {
  return beispielKontakte(kategorie).map((k) => beispielZeile(k, ownerId));
}
