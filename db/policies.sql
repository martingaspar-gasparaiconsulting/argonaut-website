-- ============================================================================
-- ARGONAUT OS · db/policies.sql
-- Stand: 15.07.2026 · Supabase-Projekt znrjnndfzzydnhbyntwa (eu-north-1)
-- ----------------------------------------------------------------------------
-- WARUM DIESE DATEI (Q5):
--   Das komplette Rechte-Fundament von ARGONAUT lebte bis heute AUSSCHLIESSLICH
--   in Supabase — nicht im Repo, nicht in git. Ein Unfall am Projekt haette
--   Monate Rechte-Arbeit vernichtet. Ab jetzt liegt der Stand versioniert im
--   Code: jede Aenderung ist im git-Diff sichtbar, jeder Stand wiederherstellbar.
--
-- INHALT:
--   119 Tabellen mit aktivierter RLS
--   372 Policies
--   (Funktionen + Trigger folgen in db/funktionen.sql bzw. db/trigger.sql)
--
-- ERZEUGT DURCH: read-only Abfrage auf pg_policies + pg_class.
--   Diese Datei ist ein ABBILD des Live-Stands, keine Handarbeit. Bei Aenderungen
--   an den Policies in Supabase: Abfrage erneut laufen lassen, Datei ersetzen,
--   committen. Dann bleibt git die Wahrheit.
--
-- ⚠️ WIEDERHERSTELLUNG — BITTE LESEN:
--   Dieses Skript ist idempotent (drop policy if exists + create policy) und
--   laesst sich gefahrlos mehrfach ausfuehren. ABER: es setzt die Policies auf
--   GENAU DIESEN STAND zurueck. Wird es auf einer Datenbank ausgefuehrt, die
--   seither NEUERE Policies bekommen hat, gehen diese verloren.
--   -> Vor dem Ausfuehren auf Produktion IMMER pruefen, ob die Datei aktuell ist.
--   -> Im Normalbetrieb wird diese Datei NICHT ausgefuehrt. Sie ist Dokumentation
--      und Notfall-Reserve.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- TEIL 1 · Row Level Security aktivieren  (119 Tabellen)
-- ════════════════════════════════════════════════════════════════════════════

alter table public.abteilungen enable row level security;
alter table public.academy_kurse enable row level security;
alter table public.agents enable row level security;
alter table public.anfahrt_konfig enable row level security;
alter table public.api_schluessel enable row level security;
alter table public.artikel enable row level security;
alter table public.aufgaben enable row level security;
alter table public.aufgaben_kommentare enable row level security;
alter table public.aufmass_positionen enable row level security;
alter table public.aufmasse enable row level security;
alter table public.auftraege enable row level security;
alter table public.auftrag_positionen enable row level security;
alter table public.ausgaben enable row level security;
alter table public.automatisierungen enable row level security;
alter table public.benachrichtigungen enable row level security;
alter table public.bestellpositionen enable row level security;
alter table public.bestellungen enable row level security;
alter table public.betriebs_geheimnisse enable row level security;
alter table public.betriebs_standort enable row level security;
alter table public.bewerber enable row level security;
alter table public.buchungen enable row level security;
alter table public.chat_kanaele enable row level security;
alter table public.chat_mitglieder enable row level security;
alter table public.chat_nachrichten enable row level security;
alter table public.churned_customers enable row level security;
alter table public.customers enable row level security;
alter table public.demo_hr_backup enable row level security;
alter table public.document_agents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.documents enable row level security;
alter table public.einsaetze enable row level security;
alter table public.einsatz_fotos enable row level security;
alter table public.einsatz_positionen enable row level security;
alter table public.erechnung_archiv enable row level security;
alter table public.erstellte_dokumente enable row level security;
alter table public.fahrtkosten_staffel enable row level security;
alter table public.fahrzeuge enable row level security;
alter table public.finanz_szenarien enable row level security;
alter table public.firmen enable row level security;
alter table public.geo_routen enable row level security;
alter table public.gobd_verfahrensdoku enable row level security;
alter table public.holz_auftraege enable row level security;
alter table public.holz_auftrag_positionen enable row level security;
alter table public.holz_mengenrabatt enable row level security;
alter table public.holz_preise enable row level security;
alter table public.holz_sortiment enable row level security;
alter table public.hr_abwesenheiten enable row level security;
alter table public.hr_benachrichtigungen enable row level security;
alter table public.hr_checklisten enable row level security;
alter table public.hr_checklisten_abschluss enable row level security;
alter table public.hr_checklisten_vorlagen enable row level security;
alter table public.hr_dokumente enable row level security;
alter table public.hr_einstellungen enable row level security;
alter table public.hr_schicht_bestaetigung enable row level security;
alter table public.hr_schicht_tausch enable row level security;
alter table public.hr_schicht_vorlagen enable row level security;
alter table public.hr_schichten enable row level security;
alter table public.hr_schulungen enable row level security;
alter table public.hr_zeit_korrekturen enable row level security;
alter table public.hr_zeiterfassung enable row level security;
alter table public.import_laeufe enable row level security;
alter table public.import_zeilen enable row level security;
alter table public.inventar enable row level security;
alter table public.inventur_audit enable row level security;
alter table public.inventur_zaehlung enable row level security;
alter table public.kontakt_aktivitaeten enable row level security;
alter table public.kontakt_tag_zuordnung enable row level security;
alter table public.kontakt_tags enable row level security;
alter table public.kontakte enable row level security;
alter table public.korrespondenz enable row level security;
alter table public.lagerbewegungen enable row level security;
alter table public.leads enable row level security;
alter table public.leistungskatalog enable row level security;
alter table public.lieferanten enable row level security;
alter table public.mahnung_historie enable row level security;
alter table public.marketing_inhalte enable row level security;
alter table public.marketing_kalender enable row level security;
alter table public.marketing_kampagnen enable row level security;
alter table public.marketing_zielgruppen enable row level security;
alter table public.meilensteine enable row level security;
alter table public.mitarbeiter enable row level security;
alter table public.mitarbeiter_rechte enable row level security;
alter table public.objekt_zeiten enable row level security;
alter table public.objekte enable row level security;
alter table public.paket_positionen enable row level security;
alter table public.pakete enable row level security;
alter table public.preis_historie enable row level security;
alter table public.profiles enable row level security;
alter table public.projekt_beteiligte enable row level security;
alter table public.projekt_teams enable row level security;
alter table public.projekt_vorlagen enable row level security;
alter table public.projekte enable row level security;
alter table public.rechnung_positionen enable row level security;
alter table public.rechnungen enable row level security;
alter table public.ressourcen enable row level security;
alter table public.tenant_module enable row level security;
alter table public.termin_arten enable row level security;
alter table public.termine enable row level security;
alter table public.ticket_verlauf enable row level security;
alter table public.tickets enable row level security;
alter table public.training_data enable row level security;
alter table public.usage_tracking enable row level security;
alter table public.verfuegbarkeiten enable row level security;
alter table public.verkaufschancen enable row level security;
alter table public.vertraege enable row level security;
alter table public.vorlagen_aufgaben enable row level security;
alter table public.wareneingang enable row level security;
alter table public.wareneingang_positionen enable row level security;
alter table public.wartungsvertraege enable row level security;
alter table public.werkstatt_anhaenge enable row level security;
alter table public.werkstatt_auftraege enable row level security;
alter table public.werkstatt_fahrzeug_halter_log enable row level security;
alter table public.werkstatt_fahrzeuge enable row level security;
alter table public.werkstatt_freigabe_log enable row level security;
alter table public.werkstatt_material_buchungen enable row level security;
alter table public.werkstatt_positionen enable row level security;
alter table public.werkstatt_status_log enable row level security;
alter table public.zahlungen enable row level security;
alter table public.zusammenfuehrungen enable row level security;


