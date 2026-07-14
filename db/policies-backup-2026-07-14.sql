-- ============================================================================
-- ARGONAUT OS · SQL-Sicherung (RLS-Policies, Funktionen, Trigger)
-- Stand: 2026-07-14 · Quelle: Supabase-Projekt znrjnndfzzydnhbyntwa (eu-north-1)
-- Erzeugt aus dem Web-SQL-Editor (schema_backup-Query, nur lesend).
--
-- Zweck: Notfall-Wiederherstellung des Sicherheits-/Rechte-Fundaments.
-- Reihenfolge: 1) RLS aktivieren  2) Policies  3) Funktionen  4) Trigger.
-- Hinweis: Dies ist ein Roh-Backup (noch nicht in saubere Einzel-Migrationen
-- zerlegt) — bewusst so, um schnell eine versionierte Kopie im Repo zu haben.
-- ============================================================================

ALTER TABLE public.lagerbewegungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_agents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.training_data ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.meilensteine ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_dokumente ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mitarbeiter ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_abwesenheiten ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_checklisten_abschluss ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_einstellungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vorlagen_aufgaben ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_schulungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.churned_customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.automatisierungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_benachrichtigungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.erstellte_dokumente ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bewerber ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_checklisten_vorlagen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_checklisten ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_zeiterfassung ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_zeit_korrekturen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_schicht_vorlagen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_schicht_tausch ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_schichten ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hr_schicht_bestaetigung ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.kontakt_aktivitaeten ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projekte ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projekt_teams ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.aufgaben_kommentare ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.aufgaben ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projekt_beteiligte ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projekt_vorlagen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketing_zielgruppen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketing_kampagnen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketing_inhalte ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketing_kalender ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.kontakt_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.kontakt_tag_zuordnung ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.verkaufschancen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auftraege ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auftrag_positionen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lieferanten ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rechnung_positionen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rechnungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.academy_kurse ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.artikel ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bestellungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bestellpositionen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wareneingang ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wareneingang_positionen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventar ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.preis_historie ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wartungsvertraege ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ticket_verlauf ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fahrzeuge ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vertraege ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.korrespondenz ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_kanaele ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_mitglieder ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_nachrichten ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ausgaben ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mitarbeiter_rechte ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.zahlungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finanz_szenarien ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gobd_verfahrensdoku ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.demo_hr_backup ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventur_zaehlung ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mahnung_historie ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventur_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.objekte ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.objekt_zeiten ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.buchungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ressourcen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkstatt_status_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkstatt_fahrzeuge ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkstatt_fahrzeug_halter_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkstatt_material_buchungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkstatt_anhaenge ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkstatt_positionen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leistungskatalog ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkstatt_freigabe_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.werkstatt_auftraege ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.aufmass_positionen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.aufmasse ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.holz_sortiment ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.holz_preise ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.holz_mengenrabatt ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.betriebs_standort ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.kontakte ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.firmen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.betriebs_geheimnisse ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.geo_routen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.api_schluessel ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.anfahrt_konfig ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fahrtkosten_staffel ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.import_laeufe ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.import_zeilen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.zusammenfuehrungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pakete ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.paket_positionen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.holz_auftraege ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.holz_auftrag_positionen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.einsatz_fotos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.abteilungen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.verfuegbarkeiten ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.termine ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.termin_arten ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.einsatz_positionen ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.einsaetze ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.erechnung_archiv ENABLE ROW LEVEL SECURITY;

CREATE POLICY lagerbewegungen_mitarbeiter ON public.lagerbewegungen AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY lagerbewegungen_owner ON public.lagerbewegungen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY "Eigene Agenten einfügen" ON public.document_agents AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Eigene Agenten lesen" ON public.document_agents AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Eigene Agenten löschen" ON public.document_agents AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));

CREATE POLICY admin_all_meilensteine ON public.meilensteine AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));

CREATE POLICY hr_dokumente_select_personal ON public.hr_dokumente AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

CREATE POLICY hrdok_delete_own ON public.hr_dokumente AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY hrdok_insert_own ON public.hr_dokumente AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY hrdok_insert_self ON public.hr_dokumente AS PERMISSIVE FOR INSERT TO public WITH CHECK ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

CREATE POLICY hrdok_select_own ON public.hr_dokumente AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY hrdok_select_self ON public.hr_dokumente AS PERMISSIVE FOR SELECT TO public USING ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

CREATE POLICY leads_owner_select ON public.leads AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_user_id = auth.uid()));

CREATE POLICY leads_owner_update ON public.leads AS PERMISSIVE FOR UPDATE TO authenticated USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY leads_public_insert ON public.leads AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Eigene Dokumente aktualisieren" ON public.documents AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Eigene Dokumente einfügen" ON public.documents AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Eigene Dokumente lesen" ON public.documents AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Eigene Dokumente löschen" ON public.documents AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));

CREATE POLICY agents_read_all ON public.agents AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Eigene Chunks einfügen" ON public.document_chunks AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Eigene Chunks lesen" ON public.document_chunks AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Eigene Chunks löschen" ON public.document_chunks AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));

CREATE POLICY mitarbeiter_delete_own ON public.mitarbeiter AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY mitarbeiter_insert_own ON public.mitarbeiter AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY mitarbeiter_select_own ON public.mitarbeiter AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY mitarbeiter_select_personal ON public.mitarbeiter AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

CREATE POLICY mitarbeiter_select_self ON public.mitarbeiter AS PERMISSIVE FOR SELECT TO public USING ((auth_user_id = auth.uid()));

CREATE POLICY mitarbeiter_select_verteiler ON public.mitarbeiter AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen()));

CREATE POLICY mitarbeiter_update_own ON public.mitarbeiter AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY abw_delete_own ON public.hr_abwesenheiten AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY abw_insert_own ON public.hr_abwesenheiten AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY abw_insert_self ON public.hr_abwesenheiten AS PERMISSIVE FOR INSERT TO public WITH CHECK ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

CREATE POLICY abw_select_own ON public.hr_abwesenheiten AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY abw_select_self ON public.hr_abwesenheiten AS PERMISSIVE FOR SELECT TO public USING ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

CREATE POLICY abw_update_own ON public.hr_abwesenheiten AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY hr_abwesenheiten_select_personal ON public.hr_abwesenheiten AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

CREATE POLICY "Users can read own customer data" ON public.customers AS PERMISSIVE FOR SELECT TO public USING ((email = (auth.jwt() ->> 'email'::text)));

CREATE POLICY abschluss_owner_all ON public.hr_checklisten_abschluss AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY abschluss_self_insert ON public.hr_checklisten_abschluss AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten_abschluss.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY abschluss_self_select ON public.hr_checklisten_abschluss AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten_abschluss.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY abschluss_self_update ON public.hr_checklisten_abschluss AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten_abschluss.mitarbeiter_id) AND (m.auth_user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten_abschluss.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY hr_checklisten_abschluss_select_personal ON public.hr_checklisten_abschluss AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

CREATE POLICY einst_insert_own ON public.hr_einstellungen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY einst_select_own ON public.hr_einstellungen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY einst_select_self ON public.hr_einstellungen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id IN ( SELECT mitarbeiter.owner_user_id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

CREATE POLICY einst_update_own ON public.hr_einstellungen AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY hr_einstellungen_select_personal ON public.hr_einstellungen AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

CREATE POLICY vorlagen_aufgaben_owner_all ON public.vorlagen_aufgaben AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY vorlagen_aufgaben_select_mitarbeiter ON public.vorlagen_aufgaben AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY hr_schulungen_select_personal ON public.hr_schulungen AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

CREATE POLICY schul_delete_own ON public.hr_schulungen AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY schul_insert_own ON public.hr_schulungen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY schul_select_own ON public.hr_schulungen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY schul_select_self ON public.hr_schulungen AS PERMISSIVE FOR SELECT TO public USING ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

CREATE POLICY schul_update_own ON public.hr_schulungen AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY "Alle lesen" ON public.automatisierungen AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY benach_delete_own ON public.hr_benachrichtigungen AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY benach_insert_own ON public.hr_benachrichtigungen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY benach_select_own ON public.hr_benachrichtigungen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY benach_update_own ON public.hr_benachrichtigungen AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY "Nutzer sieht nur eigene Daten" ON public.usage_tracking AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Eigene erstellte Dokumente lesen" ON public.erstellte_dokumente AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY bewerber_delete_own ON public.bewerber AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY bewerber_insert_own ON public.bewerber AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY bewerber_select_own ON public.bewerber AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY bewerber_update_own ON public.bewerber AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY vorlagen_owner_all ON public.hr_checklisten_vorlagen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY check_delete_own ON public.hr_checklisten AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY check_insert_own ON public.hr_checklisten AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY check_select_own ON public.hr_checklisten AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY check_update_own ON public.hr_checklisten AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY checklisten_owner_all ON public.hr_checklisten AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY checklisten_self_select ON public.hr_checklisten AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY hr_checklisten_select_personal ON public.hr_checklisten AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

CREATE POLICY zeit_owner_all ON public.hr_zeiterfassung AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY zeit_self_insert ON public.hr_zeiterfassung AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeiterfassung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY zeit_self_select ON public.hr_zeiterfassung AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeiterfassung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY zeit_self_update_offen ON public.hr_zeiterfassung AS PERMISSIVE FOR UPDATE TO public USING (((gehen_um IS NULL) AND (EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeiterfassung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeiterfassung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY zeitkorr_owner_all ON public.hr_zeit_korrekturen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY zeitkorr_self_select ON public.hr_zeit_korrekturen AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeit_korrekturen.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY hr_schicht_vorlagen_owner_all ON public.hr_schicht_vorlagen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY hr_schicht_tausch_owner_all ON public.hr_schicht_tausch AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY hr_schicht_tausch_self_insert ON public.hr_schicht_tausch AS PERMISSIVE FOR INSERT TO public WITH CHECK (((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.von_mitarbeiter_id) AND (m.auth_user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM hr_schichten s
  WHERE ((s.id = hr_schicht_tausch.schicht_id) AND (s.owner_user_id = hr_schicht_tausch.owner_user_id))))));

CREATE POLICY hr_schicht_tausch_self_select ON public.hr_schicht_tausch AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.von_mitarbeiter_id) AND (m.auth_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.an_mitarbeiter_id) AND (m.auth_user_id = auth.uid()))))));

