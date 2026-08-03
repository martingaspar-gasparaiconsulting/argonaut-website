// ============================================================================
// ARGONAUT OS · lib/onboardingBereiche.ts — Bereiche fürs Abschluss-Zertifikat
//
// Auf dem Zertifikat steht NICHT jeder einzelne Onboarding-Schritt und auch
// nicht jedes einzelne Modul. Ein Kunde legt zum Beispiel Rechnung, Mahnwesen,
// GiloCode, E-Rechnung und Belegablage getrennt an — auf dem Zertifikat ist das
// EIN Bereich: „Rechnungswesen & Belege".
//
// Warum das wichtig ist: Das Zertifikat wandert weiter. Ein Mitarbeiter legt es
// bei einer Bewerbung bei, ein Chef zeigt es seinem Steuerberater. Es ist damit
// ein Aushängeschild für ARGONAUT — also muss dort eine saubere, professionelle
// Bereichsliste stehen, keine Aufzählung von Klickstrecken.
//
// Diese Datei ist die einzige Stelle, an der Schritt → Bereich abgebildet wird.
// Kommt ein neuer Onboarding-Schritt dazu, wird er hier eingetragen; fehlt er,
// greift der Titel des Schritts als Notnagel (siehe bereicheAus()).
//
// Keine Imports, keine Hooks — node-testbar, von Client UND Server nutzbar.
// ============================================================================

/**
 * Schritt-Schlüssel → Bereich, wie er aufs Zertifikat gedruckt wird.
 * Mehrere Schritte dürfen bewusst denselben Bereich ergeben — bereicheAus()
 * entfernt Dubletten.
 */