-- ════════════════════════════════════════════════════════════════════════════
-- TEIL 2 · Policies  (372 Stueck)
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists abteilungen_cud on public.abteilungen;
create policy abteilungen_cud on public.abteilungen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists abteilungen_select on public.abteilungen;
create policy abteilungen_select on public.abteilungen
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = auth.uid()) OR (owner_user_id = mein_chef_id())));

drop policy if exists academy_read_all on public.academy_kurse;
create policy academy_read_all on public.academy_kurse
  as PERMISSIVE for SELECT to public
  using (true);

drop policy if exists agents_read_all on public.agents;
create policy agents_read_all on public.agents
  as PERMISSIVE for SELECT to public
  using (true);

drop policy if exists anfahrt_konfig_delete on public.anfahrt_konfig;
create policy anfahrt_konfig_delete on public.anfahrt_konfig
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists anfahrt_konfig_insert on public.anfahrt_konfig;
create policy anfahrt_konfig_insert on public.anfahrt_konfig
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists anfahrt_konfig_ma_select on public.anfahrt_konfig;
create policy anfahrt_konfig_ma_select on public.anfahrt_konfig
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists anfahrt_konfig_select on public.anfahrt_konfig;
create policy anfahrt_konfig_select on public.anfahrt_konfig
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists anfahrt_konfig_update on public.anfahrt_konfig;
create policy anfahrt_konfig_update on public.anfahrt_konfig
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists artikel_mitarbeiter on public.artikel;
create policy artikel_mitarbeiter on public.artikel
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists artikel_owner on public.artikel;
create policy artikel_owner on public.artikel
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists aufgaben_owner_all on public.aufgaben;
create policy aufgaben_owner_all on public.aufgaben
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists aufgaben_select_mitarbeiter on public.aufgaben;
create policy aufgaben_select_mitarbeiter on public.aufgaben
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists aufgaben_komm_owner_all on public.aufgaben_kommentare;
create policy aufgaben_komm_owner_all on public.aufgaben_kommentare
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists aufmpos_delete on public.aufmass_positionen;
create policy aufmpos_delete on public.aufmass_positionen
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists aufmpos_insert on public.aufmass_positionen;
create policy aufmpos_insert on public.aufmass_positionen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists aufmpos_ma_select on public.aufmass_positionen;
create policy aufmpos_ma_select on public.aufmass_positionen
  as PERMISSIVE for SELECT to authenticated
  using ((owner_user_id = mein_chef_id()));

drop policy if exists aufmpos_select on public.aufmass_positionen;
create policy aufmpos_select on public.aufmass_positionen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists aufmpos_update on public.aufmass_positionen;
create policy aufmpos_update on public.aufmass_positionen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists aufm_delete on public.aufmasse;
create policy aufm_delete on public.aufmasse
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists aufm_insert on public.aufmasse;
create policy aufm_insert on public.aufmasse
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists aufm_ma_select on public.aufmasse;
create policy aufm_ma_select on public.aufmasse
  as PERMISSIVE for SELECT to authenticated
  using ((owner_user_id = mein_chef_id()));

drop policy if exists aufm_select on public.aufmasse;
create policy aufm_select on public.aufmasse
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists aufm_update on public.aufmasse;
create policy aufm_update on public.aufmasse
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists auftraege_delete_mitarbeiter on public.auftraege;
create policy auftraege_delete_mitarbeiter on public.auftraege
  as PERMISSIVE for DELETE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('auftraege'::text)));

drop policy if exists auftraege_insert_mitarbeiter on public.auftraege;
create policy auftraege_insert_mitarbeiter on public.auftraege
  as PERMISSIVE for INSERT to public
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('auftraege'::text)));

drop policy if exists auftraege_owner_all on public.auftraege;
create policy auftraege_owner_all on public.auftraege
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists auftraege_select_mitarbeiter on public.auftraege;
create policy auftraege_select_mitarbeiter on public.auftraege
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists auftraege_update_mitarbeiter on public.auftraege;
create policy auftraege_update_mitarbeiter on public.auftraege
  as PERMISSIVE for UPDATE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('auftraege'::text)))
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('auftraege'::text)));

drop policy if exists positionen_owner_all on public.auftrag_positionen;
create policy positionen_owner_all on public.auftrag_positionen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists ausgaben_delete_own on public.ausgaben;
create policy ausgaben_delete_own on public.ausgaben
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists ausgaben_insert_own on public.ausgaben;
create policy ausgaben_insert_own on public.ausgaben
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists ausgaben_select_own on public.ausgaben;
create policy ausgaben_select_own on public.ausgaben
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists ausgaben_update_own on public.ausgaben;
create policy ausgaben_update_own on public.ausgaben
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists "Alle lesen" on public.automatisierungen;
create policy "Alle lesen" on public.automatisierungen
  as PERMISSIVE for SELECT to public
  using (true);

drop policy if exists benachrichtigungen_delete on public.benachrichtigungen;
create policy benachrichtigungen_delete on public.benachrichtigungen
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists benachrichtigungen_insert on public.benachrichtigungen;
create policy benachrichtigungen_insert on public.benachrichtigungen
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists benachrichtigungen_select on public.benachrichtigungen;
create policy benachrichtigungen_select on public.benachrichtigungen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists benachrichtigungen_update on public.benachrichtigungen;
create policy benachrichtigungen_update on public.benachrichtigungen
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists bestellpositionen_mitarbeiter on public.bestellpositionen;
create policy bestellpositionen_mitarbeiter on public.bestellpositionen
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists bestellpositionen_owner on public.bestellpositionen;
create policy bestellpositionen_owner on public.bestellpositionen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists bestellungen_mitarbeiter on public.bestellungen;
create policy bestellungen_mitarbeiter on public.bestellungen
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists bestellungen_owner on public.bestellungen;
create policy bestellungen_owner on public.bestellungen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists bs_delete on public.betriebs_standort;
create policy bs_delete on public.betriebs_standort
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists bs_insert on public.betriebs_standort;
create policy bs_insert on public.betriebs_standort
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists bs_ma_select on public.betriebs_standort;
create policy bs_ma_select on public.betriebs_standort
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists bs_select on public.betriebs_standort;
create policy bs_select on public.betriebs_standort
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists bs_update on public.betriebs_standort;
create policy bs_update on public.betriebs_standort
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists bewerber_delete_own on public.bewerber;
create policy bewerber_delete_own on public.bewerber
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists bewerber_insert_own on public.bewerber;
create policy bewerber_insert_own on public.bewerber
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists bewerber_select_own on public.bewerber;
create policy bewerber_select_own on public.bewerber
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists bewerber_update_own on public.bewerber;
create policy bewerber_update_own on public.bewerber
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists buchungen_delete on public.buchungen;
create policy buchungen_delete on public.buchungen
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists buchungen_insert on public.buchungen;
create policy buchungen_insert on public.buchungen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists buchungen_select on public.buchungen;
create policy buchungen_select on public.buchungen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists buchungen_select_mitarbeiter on public.buchungen;
create policy buchungen_select_mitarbeiter on public.buchungen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists buchungen_update on public.buchungen;
create policy buchungen_update on public.buchungen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists kanaele_delete on public.chat_kanaele;
create policy kanaele_delete on public.chat_kanaele
  as PERMISSIVE for DELETE to public
  using ((erstellt_von = auth.uid()));

