// ============================================================================
// ARGONAUT OS · lib/sicherungTabellen.ts — F8 (26.09.2026)
//
// Welche Tabellen die Datensicherung einsammelt. Bis F8 waren es 8 Bereiche,
// die Seite sprach aber von „Ihren kompletten Daten". Jetzt: ALLE Tabellen mit
// owner_user_id laut Supabase-Befund docs/b1-befund.csv (25.09.2026), bis auf
// Zugangsdaten und Geheimnisse (Bank-, ELSTER-, Mail-, Social-, Versand-
// Zugaenge, API-Schluessel, Integrationen). Die gehoeren nicht in eine Datei,
// die auf dem Rechner, im Mail-Anhang oder auf einem USB-Stick landet.
//
// Neue Tabellen: hier ergaenzen. Der Test tests/fPaket.test.mjs prueft, dass
// keine Zugangsdaten-Tabelle hineinrutscht.
// ============================================================================

/** Die Hauptbereiche — eigene, sprechende Blattnamen, in dieser Reihenfolge. */
export const HAUPT_BEREICHE: { table: string; blatt: string; label: string }[] = [
  { table: 'kontakte', blatt: 'Kunden', label: '🧭 Kunden & Kontakte' },
  { table: 'leads', blatt: 'Anfragen', label: '🎯 Anfragen & Leads' },
  { table: 'angebote', blatt: 'Angebote', label: '🗒 Angebote' },
  { table: 'auftraege', blatt: 'Auftraege', label: '📋 Aufträge' },
  { table: 'rechnungen', blatt: 'Rechnungen', label: '🧾 Rechnungen' },
  { table: 'eingangsbelege', blatt: 'Ausgaben', label: '💶 Ausgaben & Belege' },
  { table: 'projekte', blatt: 'Projekte', label: '📁 Projekte' },
  { table: 'termine', blatt: 'Termine', label: '🗓 Termine' },
];

