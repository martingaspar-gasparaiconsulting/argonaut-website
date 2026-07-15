-- ============================================================================
-- ARGONAUT OS · db/trigger.sql
-- Stand: 15.07.2026 · Supabase-Projekt znrjnndfzzydnhbyntwa (eu-north-1)
-- ----------------------------------------------------------------------------
-- WARUM DIESE DATEI (Q5, Teil 3 — letzter Teil):
--   Die Funktionen aus db/funktionen.sql koennen alles — aber ohne Trigger ruft
--   sie niemand auf. Diese 72 Trigger sind die Zuendung: sie bestimmen, WANN auf
--   WELCHER Tabelle welche Funktion feuert. Fehlen sie, setzt sich kein
--   owner_user_id selbst, klingelt keine Glocke, greift keine GoBD-Sperre.
--
-- INHALT: 72 Trigger auf 59 Tabellen. Was sie tun:
--   OWNER SETZEN (BEFORE INSERT): schreiben owner_user_id automatisch aus
--     coalesce(mein_chef_id(), auth.uid()) — Grundlage aller RLS-Policies.
--     Betroffen u. a.: auftraege · einsaetze · termine · termin_arten ·
--     verfuegbarkeiten · erechnung_archiv · ERP-Tabellen.
--   GoBD-SPERREN: inventur_audit_readonly · fn_preis_historie_readonly
--     blockieren UPDATE/DELETE HART -> Revisionssicherheit (append-only).
--   BENACHRICHTIGUNG: hr_notify_on_abwesenheit · hr_notify_on_schicht_tausch ·
--     hr_notify_on_schicht_bestaetigung · auftrag_abgeschlossen_melden -> Glocke.
--   ZEITSTEMPEL (BEFORE UPDATE): set_updated_at / set_aktualisiert_am je Modul.
--   RECHNUNGSLOGIK: zahlung_rechnung_sync · rechnung_zahlbetrag_neu_berechnen.
--   NUMMERNKREISE: set_auftragsnummer · fn_rechnung_nummer.
--   HISTORIE: fn_artikel_preis_historie (bei Preisaenderung an artikel).
--   TEAM-CHAT: chat_kanal_ersteller_als_mitglied.
--
-- ERZEUGT DURCH: read-only Abfrage auf pg_trigger (pg_get_triggerdef).
--   Interne Trigger (Fremdschluessel-Pruefungen etc.) sind ausgeschlossen —
--   die verwaltet Postgres selbst.
--
-- ⚠️ WIEDERHERSTELLUNG:
--   Idempotent (drop trigger if exists + CREATE TRIGGER), mehrfach ausfuehrbar.
--   REIHENFOLGE bei komplettem Neuaufbau — zwingend einhalten:
--     1. Tabellen
--     2. db/funktionen.sql   (Trigger verweisen auf die Funktionen)
--     3. db/trigger.sql      <- diese Datei
--     4. db/policies.sql     (Policies rufen die Funktionen auf)
-- ============================================================================


drop trigger if exists trg_anfahrt_konfig_updated on public.anfahrt_konfig;
CREATE TRIGGER trg_anfahrt_konfig_updated BEFORE UPDATE ON public.anfahrt_konfig FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_api_schluessel_updated on public.api_schluessel;
CREATE TRIGGER trg_api_schluessel_updated BEFORE UPDATE ON public.api_schluessel FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_artikel_preis_historie on public.artikel;
CREATE TRIGGER trg_artikel_preis_historie AFTER UPDATE OF einkaufspreis, verkaufspreis ON public.artikel FOR EACH ROW EXECUTE FUNCTION fn_artikel_preis_historie();

drop trigger if exists trg_artikel_updated on public.artikel;
CREATE TRIGGER trg_artikel_updated BEFORE UPDATE ON public.artikel FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

drop trigger if exists trg_erp_owner_artikel on public.artikel;
CREATE TRIGGER trg_erp_owner_artikel BEFORE INSERT ON public.artikel FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_aufmasspos_aktualisiert on public.aufmass_positionen;
CREATE TRIGGER trg_aufmasspos_aktualisiert BEFORE UPDATE ON public.aufmass_positionen FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_aufmasse_aktualisiert on public.aufmasse;
CREATE TRIGGER trg_aufmasse_aktualisiert BEFORE UPDATE ON public.aufmasse FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_auftraege_nummer on public.auftraege;
CREATE TRIGGER trg_auftraege_nummer BEFORE INSERT ON public.auftraege FOR EACH ROW EXECUTE FUNCTION set_auftragsnummer();

