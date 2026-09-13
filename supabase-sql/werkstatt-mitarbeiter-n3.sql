-- ============================================================
-- ARGONAUT OS · N3 — Werkstatt für Mitarbeiter
-- Additiv · idempotent · NICHT destruktiv
--
-- Ausgeführt: 13.09.2026 (Code dazu: Commit a044785)
-- Diese Datei: am 13.09.2026 NACHTRÄGLICH geschrieben — und zwar NICHT aus
-- dem Gedächtnis, sondern aus der laufenden Datenbank. Alle Regelnamen und
-- Bedingungen unten stammen aus einer Abfrage auf pg_policies; eine aus der
-- Erinnerung rekonstruierte Datei würde nur etwas über die Datenbank
-- behaupten (Entscheidung vom 11.09.2026 zu den fehlenden G1/G2/G3-Dateien).
--
-- MARTINS ENTSCHEIDUNG (13.09.2026)
--   sehen JA · mitarbeiten JA · löschen NEIN
-- Die engere Variante „nur eigene zugewiesene Aufträge" wurde verworfen: sie
-- bräuchte ein Zuweisungsfeld, das es in der Werkstatt nicht gibt.
--
-- WIE ES FUNKTIONIERT
-- public.mein_chef_id() ist
--     select owner_user_id from public.mitarbeiter
--      where auth_user_id = auth.uid() limit 1
-- (STABLE, SECURITY DEFINER). Für einen CHEF gibt sie NULL zurück, weil er
-- keinen mitarbeiter-Datensatz hat — die _ma-Regeln greifen für ihn deshalb
-- nie, er läuft weiter über seine eigenen. Im Supabase-Editor liefert sie
-- ebenfalls null, weil dort niemand angemeldet ist. Das ist kein Fehler.
--
-- ES SIND ACHT werkstatt_*-TABELLEN, nicht vier. Die vier zusätzlichen
-- (anhaenge, freigabe_log, material_buchungen, status_log) wurden beim ersten
-- Zuschnitt übersehen.
--
-- KEIN LÖSCHRECHT: unten kommt das Wort DELETE für MITARBEITER nirgends vor.
-- Die vorhandenen DELETE-Regeln gehören ausschließlich dem Chef und werden
-- hier nicht angefasst.
--
-- BESTAND, DER HIER NICHT ANGEFASST WIRD (Stand 13.09.2026)
--   werkstatt_fahrzeuge · fahrzeug_halter_log · auftraege · positionen ·
--   anhaenge          → je select/insert/update/delete für den Chef
--   material_buchungen → select/insert/update (kein delete)
--   status_log         → select/insert (Logs bekommen kein update)
--   freigabe_log       → select/insert (Logs bekommen kein update)
--
-- BEFUND ZUM VORMERKEN (Claude, 13.09.2026): die Chef-Regeln lauten alle auf
-- die Rolle `public`, nicht auf `authenticated`. Gefährlich ist das nicht —
-- ihre Bedingung `auth.uid() = owner_user_id` wird für einen nicht
-- angemeldeten Besucher zu NULL und damit nie wahr, es kommt keine Zeile
-- heraus. Sauber ist es trotzdem nicht: es ist dasselbe Muster, das am
-- 12.09.2026 bei der Mandantentrennung (Punkt 2.6) auf `authenticated`
-- verengt wurde. Eine Änderung daran hieße drop + create auf bestehenden
-- Regeln und gehört deshalb in einen eigenen, bewusst gefahrenen Durchgang —
-- nicht in diese Datei.
-- ============================================================