CREATE POLICY hr_schicht_tausch_self_update ON public.hr_schicht_tausch AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.von_mitarbeiter_id) AND (m.auth_user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.von_mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY hr_schichten_owner_all ON public.hr_schichten AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY hr_schichten_self_select ON public.hr_schichten AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schichten.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY hr_schicht_best_owner_all ON public.hr_schicht_bestaetigung AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY hr_schicht_best_self_insert ON public.hr_schicht_bestaetigung AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_bestaetigung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY hr_schicht_best_self_select ON public.hr_schicht_bestaetigung AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_bestaetigung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY hr_schicht_best_self_update ON public.hr_schicht_bestaetigung AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_bestaetigung.mitarbeiter_id) AND (m.auth_user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_bestaetigung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

CREATE POLICY kontakt_aktivitaeten_owner_all ON public.kontakt_aktivitaeten AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY projekte_owner_all ON public.projekte AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY projekte_select_mitarbeiter ON public.projekte AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY projekt_teams_owner_all ON public.projekt_teams AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY aufgaben_komm_owner_all ON public.aufgaben_kommentare AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY aufgaben_owner_all ON public.aufgaben AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY aufgaben_select_mitarbeiter ON public.aufgaben AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY projekt_beteiligte_owner_all ON public.projekt_beteiligte AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY projekt_vorlagen_owner_all ON public.projekt_vorlagen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY projekt_vorlagen_select_mitarbeiter ON public.projekt_vorlagen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY mkt_zg_owner ON public.marketing_zielgruppen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY mkt_kamp_owner ON public.marketing_kampagnen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY mkt_kamp_select_mitarbeiter ON public.marketing_kampagnen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY mkt_inh_owner ON public.marketing_inhalte AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY mkt_kal_owner ON public.marketing_kalender AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY kontakt_tags_owner_all ON public.kontakt_tags AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY kontakt_tag_zuordnung_owner_all ON public.kontakt_tag_zuordnung AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY verkaufschancen_owner_all ON public.verkaufschancen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY auftraege_delete_mitarbeiter ON public.auftraege AS PERMISSIVE FOR DELETE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('auftraege'::text)));

CREATE POLICY auftraege_insert_mitarbeiter ON public.auftraege AS PERMISSIVE FOR INSERT TO public WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('auftraege'::text)));

CREATE POLICY auftraege_owner_all ON public.auftraege AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY auftraege_select_mitarbeiter ON public.auftraege AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY auftraege_update_mitarbeiter ON public.auftraege AS PERMISSIVE FOR UPDATE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('auftraege'::text))) WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('auftraege'::text)));

CREATE POLICY positionen_owner_all ON public.auftrag_positionen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY lieferanten_mitarbeiter ON public.lieferanten AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY lieferanten_owner ON public.lieferanten AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY rechnung_pos_owner_all ON public.rechnung_positionen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY rechnungen_owner_all ON public.rechnungen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY rechnungen_select_mitarbeiter ON public.rechnungen AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('rechnungen'::text)));

CREATE POLICY academy_read_all ON public.academy_kurse AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY artikel_mitarbeiter ON public.artikel AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY artikel_owner ON public.artikel AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY bestellungen_mitarbeiter ON public.bestellungen AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY bestellungen_owner ON public.bestellungen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY bestellpositionen_mitarbeiter ON public.bestellpositionen AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY bestellpositionen_owner ON public.bestellpositionen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY wareneingang_mitarbeiter ON public.wareneingang AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY wareneingang_owner ON public.wareneingang AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY wareneingang_pos_owner ON public.wareneingang_positionen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY wareneingang_positionen_mitarbeiter ON public.wareneingang_positionen AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY inventar_mitarbeiter ON public.inventar AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY inventar_owner ON public.inventar AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY preis_historie_insert_own ON public.preis_historie AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY preis_historie_select_own ON public.preis_historie AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY wartung_delete ON public.wartungsvertraege AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wartung_insert ON public.wartungsvertraege AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wartung_select ON public.wartungsvertraege AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wartung_select_mitarbeiter ON public.wartungsvertraege AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY wartung_update ON public.wartungsvertraege AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY tickets_delete ON public.tickets AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY tickets_insert ON public.tickets AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY tickets_select ON public.tickets AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY tickets_select_mitarbeiter ON public.tickets AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY tickets_update ON public.tickets AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY verlauf_delete ON public.ticket_verlauf AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY verlauf_insert ON public.ticket_verlauf AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY verlauf_select ON public.ticket_verlauf AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY fahrzeuge_mitarbeiter ON public.fahrzeuge AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY fahrzeuge_owner ON public.fahrzeuge AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY vertraege_owner ON public.vertraege AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY vertraege_select_mitarbeiter ON public.vertraege AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('vertraege'::text)));

CREATE POLICY korr_delete ON public.korrespondenz AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY korr_insert ON public.korrespondenz AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY korr_select ON public.korrespondenz AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY korr_update ON public.korrespondenz AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY kanaele_delete ON public.chat_kanaele AS PERMISSIVE FOR DELETE TO public USING ((erstellt_von = auth.uid()));

CREATE POLICY kanaele_insert ON public.chat_kanaele AS PERMISSIVE FOR INSERT TO public WITH CHECK ((erstellt_von = auth.uid()));

CREATE POLICY kanaele_select ON public.chat_kanaele AS PERMISSIVE FOR SELECT TO public USING (((erstellt_von = auth.uid()) OR ist_chat_mitglied(id, auth.uid())));

CREATE POLICY kanaele_update ON public.chat_kanaele AS PERMISSIVE FOR UPDATE TO public USING ((erstellt_von = auth.uid())) WITH CHECK ((erstellt_von = auth.uid()));

CREATE POLICY mitglieder_delete ON public.chat_mitglieder AS PERMISSIVE FOR DELETE TO public USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM chat_kanaele k
  WHERE ((k.id = chat_mitglieder.kanal_id) AND (k.erstellt_von = auth.uid()))))));

CREATE POLICY mitglieder_insert ON public.chat_mitglieder AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM chat_kanaele k
  WHERE ((k.id = chat_mitglieder.kanal_id) AND (k.erstellt_von = auth.uid()))))));

CREATE POLICY mitglieder_select ON public.chat_mitglieder AS PERMISSIVE FOR SELECT TO public USING (((user_id = auth.uid()) OR ist_chat_mitglied(kanal_id, auth.uid())));

CREATE POLICY nachrichten_delete ON public.chat_nachrichten AS PERMISSIVE FOR DELETE TO public USING ((absender_id = auth.uid()));

CREATE POLICY nachrichten_insert ON public.chat_nachrichten AS PERMISSIVE FOR INSERT TO public WITH CHECK ((ist_chat_mitglied(kanal_id, auth.uid()) AND ((absender_id = auth.uid()) OR (ist_ki = true))));

CREATE POLICY nachrichten_select ON public.chat_nachrichten AS PERMISSIVE FOR SELECT TO public USING (ist_chat_mitglied(kanal_id, auth.uid()));

CREATE POLICY ausgaben_delete_own ON public.ausgaben AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY ausgaben_insert_own ON public.ausgaben AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY ausgaben_select_own ON public.ausgaben AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY ausgaben_update_own ON public.ausgaben AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY mr_delete ON public.mitarbeiter_rechte AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY mr_insert ON public.mitarbeiter_rechte AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY mr_insert_verteiler ON public.mitarbeiter_rechte AS PERMISSIVE FOR INSERT TO public WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen()));