drop policy if exists kanaele_insert on public.chat_kanaele;
create policy kanaele_insert on public.chat_kanaele
  as PERMISSIVE for INSERT to public
  with check ((erstellt_von = auth.uid()));

drop policy if exists kanaele_select on public.chat_kanaele;
create policy kanaele_select on public.chat_kanaele
  as PERMISSIVE for SELECT to public
  using (((erstellt_von = auth.uid()) OR ist_chat_mitglied(id, auth.uid())));

drop policy if exists kanaele_update on public.chat_kanaele;
create policy kanaele_update on public.chat_kanaele
  as PERMISSIVE for UPDATE to public
  using ((erstellt_von = auth.uid()))
  with check ((erstellt_von = auth.uid()));

drop policy if exists mitglieder_delete on public.chat_mitglieder;
create policy mitglieder_delete on public.chat_mitglieder
  as PERMISSIVE for DELETE to public
  using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM chat_kanaele k
  WHERE ((k.id = chat_mitglieder.kanal_id) AND (k.erstellt_von = auth.uid()))))));

drop policy if exists mitglieder_insert on public.chat_mitglieder;
create policy mitglieder_insert on public.chat_mitglieder
  as PERMISSIVE for INSERT to public
  with check (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM chat_kanaele k
  WHERE ((k.id = chat_mitglieder.kanal_id) AND (k.erstellt_von = auth.uid()))))));

drop policy if exists mitglieder_select on public.chat_mitglieder;
create policy mitglieder_select on public.chat_mitglieder
  as PERMISSIVE for SELECT to public
  using (((user_id = auth.uid()) OR ist_chat_mitglied(kanal_id, auth.uid())));

drop policy if exists nachrichten_delete on public.chat_nachrichten;
create policy nachrichten_delete on public.chat_nachrichten
  as PERMISSIVE for DELETE to public
  using ((absender_id = auth.uid()));

drop policy if exists nachrichten_insert on public.chat_nachrichten;
create policy nachrichten_insert on public.chat_nachrichten
  as PERMISSIVE for INSERT to public
  with check ((ist_chat_mitglied(kanal_id, auth.uid()) AND ((absender_id = auth.uid()) OR (ist_ki = true))));

drop policy if exists nachrichten_select on public.chat_nachrichten;
create policy nachrichten_select on public.chat_nachrichten
  as PERMISSIVE for SELECT to public
  using (ist_chat_mitglied(kanal_id, auth.uid()));

drop policy if exists "Users can read own customer data" on public.customers;
create policy "Users can read own customer data" on public.customers
  as PERMISSIVE for SELECT to public
  using ((email = (auth.jwt() ->> 'email'::text)));

drop policy if exists "Eigene Agenten einfügen" on public.document_agents;
create policy "Eigene Agenten einfügen" on public.document_agents
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = user_id));

drop policy if exists "Eigene Agenten lesen" on public.document_agents;
create policy "Eigene Agenten lesen" on public.document_agents
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = user_id));

drop policy if exists "Eigene Agenten löschen" on public.document_agents;
create policy "Eigene Agenten löschen" on public.document_agents
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = user_id));

drop policy if exists "Eigene Chunks einfügen" on public.document_chunks;
create policy "Eigene Chunks einfügen" on public.document_chunks
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = user_id));

drop policy if exists "Eigene Chunks lesen" on public.document_chunks;
create policy "Eigene Chunks lesen" on public.document_chunks
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = user_id));

drop policy if exists "Eigene Chunks löschen" on public.document_chunks;
create policy "Eigene Chunks löschen" on public.document_chunks
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = user_id));

drop policy if exists "Eigene Dokumente aktualisieren" on public.documents;
create policy "Eigene Dokumente aktualisieren" on public.documents
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

drop policy if exists "Eigene Dokumente einfügen" on public.documents;
create policy "Eigene Dokumente einfügen" on public.documents
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = user_id));

drop policy if exists "Eigene Dokumente lesen" on public.documents;
create policy "Eigene Dokumente lesen" on public.documents
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = user_id));

drop policy if exists "Eigene Dokumente löschen" on public.documents;
create policy "Eigene Dokumente löschen" on public.documents
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = user_id));

drop policy if exists einsaetze_delete_mitarbeiter on public.einsaetze;
create policy einsaetze_delete_mitarbeiter on public.einsaetze
  as PERMISSIVE for DELETE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('einsaetze'::text)));

drop policy if exists einsaetze_insert_mitarbeiter on public.einsaetze;
create policy einsaetze_insert_mitarbeiter on public.einsaetze
  as PERMISSIVE for INSERT to public
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('einsaetze'::text)));

drop policy if exists einsaetze_owner_all on public.einsaetze;
create policy einsaetze_owner_all on public.einsaetze
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists einsaetze_select_mitarbeiter on public.einsaetze;
create policy einsaetze_select_mitarbeiter on public.einsaetze
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists einsaetze_update_mitarbeiter on public.einsaetze;
create policy einsaetze_update_mitarbeiter on public.einsaetze
  as PERMISSIVE for UPDATE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('einsaetze'::text)))
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('einsaetze'::text)));

drop policy if exists einsatz_fotos_owner_all on public.einsatz_fotos;
create policy einsatz_fotos_owner_all on public.einsatz_fotos
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists einsatz_fotos_select_mitarbeiter on public.einsatz_fotos;
create policy einsatz_fotos_select_mitarbeiter on public.einsatz_fotos
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists einsatz_pos_owner_all on public.einsatz_positionen;
create policy einsatz_pos_owner_all on public.einsatz_positionen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists einsatz_pos_select_mitarbeiter on public.einsatz_positionen;
create policy einsatz_pos_select_mitarbeiter on public.einsatz_positionen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists erechnung_archiv_insert on public.erechnung_archiv;
create policy erechnung_archiv_insert on public.erechnung_archiv
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = COALESCE(mein_chef_id(), auth.uid())));

drop policy if exists erechnung_archiv_select on public.erechnung_archiv;
create policy erechnung_archiv_select on public.erechnung_archiv
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = COALESCE(mein_chef_id(), auth.uid())));

drop policy if exists "Eigene erstellte Dokumente lesen" on public.erstellte_dokumente;
create policy "Eigene erstellte Dokumente lesen" on public.erstellte_dokumente
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = user_id));

drop policy if exists fahrtkosten_staffel_delete on public.fahrtkosten_staffel;
create policy fahrtkosten_staffel_delete on public.fahrtkosten_staffel
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists fahrtkosten_staffel_insert on public.fahrtkosten_staffel;
create policy fahrtkosten_staffel_insert on public.fahrtkosten_staffel
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists fahrtkosten_staffel_ma_select on public.fahrtkosten_staffel;
create policy fahrtkosten_staffel_ma_select on public.fahrtkosten_staffel
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists fahrtkosten_staffel_select on public.fahrtkosten_staffel;
create policy fahrtkosten_staffel_select on public.fahrtkosten_staffel
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists fahrtkosten_staffel_update on public.fahrtkosten_staffel;
create policy fahrtkosten_staffel_update on public.fahrtkosten_staffel
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists fahrzeuge_mitarbeiter on public.fahrzeuge;
create policy fahrzeuge_mitarbeiter on public.fahrzeuge
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists fahrzeuge_owner on public.fahrzeuge;
create policy fahrzeuge_owner on public.fahrzeuge
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists finanz_szenarien_delete on public.finanz_szenarien;
create policy finanz_szenarien_delete on public.finanz_szenarien
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists finanz_szenarien_insert on public.finanz_szenarien;
create policy finanz_szenarien_insert on public.finanz_szenarien
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists finanz_szenarien_select on public.finanz_szenarien;
create policy finanz_szenarien_select on public.finanz_szenarien
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists finanz_szenarien_select_mitarbeiter on public.finanz_szenarien;
create policy finanz_szenarien_select_mitarbeiter on public.finanz_szenarien
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('finanzen'::text)));