/** Alle weiteren Tabellen des Betriebs (Blattname = Tabellenname). */
export const WEITERE_TABELLEN: string[] = [
  'abo_rechnungen', 'abteilungen', 'academy_fortschritt', 'academy_kurse_eigen',
  'academy_medaillen', 'ads_ergebnis', 'ads_kampagne', 'ads_kanal', 'ads_schaltung',
  'agentur_retainer', 'agentur_zeiten', 'agrar_massnahmen', 'agrar_schlaege', 'anfahrt_konfig',
  'angebot_bundle', 'angebot_positionen', 'anlagegueter', 'artikel', 'artikel_bestand_standort',
  'artikel_standorte', 'asset_gruppen', 'assets', 'audit_log', 'aufgaben', 'aufgaben_kommentare',
  'aufmass_positionen', 'aufmasse', 'auftrag_positionen', 'ausgaben', 'ausschreibung',
  'ausschreibung_profil', 'automation_log', 'automation_regeln', 'autoresponder_lauf',
  'autoresponder_schritt', 'autoresponder_sequenz', 'autoresponder_versand', 'bau_abnahmen',
  'bau_gewaehrleistung', 'bau_lv', 'bau_lv_positionen', 'bau_maengelruege', 'bau_nachtrag',
  'bau_plan', 'bau_plan_pin', 'baustellen_fotos', 'bautagebuch', 'bde_buchung', 'bde_maschine',
  'bde_stoerung', 'belege', 'belegung_einheit', 'belegung_vorgang', 'benachrichtigungen',
  'bestellpositionen', 'bestellung', 'bestellung_position', 'bestellungen', 'betriebs_standort',
  'bewerber', 'bewertungsanfragen', 'bfsg_angaben', 'bildung_anmeldungen', 'bildung_anwesenheit',
  'bildung_honorar', 'bildung_kurse', 'bildung_termine', 'bk_abrechnung', 'bk_einheit',
  'bk_kostenart', 'buchungen', 'charge_los', 'charge_merkmal', 'charge_pruefung',
  'charge_verwendung', 'chat_tarif', 'chat_verbrauch', 'crm_deal', 'document_standorte',
  'dsgvo_anfragen', 'dsgvo_loeschungen', 'dsgvo_verfahren', 'eigenes_feld', 'eigenes_feld_wert',
  'einsaetze', 'einsatz_fotos', 'einsatz_positionen', 'energie_ablesungen', 'energie_anlagen',
  'erechnung_archiv', 'erinnerung', 'ernte_ernte', 'ertrag_ablesung', 'ertrag_anlage',
  'etikett_produkt', 'event_anmeldung', 'event_veranstaltung', 'expose', 'expose_interessent',
  'fahrtkosten_staffel', 'fahrzeug_eintrag', 'fahrzeuge', 'fertigung_auftraege',
  'fertigung_stueckliste_positionen', 'fertigung_stuecklisten', 'finanz_szenarien', 'firmen',
  'foerder_angebote', 'foerder_beleg', 'foerder_vorhaben', 'formular_eintrag', 'formular_vorlage',
  'forst_auftrag', 'forst_auftrag_position', 'forst_baeume', 'forst_einsatzmittel',
  'forst_gutachten', 'forst_nachweis', 'forst_objekte', 'freebie', 'freebie_lead', 'freebie_mail',
  'freebie_versand', 'freistellungen', 'gastro_reservierungen', 'gastro_trinkgeld', 'gefahrstoff',
  'geo_routen', 'geraet_ereignis', 'gespraech_protokoll', 'gesundheit_freigabe',
  'gesundheit_notiz', 'gesundheit_zugriff', 'gobd_verfahrensdoku', 'gutachten',
  'gutachten_position', 'gutschein', 'gutschein_einloesung', 'hilfsmittel_position',
  'hilfsmittel_versorgung', 'hk_zimmer', 'holz_auftraege', 'holz_auftrag_positionen',
  'holz_mengenrabatt', 'holz_preise', 'holz_sortiment', 'hotel_belegungen', 'hotel_zimmer',
  'hr_abwesenheiten', 'hr_benachrichtigungen', 'hr_checklisten', 'hr_checklisten_abschluss',
  'hr_checklisten_vorlagen', 'hr_dokumente', 'hr_einstellungen', 'hr_schicht_bestaetigung',
  'hr_schicht_tausch', 'hr_schicht_vorlagen', 'hr_schichten', 'hr_schulungen',
  'hr_zeit_korrekturen', 'hr_zeiterfassung', 'immo_einheiten', 'immo_kaution',
  'immo_mietanpassung', 'immo_mietvertraege', 'immo_schaden', 'immo_zahlungen', 'import_jobs',
  'import_laeufe', 'import_zeilen', 'inhalt_baustein', 'inventar', 'inventur_audit',
  'inventur_zaehlung', 'it_asset', 'it_assets', 'it_lizenz', 'it_sla', 'it_vertraege',
  'kalkulationen', 'kalkulator_normen', 'kanzlei_akte', 'kanzlei_frist', 'kanzlei_fristen',
  'kanzlei_mandate', 'kassen_belege', 'kassen_meldung', 'kassen_positionen', 'kfz_fahrzeuge',
  'kfz_reifeneinlagerung', 'kfz_schadenfall', 'ki_batch', 'kontakt_aktivitaeten',
  'kontakt_tag_zuordnung', 'kontakt_tags', 'korrespondenz', 'kunden_mandate', 'lager_bewegung',
  'lager_umlagerung', 'lagerbewegungen', 'landingpages', 'leistungskatalog',
  'leistungskatalog_standorte', 'leitungsrolle_eigen', 'lieferant', 'lieferanten',
  'lieferanten_standorte', 'lm_chargen', 'lm_haccp', 'lm_haccp_plan', 'logistik_sendungen',
  'logistik_touren', 'lp_ereignisse', 'maengel', 'mahnung_historie', 'mail_klick',
  'marketing_inhalte', 'marketing_kalender', 'marketing_kampagnen', 'marketing_segment',
  'marketing_zielgruppen', 'markt_produkt', 'markt_verkauf', 'material_abruf', 'menu_gericht',
  'mitarbeiter', 'mitarbeiter_qualifikation', 'mitarbeiter_rechte', 'mitarbeiter_standorte',
  'mitglied_checkin', 'mitglieder', 'modul_nutzung', 'nachkauf_produkt', 'nachkauf_verkauf',
  'nachweis', 'nachweis_unterschrift', 'newsletter_ab_test', 'newsletter_abonnenten',
  'newsletter_versand', 'objekt_zeiten', 'objekte', 'onboarding_schritte', 'paket_positionen',
  'pakete', 'personal_entsendung', 'personal_vertrag', 'portal_dokument', 'portal_freigabe',
  'portal_meldung', 'portal_projekt', 'post_vorgang', 'praxis_ausfall', 'praxis_einwilligung',
  'praxis_recall', 'preis_historie', 'projekt_beteiligte', 'projekt_kosten', 'projekt_teams',
  'projekt_vorlagen', 'projektleistungen', 'proof_asset', 'proof_feedback', 'proof_version',
  'provision_partner', 'provision_zuordnung', 'pruef_protokoll', 'pruef_punkt', 'pruefpflichten',
  'qs_lieferant_bewertung', 'qs_reklamation', 'qs_rueckruf', 'raum_belegung', 'raum_ressource',
  'rechnung_abschlaege', 'rechnung_nummernkreise', 'rechnung_positionen', 'reisekosten',
  'report_gespeichert', 'reservierung_platz', 'reservierung_vorgang', 'ressourcen',
  'rezeptur_zutaten', 'rezepturen', 'rueckhol_lauf', 'rueckhol_schritt', 'rueckhol_strecke',
  'rueckhol_versand', 'schlag', 'schlag_bedarf', 'schlag_duengung', 'schlag_psm',
  'shop_bestellungen', 'shop_retoure', 'signatur_anfragen', 'social_beitrag', 'social_kanal',
  'social_versand', 'social_video', 'sofortmeldungen', 'spende', 'spende_einstellung',
  'sprach_anweisung', 'sprach_bestaetigung', 'sprach_profil', 'standort_module', 'standorte',
  'tenant_module', 'termin_arten', 'text_werk', 'ticket_verlauf', 'tickets', 'tier_behandlungen',
  'tier_bewegung', 'tier_erinnerung', 'tier_got_leistung', 'tier_gruppe', 'tier_stichtag',
  'tier_tiere', 'tour', 'tour_stopp', 'variante_artikel', 'variante_gruppe', 'verein_ehrenamt',
  'verein_mitglieder', 'verein_pauschale', 'verein_veranstaltungen', 'verfuegbarkeiten',
  'verkaufschancen', 'verleih_artikel', 'verleih_vorgang', 'versammlung', 'versammlung_beschluss',
  'versand_sendung', 'vertraege', 'vertrieb_aktivitaet', 'vertrieb_woche', 'vorlage_pool',
  'vorlagen_aufgaben', 'wareneingang', 'wareneingang_positionen', 'wartungshistorie',
  'wartungsvertraege', 'web_ci', 'web_ereignisse', 'web_seiten', 'webinar_anmeldung',
  'webinar_termin', 'webinar_versand', 'webinare', 'wellness_behandlungen', 'wellness_kunden',
  'werkstatt_anhaenge', 'werkstatt_auftraege', 'werkstatt_fahrzeug_halter_log',
  'werkstatt_fahrzeuge', 'werkstatt_freigabe_log', 'werkstatt_material_buchungen',
  'werkstatt_positionen', 'werkstatt_status_log', 'whatsapp_kontakt', 'whatsapp_nachricht',
  'whatsapp_versand', 'whatsapp_vorlage', 'wiederkehr_lauf', 'zahlungen', 'zielgruppe',
  'zusammenfuehrungen', 'zuschnitt_projekt', 'zuschnitt_teil',
];

