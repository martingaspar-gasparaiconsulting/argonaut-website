// ============================================================================
// ARGONAUT OS · lib/onboardingBranchen.ts — Branchen-Schritte fürs Onboarding
//
// Erweitert die geführte Startstrecke (/dashboard/onboarding) branchenaware:
// hinter die universellen Schritte kommen die passenden Branchenschritte.
// Schlüssel = exakt die 19 Kategorie-Strings aus branchenkatalog.ts
// (KATEGORIE_MODULE), so wie sie in profiles.kategorie gespeichert sind.
//
// Jeder Schritt trägt einen anfängerfreundlichen `tipp` („So geht's").
// `tabelle` (optional) = Auto-Erkennung: liegt >0 Zeile vor, gilt der Schritt
// als erledigt. Fehlt/unbekannt die Tabelle, ist der Schritt manuell abhakbar
// (die Abfrage ist im Page-Code fehlertolerant).
//
// Keine Imports, keine Hooks — node-testbar, von Client + Server nutzbar.
// ============================================================================

export type BranchenSchritt = {
  key: string;        // eindeutig je Kategorie; landet als schritt_key in onboarding_schritte
  icon: string;
  titel: string;
  text: string;       // Kurzbeschreibung
  tipp: string;       // anfängerfreundliche Anleitung („So geht's")
  link: string;       // Zielmodul
  tabelle?: string;   // optionale Auto-Erkennung
  optional?: boolean;
};

const importTipp = 'Viele Daten müssen Sie nicht abtippen: Im 📥 Import-Center laden Sie die passende CSV-Vorlage, füllen sie aus und spielen sie ein.';