drop policy if exists finanz_szenarien_update on public.finanz_szenarien;
create policy finanz_szenarien_update on public.finanz_szenarien
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists firmen_owner_all on public.firmen;
create policy firmen_owner_all on public.firmen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists firmen_select_mitarbeiter on public.firmen;
create policy firmen_select_mitarbeiter on public.firmen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists gr_delete on public.geo_routen;
create policy gr_delete on public.geo_routen
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists gr_insert on public.geo_routen;
create policy gr_insert on public.geo_routen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists gr_select on public.geo_routen;
create policy gr_select on public.geo_routen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists gr_update on public.geo_routen;
create policy gr_update on public.geo_routen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists gobd_delete_own on public.gobd_verfahrensdoku;
create policy gobd_delete_own on public.gobd_verfahrensdoku
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists gobd_insert_own on public.gobd_verfahrensdoku;
create policy gobd_insert_own on public.gobd_verfahrensdoku
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists gobd_select_own on public.gobd_verfahrensdoku;
create policy gobd_select_own on public.gobd_verfahrensdoku
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists gobd_update_own on public.gobd_verfahrensdoku;
create policy gobd_update_own on public.gobd_verfahrensdoku
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists holz_auftraege_delete on public.holz_auftraege;
create policy holz_auftraege_delete on public.holz_auftraege
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_auftraege_insert on public.holz_auftraege;
create policy holz_auftraege_insert on public.holz_auftraege
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists holz_auftraege_ma_select on public.holz_auftraege;
create policy holz_auftraege_ma_select on public.holz_auftraege
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists holz_auftraege_select on public.holz_auftraege;
create policy holz_auftraege_select on public.holz_auftraege
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_auftraege_select_mitarbeiter on public.holz_auftraege;
create policy holz_auftraege_select_mitarbeiter on public.holz_auftraege
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists holz_auftraege_update on public.holz_auftraege;
create policy holz_auftraege_update on public.holz_auftraege
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_auftrag_positionen_delete on public.holz_auftrag_positionen;
create policy holz_auftrag_positionen_delete on public.holz_auftrag_positionen
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_auftrag_positionen_insert on public.holz_auftrag_positionen;
create policy holz_auftrag_positionen_insert on public.holz_auftrag_positionen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists holz_auftrag_positionen_ma_select on public.holz_auftrag_positionen;
create policy holz_auftrag_positionen_ma_select on public.holz_auftrag_positionen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists holz_auftrag_positionen_select on public.holz_auftrag_positionen;
create policy holz_auftrag_positionen_select on public.holz_auftrag_positionen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_auftrag_positionen_update on public.holz_auftrag_positionen;
create policy holz_auftrag_positionen_update on public.holz_auftrag_positionen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_mengenrabatt_delete on public.holz_mengenrabatt;
create policy holz_mengenrabatt_delete on public.holz_mengenrabatt
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_mengenrabatt_insert on public.holz_mengenrabatt;
create policy holz_mengenrabatt_insert on public.holz_mengenrabatt
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists holz_mengenrabatt_ma_select on public.holz_mengenrabatt;
create policy holz_mengenrabatt_ma_select on public.holz_mengenrabatt
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists holz_mengenrabatt_select on public.holz_mengenrabatt;
create policy holz_mengenrabatt_select on public.holz_mengenrabatt
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_mengenrabatt_update on public.holz_mengenrabatt;
create policy holz_mengenrabatt_update on public.holz_mengenrabatt
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_preise_delete on public.holz_preise;
create policy holz_preise_delete on public.holz_preise
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_preise_insert on public.holz_preise;
create policy holz_preise_insert on public.holz_preise
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists holz_preise_ma_select on public.holz_preise;
create policy holz_preise_ma_select on public.holz_preise
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists holz_preise_select on public.holz_preise;
create policy holz_preise_select on public.holz_preise
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_preise_select_mitarbeiter on public.holz_preise;
create policy holz_preise_select_mitarbeiter on public.holz_preise
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists holz_preise_update on public.holz_preise;
create policy holz_preise_update on public.holz_preise
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists holz_sortiment_select_mitarbeiter on public.holz_sortiment;
create policy holz_sortiment_select_mitarbeiter on public.holz_sortiment
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists hs_delete on public.holz_sortiment;
create policy hs_delete on public.holz_sortiment
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists hs_insert on public.holz_sortiment;
create policy hs_insert on public.holz_sortiment
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists hs_mitarbeiter_select on public.holz_sortiment;
create policy hs_mitarbeiter_select on public.holz_sortiment
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists hs_select on public.holz_sortiment;
create policy hs_select on public.holz_sortiment
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists hs_update on public.holz_sortiment;
create policy hs_update on public.holz_sortiment
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists abw_delete_own on public.hr_abwesenheiten;
create policy abw_delete_own on public.hr_abwesenheiten
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists abw_insert_own on public.hr_abwesenheiten;
create policy abw_insert_own on public.hr_abwesenheiten
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists abw_insert_self on public.hr_abwesenheiten;
create policy abw_insert_self on public.hr_abwesenheiten
  as PERMISSIVE for INSERT to public
  with check ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

drop policy if exists abw_select_own on public.hr_abwesenheiten;
create policy abw_select_own on public.hr_abwesenheiten
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists abw_select_self on public.hr_abwesenheiten;
create policy abw_select_self on public.hr_abwesenheiten
  as PERMISSIVE for SELECT to public
  using ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

drop policy if exists abw_update_own on public.hr_abwesenheiten;
create policy abw_update_own on public.hr_abwesenheiten
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists hr_abwesenheiten_select_personal on public.hr_abwesenheiten;
create policy hr_abwesenheiten_select_personal on public.hr_abwesenheiten
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

drop policy if exists benach_delete_own on public.hr_benachrichtigungen;
create policy benach_delete_own on public.hr_benachrichtigungen
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists benach_insert_own on public.hr_benachrichtigungen;
create policy benach_insert_own on public.hr_benachrichtigungen
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists benach_select_own on public.hr_benachrichtigungen;
create policy benach_select_own on public.hr_benachrichtigungen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists benach_update_own on public.hr_benachrichtigungen;
create policy benach_update_own on public.hr_benachrichtigungen
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists check_delete_own on public.hr_checklisten;
create policy check_delete_own on public.hr_checklisten
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists check_insert_own on public.hr_checklisten;
create policy check_insert_own on public.hr_checklisten
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists check_select_own on public.hr_checklisten;
create policy check_select_own on public.hr_checklisten
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists check_update_own on public.hr_checklisten;
create policy check_update_own on public.hr_checklisten
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists checklisten_owner_all on public.hr_checklisten;
create policy checklisten_owner_all on public.hr_checklisten
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists checklisten_self_select on public.hr_checklisten;
create policy checklisten_self_select on public.hr_checklisten
  as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists hr_checklisten_select_personal on public.hr_checklisten;
create policy hr_checklisten_select_personal on public.hr_checklisten
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