drop trigger if exists trg_auftraege_set_owner on public.auftraege;
CREATE TRIGGER trg_auftraege_set_owner BEFORE INSERT ON public.auftraege FOR EACH ROW EXECUTE FUNCTION auftraege_set_owner();

drop trigger if exists trg_auftraege_updated on public.auftraege;
CREATE TRIGGER trg_auftraege_updated BEFORE UPDATE ON public.auftraege FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_auftrag_abgeschlossen on public.auftraege;
CREATE TRIGGER trg_auftrag_abgeschlossen AFTER UPDATE OF status ON public.auftraege FOR EACH ROW EXECUTE FUNCTION auftrag_abgeschlossen_melden();

drop trigger if exists trg_positionen_updated on public.auftrag_positionen;
CREATE TRIGGER trg_positionen_updated BEFORE UPDATE ON public.auftrag_positionen FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_erp_owner_bestellpositionen on public.bestellpositionen;
CREATE TRIGGER trg_erp_owner_bestellpositionen BEFORE INSERT ON public.bestellpositionen FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_bestellungen_updated on public.bestellungen;
CREATE TRIGGER trg_bestellungen_updated BEFORE UPDATE ON public.bestellungen FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

drop trigger if exists trg_erp_owner_bestellungen on public.bestellungen;
CREATE TRIGGER trg_erp_owner_bestellungen BEFORE INSERT ON public.bestellungen FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_betriebs_geheimnisse_updated on public.betriebs_geheimnisse;
CREATE TRIGGER trg_betriebs_geheimnisse_updated BEFORE UPDATE ON public.betriebs_geheimnisse FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

drop trigger if exists trg_betriebs_standort_updated on public.betriebs_standort;
CREATE TRIGGER trg_betriebs_standort_updated BEFORE UPDATE ON public.betriebs_standort FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

drop trigger if exists trg_bewerber_updated_at on public.bewerber;
CREATE TRIGGER trg_bewerber_updated_at BEFORE UPDATE ON public.bewerber FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

drop trigger if exists trg_chat_kanal_ersteller on public.chat_kanaele;
CREATE TRIGGER trg_chat_kanal_ersteller AFTER INSERT ON public.chat_kanaele FOR EACH ROW EXECUTE FUNCTION chat_kanal_ersteller_als_mitglied();

drop trigger if exists einsaetze_set_owner on public.einsaetze;
CREATE TRIGGER einsaetze_set_owner BEFORE INSERT ON public.einsaetze FOR EACH ROW EXECUTE FUNCTION einsaetze_set_owner();

drop trigger if exists trg_erechnung_archiv_owner on public.erechnung_archiv;
CREATE TRIGGER trg_erechnung_archiv_owner BEFORE INSERT ON public.erechnung_archiv FOR EACH ROW EXECUTE FUNCTION erechnung_archiv_set_owner();

drop trigger if exists trg_fahrtkosten_staffel_updated on public.fahrtkosten_staffel;
CREATE TRIGGER trg_fahrtkosten_staffel_updated BEFORE UPDATE ON public.fahrtkosten_staffel FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_erp_owner_fahrzeuge on public.fahrzeuge;
CREATE TRIGGER trg_erp_owner_fahrzeuge BEFORE INSERT ON public.fahrzeuge FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_fahrzeuge_updated on public.fahrzeuge;
CREATE TRIGGER trg_fahrzeuge_updated BEFORE UPDATE ON public.fahrzeuge FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

drop trigger if exists trg_firmen_updated_at on public.firmen;
CREATE TRIGGER trg_firmen_updated_at BEFORE UPDATE ON public.firmen FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

drop trigger if exists trg_geo_routen_updated on public.geo_routen;
CREATE TRIGGER trg_geo_routen_updated BEFORE UPDATE ON public.geo_routen FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

drop trigger if exists trg_holz_auftraege_updated on public.holz_auftraege;
CREATE TRIGGER trg_holz_auftraege_updated BEFORE UPDATE ON public.holz_auftraege FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_holz_apos_updated on public.holz_auftrag_positionen;
CREATE TRIGGER trg_holz_apos_updated BEFORE UPDATE ON public.holz_auftrag_positionen FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_holz_rabatt_updated on public.holz_mengenrabatt;
CREATE TRIGGER trg_holz_rabatt_updated BEFORE UPDATE ON public.holz_mengenrabatt FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

drop trigger if exists trg_holz_preise_updated on public.holz_preise;
CREATE TRIGGER trg_holz_preise_updated BEFORE UPDATE ON public.holz_preise FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