CREATE POLICY mr_select ON public.mitarbeiter_rechte AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = auth.uid()) OR (mitarbeiter_id = mein_mitarbeiter_id())));

CREATE POLICY mr_select_verteiler ON public.mitarbeiter_rechte AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen()));

CREATE POLICY mr_update ON public.mitarbeiter_rechte AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY mr_update_verteiler ON public.mitarbeiter_rechte AS PERMISSIVE FOR UPDATE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen())) WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen()));

CREATE POLICY zahlungen_delete_own ON public.zahlungen AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY zahlungen_insert_own ON public.zahlungen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY zahlungen_select_own ON public.zahlungen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY zahlungen_update_own ON public.zahlungen AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY finanz_szenarien_delete ON public.finanz_szenarien AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY finanz_szenarien_insert ON public.finanz_szenarien AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY finanz_szenarien_select ON public.finanz_szenarien AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY finanz_szenarien_select_mitarbeiter ON public.finanz_szenarien AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('finanzen'::text)));

CREATE POLICY finanz_szenarien_update ON public.finanz_szenarien AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY gobd_delete_own ON public.gobd_verfahrensdoku AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY gobd_insert_own ON public.gobd_verfahrensdoku AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY gobd_select_own ON public.gobd_verfahrensdoku AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY gobd_update_own ON public.gobd_verfahrensdoku AS PERMISSIVE FOR UPDATE TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY inventur_zaehlung_mitarbeiter ON public.inventur_zaehlung AS PERMISSIVE FOR ALL TO authenticated USING ((owner_user_id = mein_chef_id())) WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY inventur_zaehlung_owner ON public.inventur_zaehlung AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY mahnung_historie_insert ON public.mahnung_historie AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY mahnung_historie_select ON public.mahnung_historie AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY mahnung_historie_select_mitarbeiter ON public.mahnung_historie AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('mahnwesen'::text)));

CREATE POLICY inventur_audit_ma_insert ON public.inventur_audit AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((owner_user_id = mein_chef_id()));

CREATE POLICY inventur_audit_ma_select ON public.inventur_audit AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_user_id = mein_chef_id()));

CREATE POLICY inventur_audit_owner_insert ON public.inventur_audit AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY inventur_audit_owner_select ON public.inventur_audit AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_user_id = auth.uid()));

CREATE POLICY objekte_delete ON public.objekte AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY objekte_insert ON public.objekte AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY objekte_select ON public.objekte AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY objekte_update ON public.objekte AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY objektzeiten_select_mitarbeiter ON public.objekt_zeiten AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY objzeit_delete ON public.objekt_zeiten AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY objzeit_insert ON public.objekt_zeiten AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY objzeit_select ON public.objekt_zeiten AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY objzeit_update ON public.objekt_zeiten AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY buchungen_delete ON public.buchungen AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY buchungen_insert ON public.buchungen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY buchungen_select ON public.buchungen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY buchungen_select_mitarbeiter ON public.buchungen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY buchungen_update ON public.buchungen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY ressourcen_delete ON public.ressourcen AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY ressourcen_insert ON public.ressourcen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY ressourcen_select ON public.ressourcen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY ressourcen_update ON public.ressourcen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wsl_insert ON public.werkstatt_status_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wsl_select ON public.werkstatt_status_log AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wfz_delete ON public.werkstatt_fahrzeuge AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wfz_insert ON public.werkstatt_fahrzeuge AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wfz_select ON public.werkstatt_fahrzeuge AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wfz_update ON public.werkstatt_fahrzeuge AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wfhl_delete ON public.werkstatt_fahrzeug_halter_log AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wfhl_insert ON public.werkstatt_fahrzeug_halter_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wfhl_select ON public.werkstatt_fahrzeug_halter_log AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wfhl_update ON public.werkstatt_fahrzeug_halter_log AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wmb_insert ON public.werkstatt_material_buchungen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wmb_select ON public.werkstatt_material_buchungen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wmb_update ON public.werkstatt_material_buchungen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wanh_delete ON public.werkstatt_anhaenge AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wanh_insert ON public.werkstatt_anhaenge AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wanh_select ON public.werkstatt_anhaenge AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wanh_update ON public.werkstatt_anhaenge AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wpos_delete ON public.werkstatt_positionen AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wpos_insert ON public.werkstatt_positionen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wpos_select ON public.werkstatt_positionen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wpos_update ON public.werkstatt_positionen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY leistungskatalog_select_mitarbeiter ON public.leistungskatalog AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY lk_delete ON public.leistungskatalog AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY lk_insert ON public.leistungskatalog AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY lk_select ON public.leistungskatalog AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY lk_update ON public.leistungskatalog AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY werkstatt_freigabe_log_insert ON public.werkstatt_freigabe_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY werkstatt_freigabe_log_select ON public.werkstatt_freigabe_log AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));

CREATE POLICY wa_delete ON public.werkstatt_auftraege AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wa_insert ON public.werkstatt_auftraege AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY wa_select ON public.werkstatt_auftraege AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY wa_update ON public.werkstatt_auftraege AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY aufmpos_delete ON public.aufmass_positionen AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY aufmpos_insert ON public.aufmass_positionen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY aufmpos_ma_select ON public.aufmass_positionen AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_user_id = mein_chef_id()));

CREATE POLICY aufmpos_select ON public.aufmass_positionen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY aufmpos_update ON public.aufmass_positionen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY aufm_delete ON public.aufmasse AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY aufm_insert ON public.aufmasse AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY aufm_ma_select ON public.aufmasse AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_user_id = mein_chef_id()));

CREATE POLICY aufm_select ON public.aufmasse AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY aufm_update ON public.aufmasse AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id)) WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY holz_sortiment_select_mitarbeiter ON public.holz_sortiment AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY hs_delete ON public.holz_sortiment AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY hs_insert ON public.holz_sortiment AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY hs_mitarbeiter_select ON public.holz_sortiment AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY hs_select ON public.holz_sortiment AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY hs_update ON public.holz_sortiment AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_preise_delete ON public.holz_preise AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_preise_insert ON public.holz_preise AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY holz_preise_ma_select ON public.holz_preise AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY holz_preise_select ON public.holz_preise AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_preise_select_mitarbeiter ON public.holz_preise AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY holz_preise_update ON public.holz_preise AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_mengenrabatt_delete ON public.holz_mengenrabatt AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_mengenrabatt_insert ON public.holz_mengenrabatt AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY holz_mengenrabatt_ma_select ON public.holz_mengenrabatt AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY holz_mengenrabatt_select ON public.holz_mengenrabatt AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_mengenrabatt_update ON public.holz_mengenrabatt AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY bs_delete ON public.betriebs_standort AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY bs_insert ON public.betriebs_standort AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY bs_ma_select ON public.betriebs_standort AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY bs_select ON public.betriebs_standort AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY bs_update ON public.betriebs_standort AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY kontakte_owner_all ON public.kontakte AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY kontakte_select_mitarbeiter ON public.kontakte AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY firmen_owner_all ON public.firmen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY firmen_select_mitarbeiter ON public.firmen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY gr_delete ON public.geo_routen AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY gr_insert ON public.geo_routen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY gr_select ON public.geo_routen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY gr_update ON public.geo_routen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY anfahrt_konfig_delete ON public.anfahrt_konfig AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY anfahrt_konfig_insert ON public.anfahrt_konfig AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY anfahrt_konfig_ma_select ON public.anfahrt_konfig AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY anfahrt_konfig_select ON public.anfahrt_konfig AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY anfahrt_konfig_update ON public.anfahrt_konfig AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY fahrtkosten_staffel_delete ON public.fahrtkosten_staffel AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY fahrtkosten_staffel_insert ON public.fahrtkosten_staffel AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY fahrtkosten_staffel_ma_select ON public.fahrtkosten_staffel AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY fahrtkosten_staffel_select ON public.fahrtkosten_staffel AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY fahrtkosten_staffel_update ON public.fahrtkosten_staffel AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY import_laeufe_delete ON public.import_laeufe AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY import_laeufe_insert ON public.import_laeufe AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY import_laeufe_select ON public.import_laeufe AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY import_laeufe_update ON public.import_laeufe AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY import_zeilen_delete ON public.import_zeilen AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY import_zeilen_insert ON public.import_zeilen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY import_zeilen_select ON public.import_zeilen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY import_zeilen_update ON public.import_zeilen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY zusammenfuehrungen_delete ON public.zusammenfuehrungen AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY zusammenfuehrungen_insert ON public.zusammenfuehrungen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY zusammenfuehrungen_select ON public.zusammenfuehrungen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY zusammenfuehrungen_update ON public.zusammenfuehrungen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY pakete_delete ON public.pakete AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY pakete_insert ON public.pakete AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY pakete_ma_select ON public.pakete AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY pakete_select ON public.pakete AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY pakete_select_mitarbeiter ON public.pakete AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY pakete_update ON public.pakete AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY paket_positionen_delete ON public.paket_positionen AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY paket_positionen_insert ON public.paket_positionen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY paket_positionen_ma_select ON public.paket_positionen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY paket_positionen_select ON public.paket_positionen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY paket_positionen_update ON public.paket_positionen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_auftraege_delete ON public.holz_auftraege AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_auftraege_insert ON public.holz_auftraege AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY holz_auftraege_ma_select ON public.holz_auftraege AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY holz_auftraege_select ON public.holz_auftraege AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_auftraege_select_mitarbeiter ON public.holz_auftraege AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY holz_auftraege_update ON public.holz_auftraege AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_auftrag_positionen_delete ON public.holz_auftrag_positionen AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_auftrag_positionen_insert ON public.holz_auftrag_positionen AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = owner_user_id));