drop policy if exists abschluss_owner_all on public.hr_checklisten_abschluss;
create policy abschluss_owner_all on public.hr_checklisten_abschluss
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists abschluss_self_insert on public.hr_checklisten_abschluss;
create policy abschluss_self_insert on public.hr_checklisten_abschluss
  as PERMISSIVE for INSERT to public
  with check ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten_abschluss.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists abschluss_self_select on public.hr_checklisten_abschluss;
create policy abschluss_self_select on public.hr_checklisten_abschluss
  as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten_abschluss.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists abschluss_self_update on public.hr_checklisten_abschluss;
create policy abschluss_self_update on public.hr_checklisten_abschluss
  as PERMISSIVE for UPDATE to public
  using ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten_abschluss.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_checklisten_abschluss.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists hr_checklisten_abschluss_select_personal on public.hr_checklisten_abschluss;
create policy hr_checklisten_abschluss_select_personal on public.hr_checklisten_abschluss
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

drop policy if exists vorlagen_owner_all on public.hr_checklisten_vorlagen;
create policy vorlagen_owner_all on public.hr_checklisten_vorlagen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists hr_dokumente_select_personal on public.hr_dokumente;
create policy hr_dokumente_select_personal on public.hr_dokumente
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

drop policy if exists hrdok_delete_own on public.hr_dokumente;
create policy hrdok_delete_own on public.hr_dokumente
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists hrdok_insert_own on public.hr_dokumente;
create policy hrdok_insert_own on public.hr_dokumente
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists hrdok_insert_self on public.hr_dokumente;
create policy hrdok_insert_self on public.hr_dokumente
  as PERMISSIVE for INSERT to public
  with check ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

drop policy if exists hrdok_select_own on public.hr_dokumente;
create policy hrdok_select_own on public.hr_dokumente
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists hrdok_select_self on public.hr_dokumente;
create policy hrdok_select_self on public.hr_dokumente
  as PERMISSIVE for SELECT to public
  using ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

drop policy if exists einst_insert_own on public.hr_einstellungen;
create policy einst_insert_own on public.hr_einstellungen
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists einst_select_own on public.hr_einstellungen;
create policy einst_select_own on public.hr_einstellungen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists einst_select_self on public.hr_einstellungen;
create policy einst_select_self on public.hr_einstellungen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id IN ( SELECT mitarbeiter.owner_user_id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

drop policy if exists einst_update_own on public.hr_einstellungen;
create policy einst_update_own on public.hr_einstellungen
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists hr_einstellungen_select_personal on public.hr_einstellungen;
create policy hr_einstellungen_select_personal on public.hr_einstellungen
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

drop policy if exists hr_schicht_best_owner_all on public.hr_schicht_bestaetigung;
create policy hr_schicht_best_owner_all on public.hr_schicht_bestaetigung
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists hr_schicht_best_self_insert on public.hr_schicht_bestaetigung;
create policy hr_schicht_best_self_insert on public.hr_schicht_bestaetigung
  as PERMISSIVE for INSERT to public
  with check ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_bestaetigung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists hr_schicht_best_self_select on public.hr_schicht_bestaetigung;
create policy hr_schicht_best_self_select on public.hr_schicht_bestaetigung
  as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_bestaetigung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists hr_schicht_best_self_update on public.hr_schicht_bestaetigung;
create policy hr_schicht_best_self_update on public.hr_schicht_bestaetigung
  as PERMISSIVE for UPDATE to public
  using ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_bestaetigung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_bestaetigung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists hr_schicht_tausch_owner_all on public.hr_schicht_tausch;
create policy hr_schicht_tausch_owner_all on public.hr_schicht_tausch
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists hr_schicht_tausch_self_insert on public.hr_schicht_tausch;
create policy hr_schicht_tausch_self_insert on public.hr_schicht_tausch
  as PERMISSIVE for INSERT to public
  with check (((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.von_mitarbeiter_id) AND (m.auth_user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM hr_schichten s
  WHERE ((s.id = hr_schicht_tausch.schicht_id) AND (s.owner_user_id = hr_schicht_tausch.owner_user_id))))));

drop policy if exists hr_schicht_tausch_self_select on public.hr_schicht_tausch;
create policy hr_schicht_tausch_self_select on public.hr_schicht_tausch
  as PERMISSIVE for SELECT to public
  using (((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.von_mitarbeiter_id) AND (m.auth_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.an_mitarbeiter_id) AND (m.auth_user_id = auth.uid()))))));