export const BEREICH_JE_SCHRITT: Record<string, string> = {
  // --- Universelle Grundschritte -------------------------------------------
  firma: 'Stammdaten & Firmenprofil',
  logo: 'Stammdaten & Firmenprofil',
  bank: 'Zahlungsverkehr & SEPA',
  zahlung: 'Zahlungsverkehr & SEPA',
  import: 'Datenübernahme & Import',
  kontakt: 'CRM & Kundenverwaltung',
  angebot: 'Angebots- & Auftragswesen',
  rechnung: 'Rechnungswesen & Belege',
  anschluesse: 'Schnittstellen & Anschlüsse',
  module: 'Team, Rollen & Rechte',

  // --- Handwerk & Bau -------------------------------------------------------
  hw_leistungen: 'Leistungskatalog & Kalkulation',
  hw_aufmass: 'Aufmaß & Massenermittlung',
  hw_lager: 'Material- & Lagerwirtschaft',
  hw_wartung: 'Wartungsverträge & Turnusplanung',

  // --- Industrie & Produktion ----------------------------------------------
  ind_maschinen: 'Betriebsdatenerfassung & OEE',
  ind_charge: 'Chargen & Rückverfolgbarkeit',
  ind_lager: 'Material- & Lagerwirtschaft',

  // --- Handel & E-Commerce --------------------------------------------------
  ha_sortiment: 'Sortiments- & Artikelverwaltung',
  ha_varianten: 'Varianten & Artikelmatrix',
  ha_bestand: 'Bestandsführung & Inventur',
  ha_kasse: 'Kassenführung (POS)',
  ha_bewertungen: 'Bewertungen & Reputation',

  // --- Fahrzeuge & Mobilität ------------------------------------------------
  fz_akte: 'Fahrzeugakte & Historie',
  fz_leistungen: 'Leistungskatalog & Kalkulation',
  fz_auftrag: 'Werkstattaufträge',

  // --- Gastronomie, Hotellerie & Tourismus ---------------------------------
  ga_speisekarte: 'Speisekarten & Artikelpflege',
  ga_zimmer: 'Zimmer & Housekeeping',
  ga_reservierung: 'Reservierung & Tischplanung',

  // --- Lebensmittel & Nahversorgung ----------------------------------------
  lm_etiketten: 'Etiketten & LMIV-Kennzeichnung',
  lm_rezeptur: 'Rezepturen & Kalkulation',
  lm_lager: 'Material- & Lagerwirtschaft',

  // --- Logistik & Transport -------------------------------------------------
  lo_fuhrpark: 'Fuhrpark & Fahrzeugakte',
  lo_tour: 'Tourenplanung & Disposition',
  lo_schicht: 'Schicht- & Personalplanung',

  // --- IT & Technologie -----------------------------------------------------
  it_assets: 'IT-Asset-Verwaltung',
  it_lizenzen: 'Lizenzverwaltung',
  it_vertraege: 'SLA- & Vertragsverwaltung',

  // --- Energie & Umwelt -----------------------------------------------------
  en_anlagen: 'Anlagen & Ertragsüberwachung',
  en_wartung: 'Wartungsverträge & Turnusplanung',
  en_foerder: 'Fördermittel & Nachweise',

  // --- Immobilien & Verwaltung ----------------------------------------------
  im_objekte: 'Objekt- & Einheitenverwaltung',
  im_vertraege: 'Mietverträge & Laufzeiten',
  im_bk: 'Betriebskostenabrechnung',

  // --- Marketing, Medien & Kreativ ------------------------------------------
  mk_kampagne: 'Kampagnensteuerung',
  mk_projekt: 'Projekt- & Aufgabensteuerung',
  mk_freigaben: 'Freigaben & Proofing',

  // --- Recht, Steuern & Finanzen --------------------------------------------
  re_akten: 'Akten- & Fristenverwaltung',
  re_mandanten: 'Mandantenverwaltung',
  re_datev: 'DATEV-Schnittstelle',

  // --- Bildung & Wissenschaft -----------------------------------------------
  bi_kurse: 'Kurs- & Seminarverwaltung',
  bi_raeume: 'Raum- & Ressourcenplanung',
  bi_buchung: 'Online-Buchung & Terminvergabe',

  // --- Gesundheit & Wellness ------------------------------------------------
  ge_buchung: 'Online-Buchung & Terminvergabe',
  ge_leistungen: 'Kurs- & Leistungsverwaltung',
  ge_erinnerung: 'Automatische Erinnerungen',

  // --- Sport, Beauty & Lifestyle --------------------------------------------
  sp_mitglieder: 'Mitglieder- & Aboverwaltung',
  sp_buchung: 'Online-Buchung & Terminvergabe',
  sp_gutscheine: 'Gutscheine & Wertkarten',

  // --- Tiere ----------------------------------------------------------------
  ti_buchung: 'Online-Buchung & Terminvergabe',
  ti_bestand: 'Tierbestand & Nachweise',
  ti_erinnerung: 'Automatische Erinnerungen',

  // --- Landwirtschaft, Garten & Forst ---------------------------------------
  la_schlaege: 'Schlagkartei & Flächenverwaltung',
  la_ernte: 'Ernte & Direktvermarktung',
  la_tier: 'Tierbestand & Nachweise',
  la_holz: 'Forst- & Brennholzverwaltung',

  // --- Dienstleistungen -----------------------------------------------------
  di_leistungen: 'Leistungs- & Aufwandserfassung',
  di_einsaetze: 'Einsatzplanung & Disposition',
  di_wiederkehr: 'Wiederkehrende Aufträge & Abos',

  // --- Kultur, Soziales & Öffentliches --------------------------------------
  ku_mitglieder: 'Mitglieder- & Aboverwaltung',
  ku_events: 'Veranstaltungsmanagement',
  ku_spenden: 'Spendenverwaltung & Zuwendungen',
};

/**
 * Macht aus den erledigten Schritten die Bereichsliste fürs Zertifikat:
 * gebündelt, ohne Dubletten, in der Reihenfolge der Startstrecke.
 *
 * Ein unbekannter Schlüssel fällt auf den Titel des Schritts zurück — so steht
 * auch bei einem neu hinzugefügten Schritt nie eine Lücke auf dem Dokument.
 */
export function bereicheAus(schritte: Array<{ key: string; titel: string }>): string[] {
  const gesehen = new Set<string>();
  const raus: string[] = [];
  for (const s of schritte) {
    const b = (BEREICH_JE_SCHRITT[s.key] || s.titel || '').trim();
    if (!b || gesehen.has(b)) continue;
    gesehen.add(b);
    raus.push(b);
  }
  return raus;
}