/** Bewusst NICHT gesichert — Zugangsdaten und Geheimnisse. */
export const NIE_SICHERN: string[] = [
  'ads_zugang', 'api_schluessel', 'bank_zugang', 'beispiel_datensatz', 'betrieb_integrationen',
  'betriebs_geheimnisse', 'dialog_einstellung', 'elster_zugang', 'kassen_system', 'mail_zugang',
  'marktplatz_zugang', 'portal_zugaenge', 'social_zugang', 'versand_zugang', 'whatsapp_zugang',
];

/** Ist das eine Tabelle mit Zugangsdaten (darf nie in die Sicherung)? */
export function istZugangsTabelle(name: string): boolean {
  return /_zugang$|_zugaenge$|schluessel|geheim|integration/.test(name) || NIE_SICHERN.includes(name);
}

/** Excel erlaubt hoechstens 31 Zeichen und keine der Zeichen : \\ / ? * [ ] im Blattnamen. */
export function blattName(name: string, vergeben: Set<string>): string {
  const basis = name.replace(/[:\\/?*\[\]]/g, '_').slice(0, 31) || 'Blatt';
  let n = basis;
  for (let i = 2; vergeben.has(n.toLowerCase()); i++) n = basis.slice(0, 31 - String(i).length - 1) + '_' + i;
  vergeben.add(n.toLowerCase());
  return n;
}

/** Alle Bereiche in Sicherungs-Reihenfolge: erst die Hauptbereiche, dann der Rest. */
export function alleSicherungsBereiche(): { table: string; blatt: string; label: string }[] {
  const vergeben = new Set<string>();
  const haupt = HAUPT_BEREICHE.map((b) => ({ ...b, blatt: blattName(b.blatt, vergeben) }));
  const rest = WEITERE_TABELLEN
    .filter((t) => !istZugangsTabelle(t) && !HAUPT_BEREICHE.some((b) => b.table === t))
    .map((t) => ({ table: t, blatt: blattName(t, vergeben), label: t }));
  return [...haupt, ...rest];
}