drop policy if exists hr_schicht_tausch_self_update on public.hr_schicht_tausch;
create policy hr_schicht_tausch_self_update on public.hr_schicht_tausch
  as PERMISSIVE for UPDATE to public
  using ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.von_mitarbeiter_id) AND (m.auth_user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schicht_tausch.von_mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists hr_schicht_vorlagen_owner_all on public.hr_schicht_vorlagen;
create policy hr_schicht_vorlagen_owner_all on public.hr_schicht_vorlagen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists hr_schichten_owner_all on public.hr_schichten;
create policy hr_schichten_owner_all on public.hr_schichten
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists hr_schichten_self_select on public.hr_schichten;
create policy hr_schichten_self_select on public.hr_schichten
  as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_schichten.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists hr_schulungen_select_personal on public.hr_schulungen;
create policy hr_schulungen_select_personal on public.hr_schulungen
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

drop policy if exists schul_delete_own on public.hr_schulungen;
create policy schul_delete_own on public.hr_schulungen
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists schul_insert_own on public.hr_schulungen;
create policy schul_insert_own on public.hr_schulungen
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists schul_select_own on public.hr_schulungen;
create policy schul_select_own on public.hr_schulungen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists schul_select_self on public.hr_schulungen;
create policy schul_select_self on public.hr_schulungen
  as PERMISSIVE for SELECT to public
  using ((mitarbeiter_id IN ( SELECT mitarbeiter.id
   FROM mitarbeiter
  WHERE (mitarbeiter.auth_user_id = auth.uid()))));

drop policy if exists schul_update_own on public.hr_schulungen;
create policy schul_update_own on public.hr_schulungen
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists zeitkorr_owner_all on public.hr_zeit_korrekturen;
create policy zeitkorr_owner_all on public.hr_zeit_korrekturen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists zeitkorr_self_select on public.hr_zeit_korrekturen;
create policy zeitkorr_self_select on public.hr_zeit_korrekturen
  as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeit_korrekturen.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists zeit_owner_all on public.hr_zeiterfassung;
create policy zeit_owner_all on public.hr_zeiterfassung
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists zeit_self_insert on public.hr_zeiterfassung;
create policy zeit_self_insert on public.hr_zeiterfassung
  as PERMISSIVE for INSERT to public
  with check ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeiterfassung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists zeit_self_select on public.hr_zeiterfassung;
create policy zeit_self_select on public.hr_zeiterfassung
  as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeiterfassung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists zeit_self_update_offen on public.hr_zeiterfassung;
create policy zeit_self_update_offen on public.hr_zeiterfassung
  as PERMISSIVE for UPDATE to public
  using (((gehen_um IS NULL) AND (EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeiterfassung.mitarbeiter_id) AND (m.auth_user_id = auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM mitarbeiter m
  WHERE ((m.id = hr_zeiterfassung.mitarbeiter_id) AND (m.auth_user_id = auth.uid())))));

drop policy if exists import_laeufe_delete on public.import_laeufe;
create policy import_laeufe_delete on public.import_laeufe
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists import_laeufe_insert on public.import_laeufe;
create policy import_laeufe_insert on public.import_laeufe
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists import_laeufe_select on public.import_laeufe;
create policy import_laeufe_select on public.import_laeufe
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists import_laeufe_update on public.import_laeufe;
create policy import_laeufe_update on public.import_laeufe
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists import_zeilen_delete on public.import_zeilen;
create policy import_zeilen_delete on public.import_zeilen
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists import_zeilen_insert on public.import_zeilen;
create policy import_zeilen_insert on public.import_zeilen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists import_zeilen_select on public.import_zeilen;
create policy import_zeilen_select on public.import_zeilen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists import_zeilen_update on public.import_zeilen;
create policy import_zeilen_update on public.import_zeilen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists inventar_mitarbeiter on public.inventar;
create policy inventar_mitarbeiter on public.inventar
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists inventar_owner on public.inventar;
create policy inventar_owner on public.inventar
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists inventur_audit_ma_insert on public.inventur_audit;
create policy inventur_audit_ma_insert on public.inventur_audit
  as PERMISSIVE for INSERT to authenticated
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists inventur_audit_ma_select on public.inventur_audit;
create policy inventur_audit_ma_select on public.inventur_audit
  as PERMISSIVE for SELECT to authenticated
  using ((owner_user_id = mein_chef_id()));

drop policy if exists inventur_audit_owner_insert on public.inventur_audit;
create policy inventur_audit_owner_insert on public.inventur_audit
  as PERMISSIVE for INSERT to authenticated
  with check ((owner_user_id = auth.uid()));

drop policy if exists inventur_audit_owner_select on public.inventur_audit;
create policy inventur_audit_owner_select on public.inventur_audit
  as PERMISSIVE for SELECT to authenticated
  using ((owner_user_id = auth.uid()));

drop policy if exists inventur_zaehlung_mitarbeiter on public.inventur_zaehlung;
create policy inventur_zaehlung_mitarbeiter on public.inventur_zaehlung
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists inventur_zaehlung_owner on public.inventur_zaehlung;
create policy inventur_zaehlung_owner on public.inventur_zaehlung
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists kontakt_aktivitaeten_owner_all on public.kontakt_aktivitaeten;
create policy kontakt_aktivitaeten_owner_all on public.kontakt_aktivitaeten
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists kontakt_tag_zuordnung_owner_all on public.kontakt_tag_zuordnung;
create policy kontakt_tag_zuordnung_owner_all on public.kontakt_tag_zuordnung
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists kontakt_tags_owner_all on public.kontakt_tags;
create policy kontakt_tags_owner_all on public.kontakt_tags
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists kontakte_owner_all on public.kontakte;
create policy kontakte_owner_all on public.kontakte
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists kontakte_select_mitarbeiter on public.kontakte;
create policy kontakte_select_mitarbeiter on public.kontakte
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists korr_delete on public.korrespondenz;
create policy korr_delete on public.korrespondenz
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists korr_insert on public.korrespondenz;
create policy korr_insert on public.korrespondenz
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists korr_select on public.korrespondenz;
create policy korr_select on public.korrespondenz
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists korr_update on public.korrespondenz;
create policy korr_update on public.korrespondenz
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists lagerbewegungen_mitarbeiter on public.lagerbewegungen;
create policy lagerbewegungen_mitarbeiter on public.lagerbewegungen
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists lagerbewegungen_owner on public.lagerbewegungen;
create policy lagerbewegungen_owner on public.lagerbewegungen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists leads_owner_select on public.leads;
create policy leads_owner_select on public.leads
  as PERMISSIVE for SELECT to authenticated
  using ((owner_user_id = auth.uid()));

drop policy if exists leads_owner_update on public.leads;
create policy leads_owner_update on public.leads
  as PERMISSIVE for UPDATE to authenticated
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert on public.leads
  as PERMISSIVE for INSERT to anon, authenticated
  with check (true);

drop policy if exists leistungskatalog_select_mitarbeiter on public.leistungskatalog;
create policy leistungskatalog_select_mitarbeiter on public.leistungskatalog
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists lk_delete on public.leistungskatalog;
create policy lk_delete on public.leistungskatalog
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists lk_insert on public.leistungskatalog;
create policy lk_insert on public.leistungskatalog
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists lk_select on public.leistungskatalog;
create policy lk_select on public.leistungskatalog
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists lk_update on public.leistungskatalog;
create policy lk_update on public.leistungskatalog
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists lieferanten_mitarbeiter on public.lieferanten;
create policy lieferanten_mitarbeiter on public.lieferanten
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists lieferanten_owner on public.lieferanten;
create policy lieferanten_owner on public.lieferanten
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists mahnung_historie_insert on public.mahnung_historie;
create policy mahnung_historie_insert on public.mahnung_historie
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists mahnung_historie_select on public.mahnung_historie;
create policy mahnung_historie_select on public.mahnung_historie
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists mahnung_historie_select_mitarbeiter on public.mahnung_historie;
create policy mahnung_historie_select_mitarbeiter on public.mahnung_historie
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('mahnwesen'::text)));

drop policy if exists mkt_inh_owner on public.marketing_inhalte;
create policy mkt_inh_owner on public.marketing_inhalte
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists mkt_kal_owner on public.marketing_kalender;
create policy mkt_kal_owner on public.marketing_kalender
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists mkt_kamp_owner on public.marketing_kampagnen;
create policy mkt_kamp_owner on public.marketing_kampagnen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists mkt_kamp_select_mitarbeiter on public.marketing_kampagnen;
create policy mkt_kamp_select_mitarbeiter on public.marketing_kampagnen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists mkt_zg_owner on public.marketing_zielgruppen;
create policy mkt_zg_owner on public.marketing_zielgruppen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists admin_all_meilensteine on public.meilensteine;
create policy admin_all_meilensteine on public.meilensteine
  as PERMISSIVE for ALL to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));

drop policy if exists mitarbeiter_delete_own on public.mitarbeiter;
create policy mitarbeiter_delete_own on public.mitarbeiter
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists mitarbeiter_insert_own on public.mitarbeiter;
create policy mitarbeiter_insert_own on public.mitarbeiter
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists mitarbeiter_select_own on public.mitarbeiter;
create policy mitarbeiter_select_own on public.mitarbeiter
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists mitarbeiter_select_personal on public.mitarbeiter;
create policy mitarbeiter_select_personal on public.mitarbeiter
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('personal'::text)));

drop policy if exists mitarbeiter_select_self on public.mitarbeiter;
create policy mitarbeiter_select_self on public.mitarbeiter
  as PERMISSIVE for SELECT to public
  using ((auth_user_id = auth.uid()));

drop policy if exists mitarbeiter_select_verteiler on public.mitarbeiter;
create policy mitarbeiter_select_verteiler on public.mitarbeiter
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen()));

drop policy if exists mitarbeiter_update_own on public.mitarbeiter;
create policy mitarbeiter_update_own on public.mitarbeiter
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists mr_delete on public.mitarbeiter_rechte;
create policy mr_delete on public.mitarbeiter_rechte
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists mr_insert on public.mitarbeiter_rechte;
create policy mr_insert on public.mitarbeiter_rechte
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists mr_insert_verteiler on public.mitarbeiter_rechte;
create policy mr_insert_verteiler on public.mitarbeiter_rechte
  as PERMISSIVE for INSERT to public
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen()));

drop policy if exists mr_select on public.mitarbeiter_rechte;
create policy mr_select on public.mitarbeiter_rechte
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = auth.uid()) OR (mitarbeiter_id = mein_mitarbeiter_id())));

