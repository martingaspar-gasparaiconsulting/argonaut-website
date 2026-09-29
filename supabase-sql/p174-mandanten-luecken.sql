-- ============================================================================
-- ARGONAUT OS · SQL p174 · Mandanten-Luecken in der Datenbank (29.09.2026)
-- Befunde H1, H2, M1, M2 aus der Rechts-/Sicherheitspruefung
--
-- ARBEITSWEISE: nur ZUSAETZLICHE Sperr-Regeln („as restrictive"). Die
-- bestehenden Regeln bleiben unangetastet — eine restriktive Regel wird mit
-- jeder erlaubenden per UND verknuepft. Nichts wird geloescht, keine Daten
-- geaendert. Rueckweg je Regel: drop policy if exists <name> on <tabelle>;
--
-- 1) Team-Chat: Beitritt nur, wenn der Kanal-Ersteller einlaedt UND die Person
--    zum selben Betrieb gehoert (vorher: jeder, der die Kanal-Kennung kannte,
--    konnte sich selbst eintragen und alles mitlesen).
-- 2) Team-Chat: ausgetretene Mitarbeiter lesen und schreiben nicht mehr mit.
-- 3) Team-Chat: Absender nicht faelschbar — eigene Kennung, oder die
--    ARGONAUT-Antwort ohne Kennung und nur unter dem Namen „ARGONAUT".
-- 4) Module (tenant_module): nur noch der Server/Betreiber schaltet frei;
--    ein Chef konnte sich bezahlte Module selbst anlegen oder durch Loeschen
--    aller Zeilen alles freischalten (Anzeige ist „fail-open").
-- 5) HR-Eintraege von Mitarbeitern (Abwesenheit, Zeiten, Dokumente, Schichten,
--    Checklisten): Besitzer muss der eigene Betrieb (oder man selbst) sein —
--    vorher konnte ein Mitarbeiter Zeilen bei einem FREMDEN Betrieb anlegen.
--
-- AUSSPERR-RISIKO: gering. Betroffen ist nur, wer heute schon etwas darf, das
-- er nicht duerfen sollte. Einzige spuerbare Aenderung: Mitarbeiter mit einem
-- Austrittsdatum in der Vergangenheit sehen den Team-Chat nicht mehr.
-- Der Server (Einladen, Admin, Crons) ist nicht betroffen (Service-Rolle).
-- ============================================================================

begin;

-- Helfer (falls live noch nicht vorhanden; die Fassung vom 04.08.2026) ------------
do $$
begin
  if to_regprocedure('public.chat_betrieb_von(uuid)') is null then
    execute $f$
      create function public.chat_betrieb_von(p_user uuid)
      returns uuid language sql stable security definer set search_path to 'public'
      as $b$
        select coalesce(
          (select m.owner_user_id from public.mitarbeiter m where m.auth_user_id = p_user limit 1),
          p_user);
      $b$;
    $f$;
  end if;
end $$;

-- Ist die Person noch dabei? Chef (keine Mitarbeiter-Zeile) = ja; Mitarbeiter
-- = ja, solange mindestens eine Zeile ohne vergangenes Austrittsdatum besteht.
create or replace function public.chat_nutzer_aktiv(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and (
    not exists (select 1 from public.mitarbeiter m where m.auth_user_id = p_user)
    or exists (
      select 1 from public.mitarbeiter m
       where m.auth_user_id = p_user
         and (m.austrittsdatum is null or m.austrittsdatum >= current_date))
  );
$$;
revoke all on function public.chat_nutzer_aktiv(uuid) from public, anon;
grant execute on function public.chat_nutzer_aktiv(uuid) to authenticated, service_role;

-- 1) Team-Chat: Beitritt ------------------------------------------------------------
drop policy if exists p174_mitglieder_nur_eingeladen on public.chat_mitglieder;
create policy p174_mitglieder_nur_eingeladen on public.chat_mitglieder
  as restrictive for insert to authenticated, anon
  with check (
    exists (
      select 1 from public.chat_kanaele k
       where k.id = chat_mitglieder.kanal_id
         and k.erstellt_von = auth.uid())
    and public.chat_betrieb_von(chat_mitglieder.user_id) = public.chat_betrieb_von(auth.uid())
  );

-- 2) Team-Chat: Ausgetretene raus ------------------------------------------------------
drop policy if exists p174_nachrichten_lesen_aktiv on public.chat_nachrichten;
create policy p174_nachrichten_lesen_aktiv on public.chat_nachrichten
  as restrictive for select to authenticated, anon
  using (public.chat_nutzer_aktiv(auth.uid()));

-- 3) Team-Chat: Absender -----------------------------------------------------------------
drop policy if exists p174_nachrichten_absender_echt on public.chat_nachrichten;
create policy p174_nachrichten_absender_echt on public.chat_nachrichten
  as restrictive for insert to authenticated, anon
  with check (
    public.chat_nutzer_aktiv(auth.uid())
    and (
      (coalesce(ist_ki, false) = false and absender_id = auth.uid())
      or (ist_ki = true and absender_id is null and absender_name = 'ARGONAUT')
    )
  );

-- 4) Module nur ueber den Server ------------------------------------------------------------
drop policy if exists p174_module_nur_server_insert on public.tenant_module;
create policy p174_module_nur_server_insert on public.tenant_module
  as restrictive for insert to authenticated, anon
  with check (false);
drop policy if exists p174_module_nur_server_update on public.tenant_module;
create policy p174_module_nur_server_update on public.tenant_module
  as restrictive for update to authenticated, anon
  using (false) with check (false);
drop policy if exists p174_module_nur_server_delete on public.tenant_module;
create policy p174_module_nur_server_delete on public.tenant_module
  as restrictive for delete to authenticated, anon
  using (false);

-- 5) HR-Eintraege nur im eigenen Betrieb ---------------------------------------------------
do $$
declare
  t text;
  tabellen text[] := array['hr_abwesenheiten', 'hr_checklisten_abschluss', 'hr_dokumente',
                           'hr_schicht_bestaetigung', 'hr_schicht_tausch', 'hr_zeiterfassung'];
begin
  foreach t in array tabellen loop
    if to_regclass('public.' || t) is null then
      raise notice 'p174: Tabelle % fehlt — uebersprungen', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'p174_' || t || '_betrieb_ins', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated, anon
         with check (owner_user_id = auth.uid() or owner_user_id = public.mein_chef_id())',
      'p174_' || t || '_betrieb_ins', t);
    execute format('drop policy if exists %I on public.%I', 'p174_' || t || '_betrieb_upd', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated, anon
         with check (owner_user_id = auth.uid() or owner_user_id = public.mein_chef_id())',
      'p174_' || t || '_betrieb_upd', t);
  end loop;
end $$;

commit;

-- ============================================================================
-- KONTROLLE (nur lesen) — Erwartung: 18 Zeilen, alle permissive = RESTRICTIVE
-- ============================================================================
select tablename, policyname, permissive, cmd
  from pg_policies
 where schemaname = 'public' and policyname like 'p174_%'
 order by tablename, policyname;