-- ------------------------------------------------------------------
-- TEIL 1 · Die 22 Mitarbeiter-Regeln
-- Muster überall gleich: owner_user_id = mein_chef_id(), Rolle authenticated.
-- ------------------------------------------------------------------
do $$
begin

  -- werkstatt_fahrzeuge ------------------------------------------------
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_fahrzeuge' and policyname='wfz_select_ma') then
    create policy wfz_select_ma on public.werkstatt_fahrzeuge
      for select to authenticated using (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_fahrzeuge' and policyname='wfz_insert_ma') then
    create policy wfz_insert_ma on public.werkstatt_fahrzeuge
      for insert to authenticated with check (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_fahrzeuge' and policyname='wfz_update_ma') then
    create policy wfz_update_ma on public.werkstatt_fahrzeuge
      for update to authenticated using (owner_user_id = public.mein_chef_id())
      with check (owner_user_id = public.mein_chef_id());
  end if;

  -- werkstatt_fahrzeug_halter_log ---------------------------------------
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_fahrzeug_halter_log' and policyname='wfhl_select_ma') then
    create policy wfhl_select_ma on public.werkstatt_fahrzeug_halter_log
      for select to authenticated using (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_fahrzeug_halter_log' and policyname='wfhl_insert_ma') then
    create policy wfhl_insert_ma on public.werkstatt_fahrzeug_halter_log
      for insert to authenticated with check (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_fahrzeug_halter_log' and policyname='wfhl_update_ma') then
    create policy wfhl_update_ma on public.werkstatt_fahrzeug_halter_log
      for update to authenticated using (owner_user_id = public.mein_chef_id())
      with check (owner_user_id = public.mein_chef_id());
  end if;

  -- werkstatt_auftraege --------------------------------------------------
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_auftraege' and policyname='wa_select_ma') then
    create policy wa_select_ma on public.werkstatt_auftraege
      for select to authenticated using (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_auftraege' and policyname='wa_insert_ma') then
    create policy wa_insert_ma on public.werkstatt_auftraege
      for insert to authenticated with check (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_auftraege' and policyname='wa_update_ma') then
    create policy wa_update_ma on public.werkstatt_auftraege
      for update to authenticated using (owner_user_id = public.mein_chef_id())
      with check (owner_user_id = public.mein_chef_id());
  end if;

  -- werkstatt_positionen -------------------------------------------------
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_positionen' and policyname='wpos_select_ma') then
    create policy wpos_select_ma on public.werkstatt_positionen
      for select to authenticated using (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_positionen' and policyname='wpos_insert_ma') then
    create policy wpos_insert_ma on public.werkstatt_positionen
      for insert to authenticated with check (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_positionen' and policyname='wpos_update_ma') then
    create policy wpos_update_ma on public.werkstatt_positionen
      for update to authenticated using (owner_user_id = public.mein_chef_id())
      with check (owner_user_id = public.mein_chef_id());
  end if;

  -- werkstatt_material_buchungen -----------------------------------------
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_material_buchungen' and policyname='wmb_select_ma') then
    create policy wmb_select_ma on public.werkstatt_material_buchungen
      for select to authenticated using (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_material_buchungen' and policyname='wmb_insert_ma') then
    create policy wmb_insert_ma on public.werkstatt_material_buchungen
      for insert to authenticated with check (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_material_buchungen' and policyname='wmb_update_ma') then
    create policy wmb_update_ma on public.werkstatt_material_buchungen
      for update to authenticated using (owner_user_id = public.mein_chef_id())
      with check (owner_user_id = public.mein_chef_id());
  end if;

  -- werkstatt_anhaenge ---------------------------------------------------
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_anhaenge' and policyname='wanh_select_ma') then
    create policy wanh_select_ma on public.werkstatt_anhaenge
      for select to authenticated using (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_anhaenge' and policyname='wanh_insert_ma') then
    create policy wanh_insert_ma on public.werkstatt_anhaenge
      for insert to authenticated with check (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_anhaenge' and policyname='wanh_update_ma') then
    create policy wanh_update_ma on public.werkstatt_anhaenge
      for update to authenticated using (owner_user_id = public.mein_chef_id())
      with check (owner_user_id = public.mein_chef_id());
  end if;

  -- werkstatt_status_log · nur lesen und anlegen --------------------------
  -- Ein Protokoll wird fortgeschrieben, nicht korrigiert: kein update, auch
  -- nicht für den Chef.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_status_log' and policyname='wsl_select_ma') then
    create policy wsl_select_ma on public.werkstatt_status_log
      for select to authenticated using (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_status_log' and policyname='wsl_insert_ma') then
    create policy wsl_insert_ma on public.werkstatt_status_log
      for insert to authenticated with check (owner_user_id = public.mein_chef_id());
  end if;

  -- werkstatt_freigabe_log · nur lesen und anlegen ------------------------
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_freigabe_log' and policyname='werkstatt_freigabe_log_select_ma') then
    create policy werkstatt_freigabe_log_select_ma on public.werkstatt_freigabe_log
      for select to authenticated using (owner_user_id = public.mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='werkstatt_freigabe_log' and policyname='werkstatt_freigabe_log_insert_ma') then
    create policy werkstatt_freigabe_log_insert_ma on public.werkstatt_freigabe_log
      for insert to authenticated with check (owner_user_id = public.mein_chef_id());
  end if;

end $$;


-- ------------------------------------------------------------------
-- TEIL 2 · Die Funktion für den Browser freigeben
-- werkstatt/page.tsx und fahrzeugakte/page.tsx rufen mein_chef_id() per
-- supabase.rpc() auf, um beim Anlegen den richtigen Besitzer zu setzen.
-- Ohne dieses Recht scheitert der Aufruf im Browser.
-- ------------------------------------------------------------------
grant execute on function public.mein_chef_id() to authenticated;


-- ------------------------------------------------------------------
-- KONTROLLE (eine Abfrage — der Editor zeigt sonst nur die letzte)
-- Erwartet: 22 Mitarbeiter-Regeln · 0 Löschrechte für Mitarbeiter
-- ------------------------------------------------------------------
select 'mitarbeiter-regeln' as was, count(*)::text as wert
  from pg_policies
 where schemaname = 'public' and tablename like 'werkstatt%' and policyname like '%\_ma'
union all
select 'davon loeschrechte', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename like 'werkstatt%'
   and policyname like '%\_ma' and cmd = 'DELETE'
union all
select 'ausfuehrrecht mein_chef_id', coalesce(
         (select case when has_function_privilege('authenticated', p.oid, 'execute')
                      then 'ja' else 'nein' end
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'mein_chef_id' limit 1),
         'funktion nicht gefunden');