drop policy if exists mr_select_verteiler on public.mitarbeiter_rechte;
create policy mr_select_verteiler on public.mitarbeiter_rechte
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen()));

drop policy if exists mr_update on public.mitarbeiter_rechte;
create policy mr_update on public.mitarbeiter_rechte
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists mr_update_verteiler on public.mitarbeiter_rechte;
create policy mr_update_verteiler on public.mitarbeiter_rechte
  as PERMISSIVE for UPDATE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen()))
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_verteilen()));

drop policy if exists objektzeiten_select_mitarbeiter on public.objekt_zeiten;
create policy objektzeiten_select_mitarbeiter on public.objekt_zeiten
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists objzeit_delete on public.objekt_zeiten;
create policy objzeit_delete on public.objekt_zeiten
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists objzeit_insert on public.objekt_zeiten;
create policy objzeit_insert on public.objekt_zeiten
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists objzeit_select on public.objekt_zeiten;
create policy objzeit_select on public.objekt_zeiten
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists objzeit_update on public.objekt_zeiten;
create policy objzeit_update on public.objekt_zeiten
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists objekte_delete on public.objekte;
create policy objekte_delete on public.objekte
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists objekte_insert on public.objekte;
create policy objekte_insert on public.objekte
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists objekte_select on public.objekte;
create policy objekte_select on public.objekte
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists objekte_update on public.objekte;
create policy objekte_update on public.objekte
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists paket_positionen_delete on public.paket_positionen;
create policy paket_positionen_delete on public.paket_positionen
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists paket_positionen_insert on public.paket_positionen;
create policy paket_positionen_insert on public.paket_positionen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists paket_positionen_ma_select on public.paket_positionen;
create policy paket_positionen_ma_select on public.paket_positionen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists paket_positionen_select on public.paket_positionen;
create policy paket_positionen_select on public.paket_positionen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists paket_positionen_update on public.paket_positionen;
create policy paket_positionen_update on public.paket_positionen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists pakete_delete on public.pakete;
create policy pakete_delete on public.pakete
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists pakete_insert on public.pakete;
create policy pakete_insert on public.pakete
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists pakete_ma_select on public.pakete;
create policy pakete_ma_select on public.pakete
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists pakete_select on public.pakete;
create policy pakete_select on public.pakete
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists pakete_select_mitarbeiter on public.pakete;
create policy pakete_select_mitarbeiter on public.pakete
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists pakete_update on public.pakete;
create policy pakete_update on public.pakete
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists preis_historie_insert_own on public.preis_historie;
create policy preis_historie_insert_own on public.preis_historie
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists preis_historie_select_own on public.preis_historie;
create policy preis_historie_select_own on public.preis_historie
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists "Nutzer kann eigenes Profil updaten" on public.profiles;
create policy "Nutzer kann eigenes Profil updaten" on public.profiles
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = id));

drop policy if exists "Nutzer sieht eigenes Profil" on public.profiles;
create policy "Nutzer sieht eigenes Profil" on public.profiles
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = id));

drop policy if exists projekt_beteiligte_owner_all on public.projekt_beteiligte;
create policy projekt_beteiligte_owner_all on public.projekt_beteiligte
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists projekt_teams_owner_all on public.projekt_teams;
create policy projekt_teams_owner_all on public.projekt_teams
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists projekt_vorlagen_owner_all on public.projekt_vorlagen;
create policy projekt_vorlagen_owner_all on public.projekt_vorlagen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists projekt_vorlagen_select_mitarbeiter on public.projekt_vorlagen;
create policy projekt_vorlagen_select_mitarbeiter on public.projekt_vorlagen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists projekte_owner_all on public.projekte;
create policy projekte_owner_all on public.projekte
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists projekte_select_mitarbeiter on public.projekte;
create policy projekte_select_mitarbeiter on public.projekte
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists rechnung_pos_owner_all on public.rechnung_positionen;
create policy rechnung_pos_owner_all on public.rechnung_positionen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists rechnungen_owner_all on public.rechnungen;
create policy rechnungen_owner_all on public.rechnungen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists rechnungen_select_mitarbeiter on public.rechnungen;
create policy rechnungen_select_mitarbeiter on public.rechnungen
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('rechnungen'::text)));

drop policy if exists ressourcen_delete on public.ressourcen;
create policy ressourcen_delete on public.ressourcen
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists ressourcen_insert on public.ressourcen;
create policy ressourcen_insert on public.ressourcen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists ressourcen_select on public.ressourcen;
create policy ressourcen_select on public.ressourcen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists ressourcen_update on public.ressourcen;
create policy ressourcen_update on public.ressourcen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists tenant_module_delete on public.tenant_module;
create policy tenant_module_delete on public.tenant_module
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists tenant_module_insert on public.tenant_module;
create policy tenant_module_insert on public.tenant_module
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists tenant_module_select on public.tenant_module;
create policy tenant_module_select on public.tenant_module
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = COALESCE(mein_chef_id(), auth.uid())));

drop policy if exists tenant_module_update on public.tenant_module;
create policy tenant_module_update on public.tenant_module
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists termin_arten_delete_mitarbeiter on public.termin_arten;
create policy termin_arten_delete_mitarbeiter on public.termin_arten
  as PERMISSIVE for DELETE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

drop policy if exists termin_arten_insert_mitarbeiter on public.termin_arten;
create policy termin_arten_insert_mitarbeiter on public.termin_arten
  as PERMISSIVE for INSERT to public
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

drop policy if exists termin_arten_owner_all on public.termin_arten;
create policy termin_arten_owner_all on public.termin_arten
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists termin_arten_select_mitarbeiter on public.termin_arten;
create policy termin_arten_select_mitarbeiter on public.termin_arten
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists termin_arten_update_mitarbeiter on public.termin_arten;
create policy termin_arten_update_mitarbeiter on public.termin_arten
  as PERMISSIVE for UPDATE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)))
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

drop policy if exists termine_delete_mitarbeiter on public.termine;
create policy termine_delete_mitarbeiter on public.termine
  as PERMISSIVE for DELETE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

drop policy if exists termine_insert_mitarbeiter on public.termine;
create policy termine_insert_mitarbeiter on public.termine
  as PERMISSIVE for INSERT to public
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

drop policy if exists termine_owner_all on public.termine;
create policy termine_owner_all on public.termine
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists termine_select_mitarbeiter on public.termine;
create policy termine_select_mitarbeiter on public.termine
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists termine_update_mitarbeiter on public.termine;
create policy termine_update_mitarbeiter on public.termine
  as PERMISSIVE for UPDATE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)))
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

drop policy if exists verlauf_delete on public.ticket_verlauf;
create policy verlauf_delete on public.ticket_verlauf
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists verlauf_insert on public.ticket_verlauf;
create policy verlauf_insert on public.ticket_verlauf
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists verlauf_select on public.ticket_verlauf;
create policy verlauf_select on public.ticket_verlauf
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists tickets_select_mitarbeiter on public.tickets;
create policy tickets_select_mitarbeiter on public.tickets
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists "Nutzer sieht nur eigene Daten" on public.usage_tracking;
create policy "Nutzer sieht nur eigene Daten" on public.usage_tracking
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = user_id));

drop policy if exists verfuegbarkeiten_delete_mitarbeiter on public.verfuegbarkeiten;
create policy verfuegbarkeiten_delete_mitarbeiter on public.verfuegbarkeiten
  as PERMISSIVE for DELETE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