CREATE POLICY holz_auftrag_positionen_ma_select ON public.holz_auftrag_positionen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY holz_auftrag_positionen_select ON public.holz_auftrag_positionen AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY holz_auftrag_positionen_update ON public.holz_auftrag_positionen AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY einsatz_fotos_owner_all ON public.einsatz_fotos AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY einsatz_fotos_select_mitarbeiter ON public.einsatz_fotos AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY "Nutzer kann eigenes Profil updaten" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));

CREATE POLICY "Nutzer sieht eigenes Profil" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));

CREATE POLICY abteilungen_cud ON public.abteilungen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY abteilungen_select ON public.abteilungen AS PERMISSIVE FOR SELECT TO public USING (((owner_user_id = auth.uid()) OR (owner_user_id = mein_chef_id())));

CREATE POLICY verfuegbarkeiten_delete_mitarbeiter ON public.verfuegbarkeiten AS PERMISSIVE FOR DELETE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

CREATE POLICY verfuegbarkeiten_insert_mitarbeiter ON public.verfuegbarkeiten AS PERMISSIVE FOR INSERT TO public WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

CREATE POLICY verfuegbarkeiten_owner_all ON public.verfuegbarkeiten AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY verfuegbarkeiten_select_mitarbeiter ON public.verfuegbarkeiten AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY verfuegbarkeiten_update_mitarbeiter ON public.verfuegbarkeiten AS PERMISSIVE FOR UPDATE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text))) WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

CREATE POLICY termine_delete_mitarbeiter ON public.termine AS PERMISSIVE FOR DELETE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

CREATE POLICY termine_insert_mitarbeiter ON public.termine AS PERMISSIVE FOR INSERT TO public WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

CREATE POLICY termine_owner_all ON public.termine AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY termine_select_mitarbeiter ON public.termine AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY termine_update_mitarbeiter ON public.termine AS PERMISSIVE FOR UPDATE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text))) WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

CREATE POLICY termin_arten_delete_mitarbeiter ON public.termin_arten AS PERMISSIVE FOR DELETE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

CREATE POLICY termin_arten_insert_mitarbeiter ON public.termin_arten AS PERMISSIVE FOR INSERT TO public WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

CREATE POLICY termin_arten_owner_all ON public.termin_arten AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY termin_arten_select_mitarbeiter ON public.termin_arten AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY termin_arten_update_mitarbeiter ON public.termin_arten AS PERMISSIVE FOR UPDATE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text))) WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

CREATE POLICY einsatz_pos_owner_all ON public.einsatz_positionen AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY einsatz_pos_select_mitarbeiter ON public.einsatz_positionen AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY einsaetze_delete_mitarbeiter ON public.einsaetze AS PERMISSIVE FOR DELETE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('einsaetze'::text)));

CREATE POLICY einsaetze_insert_mitarbeiter ON public.einsaetze AS PERMISSIVE FOR INSERT TO public WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('einsaetze'::text)));

CREATE POLICY einsaetze_owner_all ON public.einsaetze AS PERMISSIVE FOR ALL TO public USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));

CREATE POLICY einsaetze_select_mitarbeiter ON public.einsaetze AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = mein_chef_id()));

CREATE POLICY einsaetze_update_mitarbeiter ON public.einsaetze AS PERMISSIVE FOR UPDATE TO public USING (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('einsaetze'::text))) WITH CHECK (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('einsaetze'::text)));

CREATE POLICY erechnung_archiv_insert ON public.erechnung_archiv AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_user_id = COALESCE(mein_chef_id(), auth.uid())));

CREATE POLICY erechnung_archiv_select ON public.erechnung_archiv AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = COALESCE(mein_chef_id(), auth.uid())));