export const BRANCHEN_SCHRITTE: Record<string, BranchenSchritt[]> = {
  'Handwerk & Bau': [
    { key: 'hw_leistungen', icon: '🧰', titel: 'Leistungskatalog anlegen', text: 'Ihre Standard-Leistungen mit Preisen.', tipp: 'Öffnen Sie den Leistungskatalog und tragen Sie Ihre typischen Arbeiten mit Einheit und Preis ein. Danach klicken Sie Angebote in Sekunden zusammen, statt jedes Mal neu zu tippen.', link: '/dashboard/leistungskatalog' },
    { key: 'hw_aufmass', icon: '📐', titel: 'Erstes Aufmaß erfassen', text: 'Maße direkt auf der Baustelle aufnehmen.', tipp: 'Legen Sie im Aufmaß-Modul Ihr erstes Projekt an und tragen Sie Räume/Positionen ein. Aus dem Aufmaß wird später direkt ein Angebot.', link: '/dashboard/aufmass' },
    { key: 'hw_lager', icon: '📦', titel: 'Material ins Lager', text: 'Wichtigstes Material anlegen.', tipp: 'Tragen Sie Ihr häufigstes Material im ERP/Lager ein — oder importieren Sie es. ' + importTipp, link: '/dashboard/erp', tabelle: 'artikel' },
    { key: 'hw_wartung', icon: '🔧', titel: 'Wartungsvertrag anlegen', text: 'Wiederkehrende Wartungen einrichten.', tipp: 'Haben Sie wiederkehrende Wartungen? Legen Sie einen Wartungsvertrag an — ARGONAUT erinnert Sie automatisch und erzeugt die Rechnung.', link: '/dashboard/wartung', tabelle: 'wartungsvertraege', optional: true },
  ],
  'Industrie & Produktion': [
    { key: 'ind_maschinen', icon: '📟', titel: 'Maschinen erfassen', text: 'Maschinen für die Betriebsdatenerfassung.', tipp: 'Legen Sie Ihre Maschinen im BDE-Modul an (Bezeichnung + Ideal-Takt). Danach können Sie Schichten buchen und sehen die OEE.', link: '/dashboard/bde', tabelle: 'bde_maschine' },
    { key: 'ind_charge', icon: '🔬', titel: 'Erste Charge/Serie anlegen', text: 'Rückverfolgbarkeit starten.', tipp: 'Legen Sie ein Los im Chargen-Modul an. So können Sie bei Bedarf lückenlos zurückverfolgen, was wohin ging.', link: '/dashboard/chargen', tabelle: 'charge_los' },
    { key: 'ind_lager', icon: '📦', titel: 'Material/Artikel ins Lager', text: 'Vormaterial und Teile anlegen.', tipp: 'Tragen Sie Ihr Vormaterial im ERP/Lager ein oder importieren Sie es. ' + importTipp, link: '/dashboard/erp', tabelle: 'artikel' },
  ],
  'Handel & E-Commerce': [
    { key: 'ha_sortiment', icon: '📦', titel: 'Sortiment anlegen', text: 'Ihre Artikel mit Preisen.', tipp: 'Legen Sie Ihre Artikel im ERP/Lager an — Bezeichnung, Preis, Bestand. Wenig Zeit? ' + importTipp, link: '/dashboard/erp', tabelle: 'artikel' },
    { key: 'ha_varianten', icon: '🧩', titel: 'Varianten-Matrix aufbauen', text: 'Größen/Farben je Artikel.', tipp: 'Wenn ein Artikel in Varianten kommt (z. B. Größe × Farbe), legen Sie im Varianten-Modul eine Matrix an — ARGONAUT erzeugt daraus alle einzelnen SKUs auf einen Klick.', link: '/dashboard/varianten', tabelle: 'variante_gruppe' },
    { key: 'ha_bestand', icon: '📥', titel: 'Anfangsbestand importieren', text: 'Lagerbestand einspielen.', tipp: 'Statt alles abzutippen: Im Import-Center die Artikel-Vorlage laden, ausfüllen, hochladen. Ihr Bestand ist in Minuten drin.', link: '/dashboard/import' },
    { key: 'ha_kasse', icon: '🧾', titel: 'Kasse einrichten', text: 'Verkauf am Tresen.', tipp: 'Öffnen Sie die Kasse und machen Sie einen Test-Verkauf. Der Verkauf bucht den Bestand automatisch ab.', link: '/dashboard/kasse', optional: true },
    { key: 'ha_bewertungen', icon: '⭐', titel: 'Bewertungen aktivieren', text: 'Kundenstimmen einsammeln.', tipp: 'Aktivieren Sie Bewertungen, damit zufriedene Kunden Ihnen automatisch eine Bewertung hinterlassen können — gut für den Shop.', link: '/dashboard/bewertungen', optional: true },
  ],
  'Fahrzeuge & Mobilität': [
    { key: 'fz_akte', icon: '📇', titel: 'Fahrzeugakte anlegen', text: 'Kundenfahrzeuge erfassen.', tipp: 'Legen Sie das erste Kundenfahrzeug per Kennzeichen/FIN an. Historie, Termine und Aufträge hängen danach automatisch dran.', link: '/dashboard/fahrzeugakte' },
    { key: 'fz_leistungen', icon: '🧰', titel: 'Werkstatt-Leistungen', text: 'Standard-Arbeiten mit Preisen.', tipp: 'Tragen Sie Ihre typischen Werkstatt-Leistungen mit Preisen in den Leistungskatalog ein — spart Zeit bei jedem Auftrag.', link: '/dashboard/leistungskatalog' },
    { key: 'fz_auftrag', icon: '🔨', titel: 'Ersten Werkstatt-Auftrag', text: 'Auftrag durchspielen.', tipp: 'Legen Sie einen Werkstatt-Auftrag an und hängen Sie Positionen + Material dran. Am Ende wird daraus die Rechnung.', link: '/dashboard/werkstatt' },
  ],
  'Gastronomie, Hotellerie & Tourismus': [
    { key: 'ga_speisekarte', icon: '🍽', titel: 'Speisekarte anlegen', text: 'Gerichte mit Preis + Allergenen.', tipp: 'Tragen Sie Ihre Gerichte mit Preis und Allergenen ein. ARGONAUT baut Ihnen daraus eine saubere Speisekarte als PDF. ' + importTipp, link: '/dashboard/housekeeping', tabelle: 'menu_gericht' },
    { key: 'ga_zimmer', icon: '🛎️', titel: 'Zimmer/Housekeeping', text: 'Zimmerstatus im Blick.', tipp: 'Legen Sie Ihre Zimmer an, um Reinigung und Abreisen zu steuern. Nur für Beherbergung nötig.', link: '/dashboard/housekeeping', tabelle: 'hk_zimmer', optional: true },
    { key: 'ga_reservierung', icon: '🪑', titel: 'Reservierung einrichten', text: 'Tische/Plätze reservierbar machen.', tipp: 'Legen Sie Ihre Tische/Plätze an, dann können Sie Reservierungen sauber verwalten.', link: '/dashboard/reservierung', optional: true },
  ],
  'Lebensmittel & Nahversorgung': [
    { key: 'lm_etiketten', icon: '🏷️', titel: 'Etiketten & LMIV', text: 'Kennzeichnung nach Vorschrift.', tipp: 'Legen Sie Ihre Produkte mit Zutaten, Allergenen und Nährwerten an — ARGONAUT erzeugt LMIV-konforme Etiketten. ' + importTipp, link: '/dashboard/etiketten', tabelle: 'etikett_produkt' },
    { key: 'lm_rezeptur', icon: '🧮', titel: 'Rezepturen anlegen', text: 'Ausbeute & Wareneinsatz.', tipp: 'Tragen Sie Ihre Rezepturen ein — daraus berechnet ARGONAUT Ausbeute, Wareneinsatz und Kalkulation.', link: '/dashboard/rezeptur', tabelle: 'rezepturen' },
    { key: 'lm_lager', icon: '📦', titel: 'Artikel/Lager', text: 'Waren anlegen.', tipp: 'Tragen Sie Ihre Waren im ERP/Lager ein oder importieren Sie sie. ' + importTipp, link: '/dashboard/erp', tabelle: 'artikel' },
  ],
  'Logistik & Transport': [
    { key: 'lo_fuhrpark', icon: '📇', titel: 'Fuhrpark erfassen', text: 'Fahrzeuge anlegen.', tipp: 'Legen Sie Ihre Fahrzeuge an — mit Prüf-/Wartungsfristen behalten Sie TÜV & Co. im Blick.', link: '/dashboard/fahrzeugakte' },
    { key: 'lo_tour', icon: '🚚', titel: 'Erste Tour planen', text: 'Stopps und Route.', tipp: 'Planen Sie eine Tour mit ein paar Stopps. Der Fahrer bestätigt die Zustellung per Unterschrift (ePOD).', link: '/dashboard/tour' },
    { key: 'lo_schicht', icon: '🗓', titel: 'Schichtplan aufsetzen', text: 'Fahrer einteilen.', tipp: 'Tragen Sie Ihre Fahrer und Schichten ein, um die Einsätze sauber zu planen.', link: '/dashboard/schichtplan', optional: true },
  ],
  'IT & Technologie': [
    { key: 'it_assets', icon: '🖥️', titel: 'Assets erfassen', text: 'Hardware je Kunde.', tipp: 'Legen Sie die Geräte Ihrer Kunden an. ' + importTipp, link: '/dashboard/itassets', tabelle: 'it_asset' },
    { key: 'it_lizenzen', icon: '🔑', titel: 'Lizenzen anlegen', text: 'Software-Lizenzen + Ablauf.', tipp: 'Tragen Sie Software-Lizenzen mit Plätzen und Ablaufdatum ein — ARGONAUT warnt vor Ablauf und Überbuchung.', link: '/dashboard/itassets' },
    { key: 'it_vertraege', icon: '📑', titel: 'SLA/Verträge', text: 'Service-Verträge hinterlegen.', tipp: 'Hinterlegen Sie Ihre SLA-/Service-Verträge, damit Reaktionszeiten und Abrechnung stimmen.', link: '/dashboard/vertraege', tabelle: 'vertraege', optional: true },
  ],
  'Energie & Umwelt': [
    { key: 'en_anlagen', icon: '☀️', titel: 'Anlagen erfassen', text: 'PV/BHKW/Wind anlegen.', tipp: 'Legen Sie Ihre Anlagen mit Nennleistung an. Danach tragen Sie Ablesungen ein und sehen Soll-Erreichung + Erlös. ' + importTipp, link: '/dashboard/ertraege', tabelle: 'ertrag_anlage' },
    { key: 'en_wartung', icon: '🔧', titel: 'Wartung planen', text: 'Wartungszyklen.', tipp: 'Richten Sie Wartungsverträge/-zyklen ein — ARGONAUT erinnert automatisch.', link: '/dashboard/wartung', tabelle: 'wartungsvertraege', optional: true },
    { key: 'en_foerder', icon: '💰', titel: 'Fördermittel prüfen', text: 'Zuschüsse im Blick.', tipp: 'Schauen Sie im Fördermittel-Modul, welche Programme passen, und verwalten Sie Nachweis-Fristen.', link: '/dashboard/foerdermittel', optional: true },
  ],
  'Immobilien & Verwaltung': [
    { key: 'im_objekte', icon: '🏛', titel: 'Objekte/Einheiten anlegen', text: 'Gebäude und Einheiten.', tipp: 'Legen Sie Ihre Objekte/Einheiten an — sie sind die Basis für Verträge, Betriebskosten und Wartung. ' + importTipp, link: '/dashboard/objekte', tabelle: 'assets' },
    { key: 'im_vertraege', icon: '📑', titel: 'Mietverträge', text: 'Verträge hinterlegen.', tipp: 'Tragen Sie Ihre Miet-/Verwalterverträge ein — Laufzeiten und Wiederkehr laufen dann automatisch.', link: '/dashboard/vertraege', tabelle: 'vertraege' },
    { key: 'im_bk', icon: '🧾', titel: 'Betriebskosten-Einheiten', text: 'Für die Abrechnung.', tipp: 'Legen Sie die Mieteinheiten an, damit die Betriebskostenabrechnung sauber verteilt. ' + importTipp, link: '/dashboard/betriebskosten', optional: true },
  ],
  'Marketing, Medien & Kreativ': [
    { key: 'mk_kampagne', icon: '📣', titel: 'Erste Kampagne anlegen', text: 'Ziel + Kanäle.', tipp: 'Legen Sie eine Kampagne an oder lassen Sie den KI-Strategen aus einem Ziel gleich einen kompletten Plan bauen.', link: '/dashboard/marketing' },
    { key: 'mk_projekt', icon: '📁', titel: 'Projekt anlegen', text: 'Kundenprojekt starten.', tipp: 'Starten Sie Ihr erstes Kundenprojekt — Aufgaben, Zeiten und Abrechnung hängen daran.', link: '/dashboard/projekte', tabelle: 'projekte' },
    { key: 'mk_freigaben', icon: '✅', titel: 'Freigaben/Proofing', text: 'Design-Abnahmen.', tipp: 'Nutzen Sie Freigaben & Proofing, damit Kunden Entwürfe sauber abnehmen — mit Versionshistorie.', link: '/dashboard/freigaben', tabelle: 'proof_asset', optional: true },
  ],
  'Recht, Steuern & Finanzen': [
    { key: 're_akten', icon: '⚖️', titel: 'Akten & Fristen', text: 'Mandate mit Fristen.', tipp: 'Legen Sie Ihre Akten mit Fristen an — die Fristen-Ampel warnt rechtzeitig. ' + importTipp, link: '/dashboard/fristen' },
    { key: 're_mandanten', icon: '🤝', titel: 'Mandanten erfassen', text: 'Kontakte ins CRM.', tipp: 'Tragen Sie Ihre Mandanten ins CRM ein. ' + importTipp, link: '/dashboard/crm', tabelle: 'kontakte' },
    { key: 're_datev', icon: '📊', titel: 'DATEV einrichten', text: 'Export vorbereiten.', tipp: 'Richten Sie den DATEV-Export ein, damit die Übergabe an die Buchhaltung reibungslos läuft.', link: '/dashboard/datev', optional: true },
  ],
  'Bildung & Wissenschaft': [
    { key: 'bi_kurse', icon: '🎓', titel: 'Kurse anlegen', text: 'Kursangebot aufbauen.', tipp: 'Legen Sie Ihre Kurse mit Terminen und Plätzen an — Teilnehmer und Warteliste laufen automatisch. ' + importTipp, link: '/dashboard/bildung', tabelle: 'bildung_kurse' },
    { key: 'bi_raeume', icon: '🏫', titel: 'Räume anlegen', text: 'Räume/Ressourcen.', tipp: 'Tragen Sie Ihre Räume ein, um Belegungen ohne Doppelbuchung zu planen.', link: '/dashboard/raeume', tabelle: 'raum_ressource' },
    { key: 'bi_buchung', icon: '🌐', titel: 'Online-Buchung', text: 'Selbstbuchung für Teilnehmer.', tipp: 'Aktivieren Sie die Online-Buchung, damit sich Teilnehmer selbst anmelden können.', link: '/dashboard/online-buchung', optional: true },
  ],
  'Gesundheit & Wellness': [
    { key: 'ge_buchung', icon: '🌐', titel: 'Online-Buchung einrichten', text: 'Termine selbst buchbar.', tipp: 'Aktivieren Sie die Online-Buchung mit Ihren Zeiten — Kunden buchen dann selbst.', link: '/dashboard/online-buchung' },
    { key: 'ge_leistungen', icon: '🎓', titel: 'Leistungen/Kurse', text: 'Angebot hinterlegen.', tipp: 'Tragen Sie Ihre Behandlungen/Kurse mit Dauer und Preis ein.', link: '/dashboard/bildung', optional: true },
    { key: 'ge_erinnerung', icon: '🔔', titel: 'Erinnerungen aktivieren', text: 'Weniger No-Shows.', tipp: 'Richten Sie Termin-Erinnerungen ein — das senkt Ausfälle spürbar.', link: '/dashboard/erinnerungen', optional: true },
  ],
  'Sport, Beauty & Lifestyle': [
    { key: 'sp_mitglieder', icon: '👥', titel: 'Mitglieder/Abos', text: 'Mitgliedschaften verwalten.', tipp: 'Legen Sie Ihre Mitglieder mit Abo an — Beiträge und Wiederkehr laufen automatisch. ' + importTipp, link: '/dashboard/mitglieder', tabelle: 'mitglieder' },
    { key: 'sp_buchung', icon: '🌐', titel: 'Online-Buchung', text: 'Kurse/Termine buchbar.', tipp: 'Aktivieren Sie die Online-Buchung, damit Kunden Kurse/Termine selbst buchen.', link: '/dashboard/online-buchung' },
    { key: 'sp_gutscheine', icon: '🎁', titel: 'Gutscheine', text: 'Wertgutscheine verkaufen.', tipp: 'Richten Sie Gutscheine ein — beliebtes Zusatzgeschäft, besonders saisonal.', link: '/dashboard/gutscheine', optional: true },
  ],
  'Tiere': [
    { key: 'ti_buchung', icon: '🌐', titel: 'Online-Buchung', text: 'Termine selbst buchbar.', tipp: 'Aktivieren Sie die Online-Buchung mit Ihren Sprechzeiten.', link: '/dashboard/online-buchung' },
    { key: 'ti_bestand', icon: '🐄', titel: 'Tierbestand anlegen', text: 'Tiere/Gruppen erfassen.', tipp: 'Tragen Sie Ihren Tierbestand ein. ' + importTipp, link: '/dashboard/tierbestand', optional: true },
    { key: 'ti_erinnerung', icon: '🔔', titel: 'Erinnerungen', text: 'Impf-/Kontrolltermine.', tipp: 'Richten Sie Erinnerungen ein, damit Impf- und Kontrolltermine nicht durchrutschen.', link: '/dashboard/erinnerungen', optional: true },
  ],
  'Landwirtschaft, Garten & Forst': [
    { key: 'la_schlaege', icon: '🌾', titel: 'Schläge anlegen', text: 'Feldstücke erfassen.', tipp: 'Legen Sie Ihre Schläge/Feldstücke an — Basis für Düngung, PSM und Nachweise. ' + importTipp, link: '/dashboard/schlagkartei' },
    { key: 'la_ernte', icon: '🧺', titel: 'Direktvermarktung starten', text: 'Produkte + Markttage.', tipp: 'Tragen Sie Ihre Produkte ein und erfassen Sie Ernte + Markttage — ARGONAUT rechnet Tageserlöse aus. ' + importTipp, link: '/dashboard/ernte', tabelle: 'markt_produkt', optional: true },
    { key: 'la_tier', icon: '🐄', titel: 'Tierbestand', text: 'Falls Tierhaltung.', tipp: 'Nur bei Tierhaltung nötig: Tragen Sie Ihren Bestand ein.', link: '/dashboard/tierbestand', optional: true },
    { key: 'la_holz', icon: '🪵', titel: 'Brennholz/Forst', text: 'Falls Holzverkauf.', tipp: 'Nur bei Holzverkauf: Legen Sie Ihr Sortiment im Brennholz-Modul an.', link: '/dashboard/holz', optional: true },
  ],
  'Dienstleistungen': [
    { key: 'di_leistungen', icon: '⏱', titel: 'Leistungen/Aufwand', text: 'Erbrachte Leistungen erfassen.', tipp: 'Erfassen Sie Ihre Leistungen/Zeiten — das Aufwand-Cockpit zeigt, was noch abzurechnen ist.', link: '/dashboard/aufwand' },
    { key: 'di_einsaetze', icon: '🗺', titel: 'Einsätze/Dispo', text: 'Termine beim Kunden.', tipp: 'Planen Sie Ihre Außeneinsätze im Dispo-Board — der Monteur sieht sie auf dem Handy.', link: '/dashboard/dispo', optional: true },
    { key: 'di_wiederkehr', icon: '🔁', titel: 'Wiederkehr einrichten', text: 'Regelmäßige Erlöse.', tipp: 'Wiederkehrende Aufträge? Richten Sie sie ein — Rechnungen entstehen dann automatisch.', link: '/dashboard/wiederkehr', optional: true },
  ],
  'Kultur, Soziales & Öffentliches': [
    { key: 'ku_mitglieder', icon: '👥', titel: 'Mitglieder anlegen', text: 'Mitgliederverwaltung.', tipp: 'Legen Sie Ihre Mitglieder mit Beiträgen an. ' + importTipp, link: '/dashboard/mitglieder', tabelle: 'mitglieder' },
    { key: 'ku_events', icon: '🎫', titel: 'Veranstaltung anlegen', text: 'Events mit Anmeldung.', tipp: 'Legen Sie Ihre erste Veranstaltung an — Anmeldungen, Warteliste und Einnahmen laufen automatisch. ' + importTipp, link: '/dashboard/veranstaltungen', tabelle: 'event_veranstaltung' },
    { key: 'ku_spenden', icon: '❤️', titel: 'Spenden erfassen', text: 'Zuwendungen + Bescheinigung.', tipp: 'Erfassen Sie Spenden — ARGONAUT erstellt die Zuwendungsbestätigung.', link: '/dashboard/spenden', tabelle: 'spenden', optional: true },
  ],
};

/** Branchenschritte zu einer Kategorie (leer, wenn unbekannt/nicht gesetzt). */
export function branchenSchritte(kategorie: string | null | undefined): BranchenSchritt[] {
  if (!kategorie) return [];
  return BRANCHEN_SCHRITTE[kategorie] ?? [];
}

/** Ist für diese Kategorie ein Branchen-Onboarding hinterlegt? */
export function hatBranchenOnboarding(kategorie: string | null | undefined): boolean {
  return !!kategorie && kategorie in BRANCHEN_SCHRITTE;
}

/** Alle hinterlegten Kategorie-Schlüssel. */
export function onboardingKategorien(): string[] {
  return Object.keys(BRANCHEN_SCHRITTE);
}