drop policy if exists verfuegbarkeiten_insert_mitarbeiter on public.verfuegbarkeiten;
create policy verfuegbarkeiten_insert_mitarbeiter on public.verfuegbarkeiten
  as PERMISSIVE for INSERT to public
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

drop policy if exists verfuegbarkeiten_owner_all on public.verfuegbarkeiten;
create policy verfuegbarkeiten_owner_all on public.verfuegbarkeiten
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists verfuegbarkeiten_select_mitarbeiter on public.verfuegbarkeiten;
create policy verfuegbarkeiten_select_mitarbeiter on public.verfuegbarkeiten
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists verfuegbarkeiten_update_mitarbeiter on public.verfuegbarkeiten;
create policy verfuegbarkeiten_update_mitarbeiter on public.verfuegbarkeiten
  as PERMISSIVE for UPDATE to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)))
  with check (((owner_user_id = mein_chef_id()) AND darf_ich_modul_aendern('termine'::text)));

drop policy if exists verkaufschancen_owner_all on public.verkaufschancen;
create policy verkaufschancen_owner_all on public.verkaufschancen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists vertraege_owner on public.vertraege;
create policy vertraege_owner on public.vertraege
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists vertraege_select_mitarbeiter on public.vertraege;
create policy vertraege_select_mitarbeiter on public.vertraege
  as PERMISSIVE for SELECT to public
  using (((owner_user_id = mein_chef_id()) AND darf_ich_modul_sehen('vertraege'::text)));

drop policy if exists vorlagen_aufgaben_owner_all on public.vorlagen_aufgaben;
create policy vorlagen_aufgaben_owner_all on public.vorlagen_aufgaben
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists vorlagen_aufgaben_select_mitarbeiter on public.vorlagen_aufgaben;
create policy vorlagen_aufgaben_select_mitarbeiter on public.vorlagen_aufgaben
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists wareneingang_mitarbeiter on public.wareneingang;
create policy wareneingang_mitarbeiter on public.wareneingang
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists wareneingang_owner on public.wareneingang;
create policy wareneingang_owner on public.wareneingang
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists wareneingang_pos_owner on public.wareneingang_positionen;
create policy wareneingang_pos_owner on public.wareneingang_positionen
  as PERMISSIVE for ALL to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists wareneingang_positionen_mitarbeiter on public.wareneingang_positionen;
create policy wareneingang_positionen_mitarbeiter on public.wareneingang_positionen
  as PERMISSIVE for ALL to authenticated
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists wartung_delete on public.wartungsvertraege;
create policy wartung_delete on public.wartungsvertraege
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wartung_insert on public.wartungsvertraege;
create policy wartung_insert on public.wartungsvertraege
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists wartung_select on public.wartungsvertraege;
create policy wartung_select on public.wartungsvertraege
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wartung_select_mitarbeiter on public.wartungsvertraege;
create policy wartung_select_mitarbeiter on public.wartungsvertraege
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists wartung_update on public.wartungsvertraege;
create policy wartung_update on public.wartungsvertraege
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists wanh_delete on public.werkstatt_anhaenge;
create policy wanh_delete on public.werkstatt_anhaenge
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wanh_insert on public.werkstatt_anhaenge;
create policy wanh_insert on public.werkstatt_anhaenge
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists wanh_select on public.werkstatt_anhaenge;
create policy wanh_select on public.werkstatt_anhaenge
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wanh_update on public.werkstatt_anhaenge;
create policy wanh_update on public.werkstatt_anhaenge
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists wa_delete on public.werkstatt_auftraege;
create policy wa_delete on public.werkstatt_auftraege
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wa_insert on public.werkstatt_auftraege;
create policy wa_insert on public.werkstatt_auftraege
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists wa_select on public.werkstatt_auftraege;
create policy wa_select on public.werkstatt_auftraege
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wa_update on public.werkstatt_auftraege;
create policy wa_update on public.werkstatt_auftraege
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists wfhl_delete on public.werkstatt_fahrzeug_halter_log;
create policy wfhl_delete on public.werkstatt_fahrzeug_halter_log
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wfhl_insert on public.werkstatt_fahrzeug_halter_log;
create policy wfhl_insert on public.werkstatt_fahrzeug_halter_log
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists wfhl_select on public.werkstatt_fahrzeug_halter_log;
create policy wfhl_select on public.werkstatt_fahrzeug_halter_log
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wfhl_update on public.werkstatt_fahrzeug_halter_log;
create policy wfhl_update on public.werkstatt_fahrzeug_halter_log
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists wfz_delete on public.werkstatt_fahrzeuge;
create policy wfz_delete on public.werkstatt_fahrzeuge
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wfz_insert on public.werkstatt_fahrzeuge;
create policy wfz_insert on public.werkstatt_fahrzeuge
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists wfz_select on public.werkstatt_fahrzeuge;
create policy wfz_select on public.werkstatt_fahrzeuge
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wfz_update on public.werkstatt_fahrzeuge;
create policy wfz_update on public.werkstatt_fahrzeuge
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists werkstatt_freigabe_log_insert on public.werkstatt_freigabe_log;
create policy werkstatt_freigabe_log_insert on public.werkstatt_freigabe_log
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists werkstatt_freigabe_log_select on public.werkstatt_freigabe_log;
create policy werkstatt_freigabe_log_select on public.werkstatt_freigabe_log
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists wmb_insert on public.werkstatt_material_buchungen;
create policy wmb_insert on public.werkstatt_material_buchungen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists wmb_select on public.werkstatt_material_buchungen;
create policy wmb_select on public.werkstatt_material_buchungen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wmb_update on public.werkstatt_material_buchungen;
create policy wmb_update on public.werkstatt_material_buchungen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists wpos_delete on public.werkstatt_positionen;
create policy wpos_delete on public.werkstatt_positionen
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wpos_insert on public.werkstatt_positionen;
create policy wpos_insert on public.werkstatt_positionen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists wpos_select on public.werkstatt_positionen;
create policy wpos_select on public.werkstatt_positionen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists wpos_update on public.werkstatt_positionen;
create policy wpos_update on public.werkstatt_positionen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists wsl_insert on public.werkstatt_status_log;
create policy wsl_insert on public.werkstatt_status_log
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists wsl_select on public.werkstatt_status_log;
create policy wsl_select on public.werkstatt_status_log
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists zahlungen_delete_own on public.zahlungen;
create policy zahlungen_delete_own on public.zahlungen
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = auth.uid()));

drop policy if exists zahlungen_insert_own on public.zahlungen;
create policy zahlungen_insert_own on public.zahlungen
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = auth.uid()));

drop policy if exists zahlungen_select_own on public.zahlungen;
create policy zahlungen_select_own on public.zahlungen
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists zahlungen_update_own on public.zahlungen;
create policy zahlungen_update_own on public.zahlungen
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

drop policy if exists zusammenfuehrungen_delete on public.zusammenfuehrungen;
create policy zusammenfuehrungen_delete on public.zusammenfuehrungen
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

drop policy if exists zusammenfuehrungen_insert on public.zusammenfuehrungen;
create policy zusammenfuehrungen_insert on public.zusammenfuehrungen
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists zusammenfuehrungen_select on public.zusammenfuehrungen;
create policy zusammenfuehrungen_select on public.zusammenfuehrungen
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists zusammenfuehrungen_update on public.zusammenfuehrungen;
create policy zusammenfuehrungen_update on public.zusammenfuehrungen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id));