CREATE OR REPLACE FUNCTION public.firmenkopf_fuer_einsatz(p_einsatz_id uuid)
 RETURNS TABLE(firma_name text, firma_strasse text, firma_plz text, firma_ort text, firma_telefon text, firma_email text, firma_ust_id text, firma_steuernummer text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz'; end if;
  return query
    select p.firma_name, p.firma_strasse, p.firma_plz, p.firma_ort,
           p.firma_telefon, p.firma_email, p.firma_ust_id, p.firma_steuernummer
    from profiles p where p.id = v_owner;
end; $function$
;

CREATE OR REPLACE FUNCTION public.chat_mein_name()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text;
begin
  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into v_name from public.mitarbeiter where auth_user_id = auth.uid() limit 1;
  if v_name is not null and v_name <> '' then return v_name; end if;
  select full_name into v_name from public.profiles where id = auth.uid() limit 1;
  if v_name is not null and v_name <> '' then return v_name; end if;
  select split_part(email, '@', 1) into v_name from auth.users where id = auth.uid() limit 1;
  return coalesce(v_name, 'Ich');
end; $function$
;

CREATE OR REPLACE FUNCTION public.erp_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  chef uuid;
begin
  chef := public.mein_chef_id();
  if chef is not null then
    new.owner_user_id := chef;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.argonaut_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.termin_arten_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.owner_user_id is null then
      new.owner_user_id := coalesce(mein_chef_id(), auth.uid());
    end if;
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.einsatz_unterschrift_speichern(p_einsatz_id uuid, p_pfad text, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz';
  end if;
  update einsaetze set
    unterschrift_pfad = p_pfad,
    unterschrift_name = p_name,
    unterschrift_am   = now()
  where id = p_einsatz_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.termin_arten_vorlagen_anlegen(ziel_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare anzahl integer;
begin
  if ziel_owner is null then return 0; end if;
  if exists (select 1 from termin_arten where owner_user_id = ziel_owner and ist_vorlage = true) then
    return 0;  -- schon vorhanden -> nichts doppeln
  end if;
  insert into termin_arten
    (owner_user_id, name, modus, dauer_minuten, dauer_min_minuten, dauer_max_minuten, std_pro_tag, farbe, ist_vorlage, sortierung)
  values
    (ziel_owner, 'Telefonannahme',    'fix',        15,   null, null, null, '#00e5ff', true, 10),
    (ziel_owner, 'Beratung',          'fix',        30,   null, null, null, '#C9A84C', true, 20),
    (ziel_owner, 'Vor-Ort-Termin',    'fix',        60,   null, null, null, '#4CAF7D', true, 30),
    (ziel_owner, 'Vor-Ort-Begehung',  'spanne',     null, 10,   120,  null, '#7E9CD8', true, 40),
    (ziel_owner, 'Wartung',           'fix',        120,  null, null, null, '#E0A458', true, 50),
    (ziel_owner, 'Montage/Baustelle', 'mehrtaegig', null, null, null, 8,    '#D16BA5', true, 60);
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mein_chef_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select owner_user_id
  from public.mitarbeiter
  where auth_user_id = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.hr_notify_on_schicht_bestaetigung()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ma_name text;
  v_text  text;
begin
  -- Nur benachrichtigen, wenn der EINREICHER NICHT der Chef ist
  if auth.uid() is not distinct from NEW.owner_user_id then
    return NEW;
  end if;

  -- Nur bei Einwand laeuten (Zustimmung muss nicht stoeren)
  if NEW.status <> 'einwand' then
    return NEW;
  end if;

  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into ma_name
    from public.mitarbeiter
   where id = NEW.mitarbeiter_id;

  v_text := coalesce(ma_name, 'Ein Mitarbeiter') || ' hat einen Einwand zum Schichtplan der Woche ab '
    || to_char(NEW.woche_start, 'DD.MM.YYYY')
    || coalesce(': ' || NEW.kommentar, '') || '.';

  insert into public.hr_benachrichtigungen
    (owner_user_id, mitarbeiter_id, typ, titel, text, link, gelesen)
  values
    (NEW.owner_user_id, NEW.mitarbeiter_id, 'schicht_einwand', 'Einwand zum Schichtplan', v_text, '/dashboard/schichtplan', false);

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.match_document_chunks(query_embedding vector, match_user_id uuid, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.3)
 RETURNS TABLE(id uuid, document_id uuid, content text, chunk_index integer, similarity double precision)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  q vector(1024);
begin
  q := query_embedding::vector(1024);
  return query
    select
      dc.id,
      dc.document_id,
      dc.content,
      dc.chunk_index,
      (1 - (dc.embedding <=> q))::double precision as similarity
    from public.document_chunks dc
    where dc.user_id = match_user_id
      and (1 - (dc.embedding <=> q)) >= match_threshold
    order by dc.embedding <=> q asc
    limit match_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.einsaetze_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.owner_user_id is null then
      new.owner_user_id := coalesce(mein_chef_id(), auth.uid());
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.einsatz_bericht_speichern(p_einsatz_id uuid, p_pfad text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung'; end if;
  update einsaetze set bericht_pfad = p_pfad, bericht_am = now() where id = p_einsatz_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.set_auftragsnummer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.auftragsnummer is null or new.auftragsnummer = '' then
    new.auftragsnummer := 'AU-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.auftrag_nr_seq')::text, 4, '0');
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auftraege_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  chef uuid;
begin
  chef := public.mein_chef_id();
  if chef is not null then
    new.owner_user_id := chef;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.erechnung_archiv_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := coalesce(mein_chef_id(), auth.uid());
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.holz_set_aktualisiert_am()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.aktualisiert_am = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.marketing_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.einsatz_foto_speichern(p_einsatz_id uuid, p_pfad text, p_dateiname text, p_groesse_bytes bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid; v_neu uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz';
  end if;
  insert into einsatz_fotos (owner_user_id, einsatz_id, pfad, dateiname, groesse_bytes, hochgeladen_von)
  values (v_owner, p_einsatz_id, p_pfad, p_dateiname, p_groesse_bytes, v_uid)
  returning id into v_neu;
  return v_neu;
end; $function$
;

CREATE OR REPLACE FUNCTION public.darf_ich_verteilen()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(darf_verteilen, false)
  from public.mitarbeiter
  where auth_user_id = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.hr_notify_on_abwesenheit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ma_name text;
  v_titel text;
  v_text  text;
  v_typ   text;
begin
  -- Nur benachrichtigen, wenn der EINREICHER NICHT der Chef (Owner) ist
  -- (d.h. ein Mitarbeiter im Self-Service hat eingereicht)
  if auth.uid() is not distinct from NEW.owner_user_id then
    return NEW;
  end if;

  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into ma_name
    from public.mitarbeiter
   where id = NEW.mitarbeiter_id;

  if NEW.typ = 'urlaub' then
    v_typ := 'urlaubsantrag';
    v_titel := 'Neuer Urlaubsantrag';
    v_text := coalesce(ma_name, 'Ein Mitarbeiter') || ' hat Urlaub vom '
              || to_char(NEW.von, 'DD.MM.YYYY') || ' bis ' || to_char(NEW.bis, 'DD.MM.YYYY')
              || ' beantragt (' || coalesce(NEW.tage, 0) || ' Tage).';
  elsif NEW.typ = 'krankheit' then
    v_typ := 'krankmeldung';
    v_titel := 'Neue Krankmeldung';
    v_text := coalesce(ma_name, 'Ein Mitarbeiter') || ' hat sich krankgemeldet vom '
              || to_char(NEW.von, 'DD.MM.YYYY') || ' bis ' || to_char(NEW.bis, 'DD.MM.YYYY')
              || coalesce(case when NEW.au_vorhanden then ' (AU liegt vor)' else '' end, '') || '.';
  else
    return NEW;
  end if;

  insert into public.hr_benachrichtigungen (owner_user_id, mitarbeiter_id, typ, titel, text, link, gelesen)
  values (NEW.owner_user_id, NEW.mitarbeiter_id, v_typ, v_titel, v_text, '/dashboard/personal', false);

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sortiment_analyse(p_von timestamp with time zone DEFAULT (now() - '90 days'::interval), p_bis timestamp with time zone DEFAULT now())
 RETURNS TABLE(artikel_id uuid, artikelnummer text, bezeichnung text, kategorie text, einheit text, verbrauch numeric, verbrauchswert numeric, umsatz numeric, deckungsbeitrag numeric, bestand numeric, lagerwert_gebunden numeric, umschlag numeric, reichweite_tage numeric, abc_klasse text, status text, preis_pflege text, letzter_abgang timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH parameter AS (
    SELECT
      p_von AS von,
      p_bis AS bis,
      GREATEST((p_bis::date - p_von::date), 1) AS tage   -- Schutz gegen Division durch 0
  ),
  bewegung AS (
    SELECT
      lb.artikel_id,
      SUM(lb.menge)       FILTER (WHERE lb.typ = 'ausgang') AS menge_ausgang,
      MAX(lb.bewegung_am) FILTER (WHERE lb.typ = 'ausgang') AS letzter_abgang
    FROM lagerbewegungen lb
    CROSS JOIN parameter p
    WHERE lb.bewegung_am BETWEEN p.von AND p.bis
    GROUP BY lb.artikel_id
  ),
  basis AS (
    SELECT
      a.id AS artikel_id,
      a.artikelnummer,
      a.bezeichnung,
      a.kategorie,
      a.einheit,
      COALESCE(b.menge_ausgang, 0)                                        AS menge_ausgang,
      a.aktueller_bestand,
      a.verkaufspreis,
      ROUND(COALESCE(b.menge_ausgang,0) * COALESCE(a.einkaufspreis,0), 2) AS verbrauchswert,
      ROUND(a.aktueller_bestand * COALESCE(a.einkaufspreis,0), 2)         AS lagerwert_gebunden,
      CASE WHEN COALESCE(a.verkaufspreis,0) > 0
           THEN ROUND(COALESCE(b.menge_ausgang,0) * a.verkaufspreis, 2) END AS umsatz,
      CASE WHEN COALESCE(a.verkaufspreis,0) > 0
           THEN ROUND(COALESCE(b.menge_ausgang,0)
                      * (a.verkaufspreis - COALESCE(a.einkaufspreis,0)), 2) END AS deckungsbeitrag,
      b.letzter_abgang,
      p.tage
    FROM artikel a
    CROSS JOIN parameter p
    LEFT JOIN bewegung b ON b.artikel_id = a.id
    WHERE a.aktiv = true
  ),
  ranking AS (
    SELECT
      basis.*,
      SUM(verbrauchswert) OVER ()                                                      AS wert_gesamt,
      SUM(verbrauchswert) OVER (ORDER BY verbrauchswert DESC ROWS UNBOUNDED PRECEDING) AS wert_kum
    FROM basis
  )
  SELECT
    r.artikel_id,
    r.artikelnummer,
    r.bezeichnung,
    r.kategorie,
    r.einheit,
    r.menge_ausgang     AS verbrauch,
    r.verbrauchswert,
    r.umsatz,
    r.deckungsbeitrag,
    r.aktueller_bestand AS bestand,
    r.lagerwert_gebunden,
    ROUND(r.menge_ausgang / NULLIF(r.aktueller_bestand,0), 2) AS umschlag,
    CASE WHEN r.menge_ausgang > 0
         THEN ROUND(r.aktueller_bestand / (r.menge_ausgang / NULLIF(r.tage,0)), 0) END AS reichweite_tage,
    CASE WHEN COALESCE(r.wert_gesamt,0) = 0 THEN '—'
         WHEN 100.0*r.wert_kum/r.wert_gesamt <= 80 THEN 'A'
         WHEN 100.0*r.wert_kum/r.wert_gesamt <= 95 THEN 'B'
         ELSE 'C' END AS abc_klasse,
    CASE WHEN r.menge_ausgang = 0 THEN 'LADENHÜTER' ELSE 'läuft' END AS status,
    CASE WHEN COALESCE(r.verkaufspreis,0) = 0 THEN 'VK fehlt' ELSE 'ok' END AS preis_pflege,
    r.letzter_abgang
  FROM ranking r
  ORDER BY r.verbrauchswert DESC, r.bezeichnung;
$function$
;

CREATE OR REPLACE FUNCTION public.mein_leistungskatalog()
 RETURNS TABLE(id uuid, bezeichnung text, einheit text, einheitspreis_netto numeric, festpreis_netto numeric, stundensatz_netto numeric, mwst_satz numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, bezeichnung, einheit, einheitspreis_netto, festpreis_netto, stundensatz_netto, mwst_satz
  from leistungskatalog
  where owner_user_id = coalesce(mein_chef_id(), auth.uid())
    and coalesce(aktiv, true) = true
  order by bezeichnung;
$function$
;

CREATE OR REPLACE FUNCTION public.inventur_audit_readonly()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'GoBD: Inventur-Audit-Eintraege sind unveraenderbar (nur Anlegen erlaubt).';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.einsatz_foto_loeschen(p_foto_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_hochvon uuid; v_pfad text;
begin
  select owner_user_id, hochgeladen_von, pfad into v_owner, v_hochvon, v_pfad
  from einsatz_fotos where id = p_foto_id;
  if not found then raise exception 'Foto nicht gefunden'; end if;
  if not (v_owner = v_uid or v_hochvon = v_uid) then raise exception 'Keine Berechtigung'; end if;
  delete from einsatz_fotos where id = p_foto_id;
  return v_pfad;
end; $function$
;

CREATE OR REPLACE FUNCTION public.chat_team_kollegen(p_kanal uuid)
 RETURNS TABLE(k_auth_user_id uuid, k_anzeige text, k_email text, k_ist_mitglied boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  select m.owner_user_id into v_owner
    from public.mitarbeiter m where m.auth_user_id = auth.uid() limit 1;
  if v_owner is null then v_owner := auth.uid(); end if;
  return query
  select m.auth_user_id,
    coalesce(nullif(trim(coalesce(m.vorname,'') || ' ' || coalesce(m.nachname,'')), ''),
             split_part(m.email, '@', 1)),
    m.email,
    exists (select 1 from public.chat_mitglieder cm
              where cm.kanal_id = p_kanal and cm.user_id = m.auth_user_id)
  from public.mitarbeiter m
  where m.owner_user_id = v_owner and m.auth_user_id is not null
    and m.auth_user_id <> auth.uid()
  order by 2;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fn_artikel_preis_historie()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.einkaufspreis is distinct from old.einkaufspreis then
    insert into public.preis_historie(owner_user_id, artikel_id, feld, alt_wert, neu_wert, geaendert_von)
    values (new.owner_user_id, new.id, 'einkaufspreis', old.einkaufspreis, new.einkaufspreis, auth.uid());
  end if;
  if new.verkaufspreis is distinct from old.verkaufspreis then
    insert into public.preis_historie(owner_user_id, artikel_id, feld, alt_wert, neu_wert, geaendert_von)
    values (new.owner_user_id, new.id, 'verkaufspreis', old.verkaufspreis, new.verkaufspreis, auth.uid());
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_kanal_ersteller_als_mitglied()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.chat_mitglieder (kanal_id, user_id)
  values (new.id, new.erstellt_von)
  on conflict (kanal_id, user_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hr_notify_on_schicht_tausch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ma_name  text;
  v_titel  text;
  v_text   text;
  s_datum  date;
  s_beginn time;
  s_ende   time;
begin
  -- Nur benachrichtigen, wenn der EINREICHER NICHT der Chef (Owner) ist
  if auth.uid() is not distinct from NEW.owner_user_id then
    return NEW;
  end if;

  -- Nur bei neuen, offenen Antraegen
  if NEW.status <> 'beantragt' then
    return NEW;
  end if;

  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into ma_name
    from public.mitarbeiter
   where id = NEW.von_mitarbeiter_id;

  select datum, beginn_um, ende_um
    into s_datum, s_beginn, s_ende
    from public.hr_schichten
   where id = NEW.schicht_id;

  v_titel := 'Neue Schichttausch-Anfrage';
  v_text := coalesce(ma_name, 'Ein Mitarbeiter') || ' moechte die Schicht am '
    || coalesce(to_char(s_datum, 'DD.MM.YYYY'), '?')
    || coalesce(' (' || to_char(s_beginn, 'HH24:MI') || '-' || to_char(s_ende, 'HH24:MI') || ')', '')
    || ' abgeben'
    || coalesce(' - Grund: ' || NEW.grund, '') || '.';

  insert into public.hr_benachrichtigungen
    (owner_user_id, mitarbeiter_id, typ, titel, text, link, gelesen)
  values
    (NEW.owner_user_id, NEW.von_mitarbeiter_id, 'schicht_tausch', v_titel, v_text, '/dashboard/schichtplan', false);

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.naechste_holz_auftragsnummer(p_owner uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  jahr text := to_char(now(), 'YYYY');
  n integer;
begin
  select coalesce(max((regexp_match(nummer, '^BH-' || jahr || '-(\d+)$'))[1]::integer), 0) + 1
    into n
    from public.holz_auftraege
   where owner_user_id = p_owner and nummer like 'BH-' || jahr || '-%';
  return 'BH-' || jahr || '-' || lpad(n::text, 4, '0');
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_rechnung_nummer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.rechnungsnummer IS NULL THEN
    NEW.rechnungsnummer := 'RE-'
      || to_char(coalesce(NEW.rechnungsdatum, current_date), 'YYYY')
      || '-' || lpad(nextval('rechnung_nr_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_kanal_mitglieder(p_kanal uuid)
 RETURNS TABLE(m_user_id uuid, m_anzeige text, m_ist_moderator boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ersteller uuid;
begin
  if not exists (select 1 from public.chat_mitglieder cm
                   where cm.kanal_id = p_kanal and cm.user_id = auth.uid()) then
    return; end if;
  select k.erstellt_von into v_ersteller from public.chat_kanaele k where k.id = p_kanal;
  return query
  select cm.user_id,
    coalesce(nullif(cm.anzeigename, ''),
      nullif((select trim(coalesce(mi.vorname,'') || ' ' || coalesce(mi.nachname,''))
                from public.mitarbeiter mi where mi.auth_user_id = cm.user_id limit 1), ''),
      nullif((select p.full_name from public.profiles p where p.id = cm.user_id limit 1), ''),
      (select split_part(u.email, '@', 1) from auth.users u where u.id = cm.user_id limit 1),
      'Unbekannt'),
    (cm.user_id = v_ersteller)
  from public.chat_mitglieder cm
  where cm.kanal_id = p_kanal
  order by 3 desc, 2;
end; $function$
;

CREATE OR REPLACE FUNCTION public.darf_ich_modul_aendern(p_modul text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.mitarbeiter_rechte
    where mitarbeiter_id = mein_mitarbeiter_id()
      and p_modul = any(schreib_module)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.einsatz_position_loeschen(p_position_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_erf uuid;
begin
  select owner_user_id, erfasst_von into v_owner, v_erf from einsatz_positionen where id = p_position_id;
  if not found then raise exception 'Position nicht gefunden'; end if;
  if not (v_owner = v_uid or v_erf = v_uid) then raise exception 'Keine Berechtigung'; end if;
  delete from einsatz_positionen where id = p_position_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.einsatz_status_setzen(p_einsatz_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_mid   uuid;
begin
  if p_status not in ('geplant','unterwegs','vor_ort','erledigt','abgesagt') then
    raise exception 'Ungueltiger Status: %', p_status;
  end if;

  select owner_user_id, mitarbeiter_id into v_owner, v_mid
  from einsaetze where id = p_einsatz_id;
  if not found then
    raise exception 'Einsatz nicht gefunden';
  end if;

  -- Erlaubt: Eigentuemer ODER der zugewiesene Monteur
  if not (
    v_owner = v_uid
    or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)
  ) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz';
  end if;

  update einsaetze set
    status       = p_status,
    unterwegs_am = case when p_status = 'unterwegs' and unterwegs_am is null then now() else unterwegs_am end,
    vor_ort_am   = case when p_status = 'vor_ort'   and vor_ort_am   is null then now() else vor_ort_am   end,
    erledigt_am  = case when p_status = 'erledigt'  and erledigt_am  is null then now() else erledigt_am  end
  where id = p_einsatz_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.darf_ich_modul_sehen(p_modul text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.mitarbeiter_rechte
    where mitarbeiter_id = mein_mitarbeiter_id()
      and p_modul = any(module)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.nachbestell_vorschlag()
 RETURNS TABLE(artikel_id uuid, artikelnummer text, bezeichnung text, einheit text, aktueller_bestand numeric, mindestbestand numeric, zielbestand numeric, empfohlene_menge numeric, einkaufspreis numeric, geschaetzte_kosten numeric, lieferant_id uuid, lieferant_name text, lieferant_email text, ampel text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    a.id,
    a.artikelnummer,
    a.bezeichnung,
    a.einheit,
    a.aktueller_bestand,
    a.mindestbestand,
    (a.mindestbestand * 2)                                              AS zielbestand,
    GREATEST(a.mindestbestand * 2 - a.aktueller_bestand, 0)             AS empfohlene_menge,
    a.einkaufspreis,
    ROUND(GREATEST(a.mindestbestand * 2 - a.aktueller_bestand, 0)
          * COALESCE(a.einkaufspreis, 0), 2)                           AS geschaetzte_kosten,
    a.lieferant_id,
    l.name                                                             AS lieferant_name,
    l.email                                                            AS lieferant_email,
    CASE WHEN a.aktueller_bestand <= 0 THEN 'rot' ELSE 'gelb' END       AS ampel
  FROM artikel a
  LEFT JOIN lieferanten l ON l.id = a.lieferant_id
  WHERE a.aktiv = true
    AND a.mindestbestand > 0
    AND a.aktueller_bestand <= a.mindestbestand
  ORDER BY (a.aktueller_bestand <= 0) DESC, l.name NULLS LAST, a.bezeichnung;
$function$
;

CREATE OR REPLACE FUNCTION public.zahlung_rechnung_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ziel uuid;
begin
  if (tg_op = 'DELETE') then
    v_ziel := old.rechnung_id;
  else
    v_ziel := new.rechnung_id;
  end if;

  perform public.rechnung_zahlbetrag_neu_berechnen(v_ziel);

  -- Falls eine Zahlung auf eine andere Rechnung umgehängt wurde: alte auch neu rechnen
  if (tg_op = 'UPDATE' and old.rechnung_id is distinct from new.rechnung_id) then
    perform public.rechnung_zahlbetrag_neu_berechnen(old.rechnung_id);
  end if;

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.chat_mitglied_hinzufuegen(p_kanal uuid, p_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ersteller uuid; v_anzeige text;
begin
  select erstellt_von into v_ersteller from public.chat_kanaele where id = p_kanal;
  if v_ersteller is null then return 'Kanal nicht gefunden.'; end if;
  if v_ersteller <> auth.uid() then
    return 'Nur der Moderator des Kanals darf Kollegen einladen.'; end if;
  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into v_anzeige from public.mitarbeiter where auth_user_id = p_user limit 1;
  insert into public.chat_mitglieder (kanal_id, user_id, anzeigename)
  values (p_kanal, p_user, nullif(v_anzeige, ''))
  on conflict (kanal_id, user_id) do nothing;
  return 'ok';
end; $function$
;

CREATE OR REPLACE FUNCTION public.chat_mitglied_per_email(p_kanal uuid, p_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user      uuid;
  v_ersteller uuid;
begin
  select erstellt_von into v_ersteller
  from public.chat_kanaele where id = p_kanal;

  if v_ersteller is null then
    return 'Kanal nicht gefunden.';
  end if;

  if v_ersteller <> auth.uid() then
    return 'Nur der Ersteller des Kanals darf Kollegen einladen.';
  end if;

  select id into v_user
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_user is null then
    return 'Kein Nutzer mit dieser E-Mail gefunden.';
  end if;

  insert into public.chat_mitglieder (kanal_id, user_id)
  values (p_kanal, v_user)
  on conflict (kanal_id, user_id) do nothing;

  return 'ok';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.einsatz_position_speichern(p_einsatz_id uuid, p_leistungskatalog_id uuid, p_bezeichnung text, p_menge numeric, p_einheit text, p_einzelpreis_netto numeric, p_mwst_satz numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mid uuid; v_neu uuid;
begin
  select owner_user_id, mitarbeiter_id into v_owner, v_mid from einsaetze where id = p_einsatz_id;
  if not found then raise exception 'Einsatz nicht gefunden'; end if;
  if not (v_owner = v_uid
     or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz';
  end if;
  insert into einsatz_positionen (owner_user_id, einsatz_id, leistungskatalog_id, bezeichnung, menge, einheit, einzelpreis_netto, mwst_satz, erfasst_von)
  values (v_owner, p_einsatz_id, p_leistungskatalog_id, p_bezeichnung, coalesce(p_menge,1), p_einheit, coalesce(p_einzelpreis_netto,0), coalesce(p_mwst_satz,19), v_uid)
  returning id into v_neu;
  return v_neu;
end; $function$
;

CREATE OR REPLACE FUNCTION public.rechnung_zahlbetrag_neu_berechnen(p_rechnung_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_summe         numeric;
  v_letztes_datum date;
  v_brutto        numeric;
  v_status        text;
begin
  select coalesce(sum(betrag), 0), max(zahlungsdatum)
    into v_summe, v_letztes_datum
    from public.zahlungen
    where rechnung_id = p_rechnung_id;

  select brutto_summe, zahlungsstatus
    into v_brutto, v_status
    from public.rechnungen
    where id = p_rechnung_id;

  -- Nur Standard-Status automatisch pflegen; Sonderstatus in Ruhe lassen
  if v_status not in ('offen', 'teilbezahlt', 'bezahlt') then
    update public.rechnungen
      set bezahlter_betrag = v_summe, updated_at = now()
      where id = p_rechnung_id;
    return;
  end if;

  update public.rechnungen
    set bezahlter_betrag = v_summe,
        bezahlt_am = case
            when v_brutto > 0 and v_summe >= v_brutto then v_letztes_datum
            else null
          end,
        zahlungsstatus = case
            when v_brutto > 0 and v_summe >= v_brutto then 'bezahlt'
            when v_summe > 0 then 'teilbezahlt'
            else 'offen'
          end,
        updated_at = now()
    where id = p_rechnung_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verfuegbarkeiten_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.owner_user_id is null then
      new.owner_user_id := coalesce(mein_chef_id(), auth.uid());
    end if;
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mein_mitarbeiter_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.mitarbeiter where auth_user_id = auth.uid() limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.set_aktualisiert_am()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.aktualisiert_am = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.termine_set_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.owner_user_id is null then
      new.owner_user_id := coalesce(mein_chef_id(), auth.uid());
    end if;
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.erp_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;

CREATE OR REPLACE FUNCTION public.ist_chat_mitglied(p_kanal uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.chat_mitglieder
    where kanal_id = p_kanal and user_id = p_user
  );
$function$
;

CREATE OR REPLACE FUNCTION public.vertraege_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;

CREATE OR REPLACE FUNCTION public.mahnwesen_uebersicht(p_owner uuid DEFAULT auth.uid())
 RETURNS TABLE(id uuid, rechnungsnummer text, titel text, kontakt_id uuid, firma_id uuid, brutto_summe numeric, bezahlter_betrag numeric, offener_betrag numeric, rechnungsdatum date, faelligkeit_effektiv date, tage_ueberfaellig integer, mahnstufe integer, letzte_mahnung_am date, empfohlene_mahnstufe integer, aktion_faellig boolean, ampel text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH basis AS (
    SELECT
      r.id, r.rechnungsnummer, r.titel, r.kontakt_id, r.firma_id,
      r.brutto_summe, r.bezahlter_betrag,
      GREATEST(r.brutto_summe - r.bezahlter_betrag, 0) AS offener_betrag,
      r.rechnungsdatum,
      COALESCE(r.faelligkeitsdatum, r.rechnungsdatum + r.zahlungsziel_tage) AS faelligkeit_effektiv,
      r.mahnstufe, r.letzte_mahnung_am
    FROM rechnungen r
    WHERE r.owner_user_id = p_owner
      AND r.zahlungsstatus = 'offen'
  ),
  berechnet AS (
    SELECT
      b.*,
      (CURRENT_DATE - b.faelligkeit_effektiv)::integer AS tage_ueberfaellig,
      CASE WHEN b.letzte_mahnung_am IS NOT NULL
           THEN (CURRENT_DATE - b.letzte_mahnung_am)::integer END AS tage_seit_mahnung
    FROM basis b
  ),
  bewertet AS (
    SELECT
      c.*,
      CASE
        WHEN c.tage_ueberfaellig <= 0 THEN 0                                        -- noch nicht fällig
        WHEN c.mahnstufe = 0 THEN 1                                                 -- überfällig, noch nie gemahnt → 1. Mahnung
        WHEN c.mahnstufe = 1 AND COALESCE(c.tage_seit_mahnung, 999) >= 7 THEN 2     -- 7 Tage nach 1. → 2.
        WHEN c.mahnstufe = 2 AND COALESCE(c.tage_seit_mahnung, 999) >= 7 THEN 3     -- 7 Tage nach 2. → 3.
        ELSE c.mahnstufe                                                            -- sonst aktuelle Stufe halten
      END AS empfohlene_mahnstufe
    FROM berechnet c
  )
  SELECT
    w.id, w.rechnungsnummer, w.titel, w.kontakt_id, w.firma_id,
    w.brutto_summe, w.bezahlter_betrag, w.offener_betrag,
    w.rechnungsdatum, w.faelligkeit_effektiv, w.tage_ueberfaellig,
    w.mahnstufe, w.letzte_mahnung_am,
    w.empfohlene_mahnstufe,
    (w.empfohlene_mahnstufe > w.mahnstufe) AS aktion_faellig,
    CASE
      WHEN w.tage_ueberfaellig <= 0     THEN 'gruen'
      WHEN w.mahnstufe = 0              THEN 'gelb'
      WHEN w.mahnstufe IN (1, 2)        THEN 'orange'
      ELSE 'rot'
    END AS ampel
  FROM bewertet w
  ORDER BY w.tage_ueberfaellig DESC NULLS LAST;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_preis_historie_readonly()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'preis_historie ist ein GoBD-Protokoll und kann nicht geaendert oder geloescht werden.';
end;
$function$
;

CREATE TRIGGER trg_erp_owner_lagerbewegungen BEFORE INSERT ON public.lagerbewegungen FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_hrdok_updated_at BEFORE UPDATE ON public.hr_dokumente FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

CREATE TRIGGER trg_mitarbeiter_updated_at BEFORE UPDATE ON public.mitarbeiter FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

CREATE TRIGGER trg_abw_updated_at BEFORE UPDATE ON public.hr_abwesenheiten FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

CREATE TRIGGER trg_hr_notify_abwesenheit AFTER INSERT ON public.hr_abwesenheiten FOR EACH ROW EXECUTE FUNCTION hr_notify_on_abwesenheit();

CREATE TRIGGER trg_hr_einst_updated_at BEFORE UPDATE ON public.hr_einstellungen FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

CREATE TRIGGER trg_schul_updated_at BEFORE UPDATE ON public.hr_schulungen FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

CREATE TRIGGER trg_bewerber_updated_at BEFORE UPDATE ON public.bewerber FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

CREATE TRIGGER trg_check_updated_at BEFORE UPDATE ON public.hr_checklisten FOR EACH ROW EXECUTE FUNCTION argonaut_set_updated_at();

CREATE TRIGGER hr_notify_on_schicht_tausch_trg AFTER INSERT ON public.hr_schicht_tausch FOR EACH ROW EXECUTE FUNCTION hr_notify_on_schicht_tausch();

CREATE TRIGGER hr_notify_on_schicht_bestaetigung_trg AFTER INSERT OR UPDATE ON public.hr_schicht_bestaetigung FOR EACH ROW EXECUTE FUNCTION hr_notify_on_schicht_bestaetigung();

CREATE TRIGGER trg_mkt_zg_upd BEFORE UPDATE ON public.marketing_zielgruppen FOR EACH ROW EXECUTE FUNCTION marketing_set_updated_at();

CREATE TRIGGER trg_mkt_kamp_upd BEFORE UPDATE ON public.marketing_kampagnen FOR EACH ROW EXECUTE FUNCTION marketing_set_updated_at();

CREATE TRIGGER trg_mkt_inh_upd BEFORE UPDATE ON public.marketing_inhalte FOR EACH ROW EXECUTE FUNCTION marketing_set_updated_at();

CREATE TRIGGER trg_mkt_kal_upd BEFORE UPDATE ON public.marketing_kalender FOR EACH ROW EXECUTE FUNCTION marketing_set_updated_at();

CREATE TRIGGER trg_verkaufschancen_updated_at BEFORE UPDATE ON public.verkaufschancen FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

CREATE TRIGGER trg_auftraege_nummer BEFORE INSERT ON public.auftraege FOR EACH ROW EXECUTE FUNCTION set_auftragsnummer();

CREATE TRIGGER trg_auftraege_set_owner BEFORE INSERT ON public.auftraege FOR EACH ROW EXECUTE FUNCTION auftraege_set_owner();

CREATE TRIGGER trg_auftraege_updated BEFORE UPDATE ON public.auftraege FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_positionen_updated BEFORE UPDATE ON public.auftrag_positionen FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_erp_owner_lieferanten BEFORE INSERT ON public.lieferanten FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_lieferanten_updated BEFORE UPDATE ON public.lieferanten FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE TRIGGER trg_rechnung_pos_updated BEFORE UPDATE ON public.rechnung_positionen FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_rechnung_nummer BEFORE INSERT ON public.rechnungen FOR EACH ROW EXECUTE FUNCTION fn_rechnung_nummer();

CREATE TRIGGER trg_rechnungen_updated BEFORE UPDATE ON public.rechnungen FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_artikel_preis_historie AFTER UPDATE OF einkaufspreis, verkaufspreis ON public.artikel FOR EACH ROW EXECUTE FUNCTION fn_artikel_preis_historie();

CREATE TRIGGER trg_artikel_updated BEFORE UPDATE ON public.artikel FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE TRIGGER trg_erp_owner_artikel BEFORE INSERT ON public.artikel FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_bestellungen_updated BEFORE UPDATE ON public.bestellungen FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE TRIGGER trg_erp_owner_bestellungen BEFORE INSERT ON public.bestellungen FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_erp_owner_bestellpositionen BEFORE INSERT ON public.bestellpositionen FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_erp_owner_wareneingang BEFORE INSERT ON public.wareneingang FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_erp_owner_wareneingang_positionen BEFORE INSERT ON public.wareneingang_positionen FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_erp_owner_inventar BEFORE INSERT ON public.inventar FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_inventar_updated BEFORE UPDATE ON public.inventar FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE TRIGGER trg_preis_historie_readonly BEFORE DELETE OR UPDATE ON public.preis_historie FOR EACH ROW EXECUTE FUNCTION fn_preis_historie_readonly();

CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_erp_owner_fahrzeuge BEFORE INSERT ON public.fahrzeuge FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_fahrzeuge_updated BEFORE UPDATE ON public.fahrzeuge FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE TRIGGER trg_vertraege_updated BEFORE UPDATE ON public.vertraege FOR EACH ROW EXECUTE FUNCTION vertraege_set_updated_at();

CREATE TRIGGER trg_korr_updated BEFORE UPDATE ON public.korrespondenz FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chat_kanal_ersteller AFTER INSERT ON public.chat_kanaele FOR EACH ROW EXECUTE FUNCTION chat_kanal_ersteller_als_mitglied();

CREATE TRIGGER trg_zahlung_sync AFTER INSERT OR DELETE OR UPDATE ON public.zahlungen FOR EACH ROW EXECUTE FUNCTION zahlung_rechnung_sync();

CREATE TRIGGER trg_erp_owner_inventur_zaehlung BEFORE INSERT ON public.inventur_zaehlung FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_erp_owner_inventur_audit BEFORE INSERT ON public.inventur_audit FOR EACH ROW EXECUTE FUNCTION erp_set_owner();

CREATE TRIGGER trg_inventur_audit_no_delete BEFORE DELETE ON public.inventur_audit FOR EACH ROW EXECUTE FUNCTION inventur_audit_readonly();

CREATE TRIGGER trg_inventur_audit_no_update BEFORE UPDATE ON public.inventur_audit FOR EACH ROW EXECUTE FUNCTION inventur_audit_readonly();

CREATE TRIGGER trg_aufmasspos_aktualisiert BEFORE UPDATE ON public.aufmass_positionen FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_aufmasse_aktualisiert BEFORE UPDATE ON public.aufmasse FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_holz_sortiment_updated BEFORE UPDATE ON public.holz_sortiment FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

CREATE TRIGGER trg_holz_preise_updated BEFORE UPDATE ON public.holz_preise FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

CREATE TRIGGER trg_holz_rabatt_updated BEFORE UPDATE ON public.holz_mengenrabatt FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

CREATE TRIGGER trg_betriebs_standort_updated BEFORE UPDATE ON public.betriebs_standort FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

CREATE TRIGGER trg_kontakte_updated_at BEFORE UPDATE ON public.kontakte FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

CREATE TRIGGER trg_firmen_updated_at BEFORE UPDATE ON public.firmen FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

CREATE TRIGGER trg_betriebs_geheimnisse_updated BEFORE UPDATE ON public.betriebs_geheimnisse FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

CREATE TRIGGER trg_geo_routen_updated BEFORE UPDATE ON public.geo_routen FOR EACH ROW EXECUTE FUNCTION holz_set_aktualisiert_am();

CREATE TRIGGER trg_api_schluessel_updated BEFORE UPDATE ON public.api_schluessel FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_anfahrt_konfig_updated BEFORE UPDATE ON public.anfahrt_konfig FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_fahrtkosten_staffel_updated BEFORE UPDATE ON public.fahrtkosten_staffel FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_import_laeufe_updated BEFORE UPDATE ON public.import_laeufe FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_import_zeilen_updated BEFORE UPDATE ON public.import_zeilen FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_pakete_updated BEFORE UPDATE ON public.pakete FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_paket_pos_updated BEFORE UPDATE ON public.paket_positionen FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_holz_auftraege_updated BEFORE UPDATE ON public.holz_auftraege FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER trg_holz_apos_updated BEFORE UPDATE ON public.holz_auftrag_positionen FOR EACH ROW EXECUTE FUNCTION set_aktualisiert_am();

CREATE TRIGGER verfuegbarkeiten_set_owner BEFORE INSERT OR UPDATE ON public.verfuegbarkeiten FOR EACH ROW EXECUTE FUNCTION verfuegbarkeiten_set_owner();

CREATE TRIGGER termine_set_owner BEFORE INSERT OR UPDATE ON public.termine FOR EACH ROW EXECUTE FUNCTION termine_set_owner();

CREATE TRIGGER termin_arten_set_owner BEFORE INSERT OR UPDATE ON public.termin_arten FOR EACH ROW EXECUTE FUNCTION termin_arten_set_owner();

CREATE TRIGGER einsaetze_set_owner BEFORE INSERT ON public.einsaetze FOR EACH ROW EXECUTE FUNCTION einsaetze_set_owner();

CREATE TRIGGER trg_erechnung_archiv_owner BEFORE INSERT ON public.erechnung_archiv FOR EACH ROW EXECUTE FUNCTION erechnung_archiv_set_owner();