drop trigger if exists trg_holz_sortiment_updated on public.holz_sortiment;
CREATE TRIGGER trg_holz_sortiment_updated BEFORE UPDATE ON public.holz_sortiment FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

drop trigger if exists trg_abw_updated_at on public.hr_abwesenheiten;
CREATE TRIGGER trg_abw_updated_at BEFORE UPDATE ON public.hr_abwesenheiten FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

drop trigger if exists trg_hr_notify_abwesenheit on public.hr_abwesenheiten;
CREATE TRIGGER trg_hr_notify_abwesenheit AFTER INSERT ON public.hr_abwesenheiten FOR EACH ROW EXECUTE FUNCTION hr_notify_on_abwesenheit();

drop trigger if exists trg_check_updated_at on public.hr_checklisten;
CREATE TRIGGER trg_check_updated_at BEFORE UPDATE ON public.hr_checklisten FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

drop trigger if exists trg_hrdok_updated_at on public.hr_dokumente;
CREATE TRIGGER trg_hrdok_updated_at BEFORE UPDATE ON public.hr_dokumente FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

drop trigger if exists trg_hr_einst_updated_at on public.hr_einstellungen;
CREATE TRIGGER trg_hr_einst_updated_at BEFORE UPDATE ON public.hr_einstellungen FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

drop trigger if exists hr_notify_on_schicht_bestaetigung_trg on public.hr_schicht_bestaetigung;
CREATE TRIGGER hr_notify_on_schicht_bestaetigung_trg AFTER INSERT OR UPDATE ON public.hr_schicht_bestaetigung FOR EACH ROW EXECUTE FUNCTION hr_notify_on_schicht_bestaetigung();

drop trigger if exists hr_notify_on_schicht_tausch_trg on public.hr_schicht_tausch;
CREATE TRIGGER hr_notify_on_schicht_tausch_trg AFTER INSERT ON public.hr_schicht_tausch FOR EACH ROW EXECUTE FUNCTION hr_notify_on_schicht_tausch();

drop trigger if exists trg_schul_updated_at on public.hr_schulungen;
CREATE TRIGGER trg_schul_updated_at BEFORE UPDATE ON public.hr_schulungen FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

drop trigger if exists trg_import_laeufe_updated on public.import_laeufe;
CREATE TRIGGER trg_import_laeufe_updated BEFORE UPDATE ON public.import_laeufe FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_import_zeilen_updated on public.import_zeilen;
CREATE TRIGGER trg_import_zeilen_updated BEFORE UPDATE ON public.import_zeilen FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_erp_owner_inventar on public.inventar;
CREATE TRIGGER trg_erp_owner_inventar BEFORE INSERT ON public.inventar FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_inventar_updated on public.inventar;
CREATE TRIGGER trg_inventar_updated BEFORE UPDATE ON public.inventar FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

drop trigger if exists trg_erp_owner_inventur_audit on public.inventur_audit;
CREATE TRIGGER trg_erp_owner_inventur_audit BEFORE INSERT ON public.inventur_audit FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_inventur_audit_no_delete on public.inventur_audit;
CREATE TRIGGER trg_inventur_audit_no_delete BEFORE DELETE ON public.inventur_audit FOR EACH ROW EXECUTE FUNCTION inventur_audit_readonly();

drop trigger if exists trg_inventur_audit_no_update on public.inventur_audit;
CREATE TRIGGER trg_inventur_audit_no_update BEFORE UPDATE ON public.inventur_audit FOR EACH ROW EXECUTE FUNCTION inventur_audit_readonly();

drop trigger if exists trg_erp_owner_inventur_zaehlung on public.inventur_zaehlung;
CREATE TRIGGER trg_erp_owner_inventur_zaehlung BEFORE INSERT ON public.inventur_zaehlung FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_kontakte_updated_at on public.kontakte;
CREATE TRIGGER trg_kontakte_updated_at BEFORE UPDATE ON public.kontakte FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

drop trigger if exists trg_korr_updated on public.korrespondenz;
CREATE TRIGGER trg_korr_updated BEFORE UPDATE ON public.korrespondenz FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_erp_owner_lagerbewegungen on public.lagerbewegungen;
CREATE TRIGGER trg_erp_owner_lagerbewegungen BEFORE INSERT ON public.lagerbewegungen FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_erp_owner_lieferanten on public.lieferanten;
CREATE TRIGGER trg_erp_owner_lieferanten BEFORE INSERT ON public.lieferanten FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_lieferanten_updated on public.lieferanten;
CREATE TRIGGER trg_lieferanten_updated BEFORE UPDATE ON public.lieferanten FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

