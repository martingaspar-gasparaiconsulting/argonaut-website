-- ============================================================
-- ARGONAUT OS · public.leads — Rechte-Regeln, Stand 11.09.2026
--
-- WARUM ES DIESE DATEI GIBT
-- Am 11.09.2026 fiel auf: `leads` steht in supabase-sql/_ALLE-TABELLEN.sql
-- ueberhaupt nicht drin. Die Tabelle existiert in der Datenbank, aber nirgends
-- im Repo. Damit war die SQL-Sammlung nicht mehr die vollstaendige Wahrheit —
-- und niemand konnte nachlesen, wer die Anfragen eigentlich sehen darf.
--
-- DIESE DATEI DOKUMENTIERT DEN IST-ZUSTAND. Sie muss NICHT ausgefuehrt werden;
-- alle sieben Regeln liegen bereits so in der Datenbank (ausgelesen ueber
-- pg_policies am 11.09.2026). Sie ist idempotent und nicht destruktiv, damit
-- man sie gefahrlos laufen lassen KANN — etwa beim Aufsetzen einer zweiten
-- Umgebung oder wenn eine Regel versehentlich geloescht wurde.
--
-- DIE ENTSCHEIDUNG DAHINTER (Martin, 09.09.2026)
-- Mitarbeiter DUERFEN die Anfragen sehen und mitarbeiten — aber nicht loeschen.
-- Genau so ist es umgesetzt: Es gibt SELECT-, INSERT- und UPDATE-Regeln fuer
-- Mitarbeiter, aber KEINE EINZIGE DELETE-Regel. Bei eingeschaltetem RLS heisst
-- das: ueber die Oberflaeche loescht niemand einen Lead, auch der Chef nicht.
-- Das ist Absicht, kein Versehen.
-- ============================================================

-- Sicherheitsnetz: ohne RLS waeren alle Regeln wirkungslos.
alter table public.leads enable row level security;

-- ------------------------------------------------------------------
-- BESITZER (der Chef) — sehen, anlegen, aendern
-- ------------------------------------------------------------------
drop policy if exists leads_owner_select on public.leads;
create policy leads_owner_select on public.leads
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = auth.uid()));

drop policy if exists leads_owner_insert on public.leads;
create policy leads_owner_insert on public.leads
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists leads_owner_update on public.leads;
create policy leads_owner_update on public.leads
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = auth.uid()))
  with check ((owner_user_id = auth.uid()));

-- ------------------------------------------------------------------
-- MITARBEITER — dieselben drei Rechte ueber mein_chef_id()
-- Punkt 1.2 der Bauliste. War bereits gebaut; am 11.09.2026 bestaetigt.
-- ------------------------------------------------------------------
drop policy if exists leads_select_ma on public.leads;
create policy leads_select_ma on public.leads
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists leads_insert_ma on public.leads;
create policy leads_insert_ma on public.leads
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = mein_chef_id()));

drop policy if exists leads_update_ma on public.leads;
create policy leads_update_ma on public.leads
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

-- ------------------------------------------------------------------
-- leads_public_insert — DIE REGEL, DIE NICHTS ERLAUBT
--
-- ACHTUNG BEIM LESEN: Der Name klingt, als duerfte die Oeffentlichkeit hier
-- Leads anlegen. Sie darf NICHT: `with check (false)` trifft niemals zu, die
-- Regel laesst also nichts durch.
--
-- Das ist trotzdem richtig so. Oeffentliche Anfragen (Kontaktformular,
-- Landingpage, Shop-Bot) kommen NICHT aus dem Browser in die Tabelle, sondern
-- ueber die API-Routen mit dem Service-Role-Schluessel — und der umgeht RLS
-- vollstaendig. Die Regel steht hier als sichtbarer Riegel: Sollte jemals
-- jemand versuchen, aus dem Browser heraus direkt einen Lead einzutragen,
-- greift sie und verweigert es.
--
-- Sie wird bewusst BEIBEHALTEN. Wer sie loescht, macht die Absicht unsichtbar.
-- ------------------------------------------------------------------
drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert on public.leads
  as PERMISSIVE for INSERT to public
  with check (false);

-- ------------------------------------------------------------------
-- KEINE DELETE-REGEL — bewusst.
-- Siehe Kopf der Datei. Wer hier spaeter eine ergaenzt, aendert eine
-- Entscheidung von Martin und sollte das nicht nebenbei tun.
-- ------------------------------------------------------------------

-- ------------------------------------------------------------------
-- OFFEN (Block J der Anwaltsliste, 11.09.2026)
-- Ein Lead ohne kontakt_id wird von der DSGVO-Auskunft und -Loeschung NICHT
-- gefunden, weil beide vom kontakte-Datensatz ausgehen. Betrifft jeden
-- Interessenten, der nie ins CRM uebernommen wurde. Erst Anwalt, dann bauen.
-- ------------------------------------------------------------------