drop trigger if exists trg_mkt_inh_upd on public.marketing_inhalte;
CREATE TRIGGER trg_mkt_inh_upd BEFORE UPDATE ON public.marketing_inhalte FOR EACH ROW EXECUTE FUNCTION marketing_set_updated_at();

drop trigger if exists trg_mkt_kal_upd on public.marketing_kalender;
CREATE TRIGGER trg_mkt_kal_upd BEFORE UPDATE ON public.marketing_kalender FOR EACH ROW EXECUTE FUNCTION marketing_set_updated_at();

drop trigger if exists trg_mkt_kamp_upd on public.marketing_kampagnen;
CREATE TRIGGER trg_mkt_kamp_upd BEFORE UPDATE ON public.marketing_kampagnen FOR EACH ROW EXECUTE FUNCTION marketing_set_updated_at();

drop trigger if exists trg_mkt_zg_upd on public.marketing_zielgruppen;
CREATE TRIGGER trg_mkt_zg_upd BEFORE UPDATE ON public.marketing_zielgruppen FOR EACH ROW EXECUTE FUNCTION marketing_set_updated_at();

drop trigger if exists trg_mitarbeiter_updated_at on public.mitarbeiter;
CREATE TRIGGER trg_mitarbeiter_updated_at BEFORE UPDATE ON public.mitarbeiter FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

drop trigger if exists trg_paket_pos_updated on public.paket_positionen;
CREATE TRIGGER trg_paket_pos_updated BEFORE UPDATE ON public.paket_positionen FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_pakete_updated on public.pakete;
CREATE TRIGGER trg_pakete_updated BEFORE UPDATE ON public.pakete FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

drop trigger if exists trg_preis_historie_readonly on public.preis_historie;
CREATE TRIGGER trg_preis_historie_readonly BEFORE DELETE OR UPDATE ON public.preis_historie FOR EACH ROW EXECUTE FUNCTION fn_preis_historie_readonly();

drop trigger if exists trg_rechnung_pos_updated on public.rechnung_positionen;
CREATE TRIGGER trg_rechnung_pos_updated BEFORE UPDATE ON public.rechnung_positionen FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

drop trigger if exists trg_rechnung_nummer on public.rechnungen;
CREATE TRIGGER trg_rechnung_nummer BEFORE INSERT ON public.rechnungen FOR EACH ROW EXECUTE FUNCTION fn_rechnung_nummer();

drop trigger if exists trg_rechnungen_updated on public.rechnungen;
CREATE TRIGGER trg_rechnungen_updated BEFORE UPDATE ON public.rechnungen FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

drop trigger if exists termin_arten_set_owner on public.termin_arten;
CREATE TRIGGER termin_arten_set_owner BEFORE INSERT OR UPDATE ON public.termin_arten FOR EACH ROW EXECUTE FUNCTION termin_arten_set_owner();

drop trigger if exists termine_set_owner on public.termine;
CREATE TRIGGER termine_set_owner BEFORE INSERT OR UPDATE ON public.termine FOR EACH ROW EXECUTE FUNCTION termine_set_owner();

drop trigger if exists trg_tickets_updated on public.tickets;
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists verfuegbarkeiten_set_owner on public.verfuegbarkeiten;
CREATE TRIGGER verfuegbarkeiten_set_owner BEFORE INSERT OR UPDATE ON public.verfuegbarkeiten FOR EACH ROW EXECUTE FUNCTION verfuegbarkeiten_set_owner();

drop trigger if exists trg_verkaufschancen_updated_at on public.verkaufschancen;
CREATE TRIGGER trg_verkaufschancen_updated_at BEFORE UPDATE ON public.verkaufschancen FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

drop trigger if exists trg_vertraege_updated on public.vertraege;
CREATE TRIGGER trg_vertraege_updated BEFORE UPDATE ON public.vertraege FOR EACH ROW EXECUTE FUNCTION vertraege_set_updated_at();

drop trigger if exists trg_erp_owner_wareneingang on public.wareneingang;
CREATE TRIGGER trg_erp_owner_wareneingang BEFORE INSERT ON public.wareneingang FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_erp_owner_wareneingang_positionen on public.wareneingang_positionen;
CREATE TRIGGER trg_erp_owner_wareneingang_positionen BEFORE INSERT ON public.wareneingang_positionen FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

drop trigger if exists trg_zahlung_sync on public.zahlungen;
CREATE TRIGGER trg_zahlung_sync AFTER INSERT OR DELETE OR UPDATE ON public.zahlungen FOR EACH ROW EXECUTE FUNCTION zahlung_rechnung_sync();
