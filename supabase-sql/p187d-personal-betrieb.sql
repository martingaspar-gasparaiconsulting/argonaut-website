-- ============================================================
-- ARGONAUT OS · Paket 187d (01.10.2026) · Personal-Cockpit, Tickets, Reports,
-- Kalkulator-Normen speichern für den Betrieb
--
-- Befund (Live-Stand 01.10.2026): Auf diesen Tabellen gibt es für Mitarbeiter
-- nur Regeln mit der EIGENEN Kennung. Legt eine Büroleitung mit Personal-Recht
-- eine Abwesenheit, Schulung, Checkliste, einen Bewerber … an, landet die Zeile
-- unter ihrer Kennung — der Chef sieht sie nie. Ein vom Mitarbeiter geplanter
-- Report wird leer verschickt, Tickets und Kalkulator-Normen bleiben privat.
--
-- WAS HIER PASSIERT (alles additiv, keine bestehende Regel wird geändert,
-- nichts wird gelöscht, bestehende Zeilen bleiben unverändert):
--  1. Trigger p181_besitzer (gibt es seit Paket 181) auch auf diesen Tabellen:
--     Anlegen durch einen Mitarbeiter -> Besitzer = sein Betrieb. Beim Chef,
--     bei Server-Abläufen und bei Mein Bereich (schreibt schon den Betrieb)
--     ändert sich nichts. Ändern -> der Besitzer bleibt, wer er war.
--  2. Mitarbeiter-Regeln je Tabelle: LESEN mit Sicht- oder Schreibrecht,
--     ANLEGEN/ÄNDERN nur mit Schreibrecht für das Modul (Seite /rechte).
--     LÖSCHEN mit Schreibrecht nur bei Abwesenheiten, Schulungen, Checklisten,
--     Vorlagen, Bewerbern, Entsendungen — NICHT bei Zeiterfassung und
--     Zeit-Korrekturen (Nachweis), Dokumenten, Tickets, Reports, Normen.
--  3. Speicher hr-dokumente: Mitarbeiter mit Personal-Recht dürfen Dateien im
--     Ordner IHRES Betriebs ablegen (Schreibrecht) und lesen (Sicht-/Schreibrecht).
--
-- NICHT DABEI: die Tabelle „mitarbeiter" selbst (eigener Schritt, Aussperr-Risiko).
--
-- ACHTUNG: Ein Mitarbeiter, der Personal/Service/Reports/Kalkulator nur SEHEN
-- darf, kann dort danach nichts mehr anlegen (bisher landete es unsichtbar
-- unter seiner Kennung). Die Kontrolle unten nennt diese Personen.
-- Mehrfach ausführbar.
-- ============================================================

create or replace function public.p181_besitzer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chef uuid;
begin
  begin
    if tg_op = 'UPDATE' then
      if auth.uid() is not null then
        new.owner_user_id := old.owner_user_id;
      end if;
      return new;
    end if;
    v_chef := public.mein_chef_id();
    if v_chef is not null then
      new.owner_user_id := v_chef;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

do $$
declare
  z text[];
  t text;
  m text;
  loeschen boolean;
  liste text[][] := array[
    array['bewerber', 'personal', 'ja'],
    array['personal_entsendung', 'personal', 'ja'],
    array['hr_abwesenheiten', 'personal', 'ja'],
    array['hr_schulungen', 'personal', 'ja'],
    array['hr_checklisten', 'personal', 'ja'],
    array['hr_checklisten_abschluss', 'personal', 'nein'],
    array['hr_checklisten_vorlagen', 'personal', 'ja'],
    array['hr_dokumente', 'personal', 'nein'],
    array['hr_zeiterfassung', 'personal', 'nein'],
    array['hr_zeit_korrekturen', 'personal', 'nein'],
    array['tickets', 'service', 'nein'],
    array['report_gespeichert', 'reports', 'nein'],
    array['kalkulator_normen', 'kalkulator', 'nein']
  ];
begin
  foreach z slice 1 in array liste loop
    t := z[1]; m := z[2]; loeschen := (z[3] = 'ja');
    if to_regclass('public.' || t) is null then
      raise notice '%: Tabelle nicht gefunden, uebersprungen', t;
      continue;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'owner_user_id') then
      raise notice '%: keine Spalte owner_user_id, uebersprungen', t;
      continue;
    end if;
    execute format('drop trigger if exists p181_besitzer on public.%I', t);
    execute format('create trigger p181_besitzer before insert or update on public.%I for each row execute function public.p181_besitzer()', t);
    execute format('drop policy if exists p187d_ma_select on public.%I', t);
    execute format('create policy p187d_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(%L) or public.darf_ich_modul_aendern(%L)))', t, m, m);
    execute format('drop policy if exists p187d_ma_insert on public.%I', t);
    execute format('create policy p187d_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L))', t, m);
    execute format('drop policy if exists p187d_ma_update on public.%I', t);
    execute format('create policy p187d_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L)) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L))', t, m, m);
    execute format('drop policy if exists p187d_ma_delete on public.%I', t);
    if loeschen then
      execute format('create policy p187d_ma_delete on public.%I for delete to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L))', t, m);
    end if;
  end loop;
end $$;

-- Speicher hr-dokumente: Ordner des eigenen Betriebs (erster Ordner = Kennung des Chefs)
drop policy if exists p187d_hrdok_ma_insert on storage.objects;
create policy p187d_hrdok_ma_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-dokumente'
              and (storage.foldername(name))[1] = (public.mein_chef_id())::text
              and public.darf_ich_modul_aendern('personal'));
drop policy if exists p187d_hrdok_ma_select on storage.objects;
create policy p187d_hrdok_ma_select on storage.objects for select to authenticated
  using (bucket_id = 'hr-dokumente'
         and (storage.foldername(name))[1] = (public.mein_chef_id())::text
         and (public.darf_ich_modul_sehen('personal') or public.darf_ich_modul_aendern('personal')));

-- KONTROLLE — Erwartung: tabellen = 13, regeln = 45 (13 × 3 + 6 Löschregeln),
-- trigger = 13, speicher_regeln = 2, rls_aus = 0.
-- ohne_schreibrecht = Mitarbeiter, die eines dieser Module nur SEHEN dürfen und
-- dort danach nichts mehr anlegen können (leer = niemand).
select
  (select count(distinct tablename) from pg_policies where schemaname = 'public' and policyname like 'p187d_ma_%') as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and policyname like 'p187d_ma_%') as regeln,
  (select count(*) from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where g.tgname = 'p181_besitzer'
      and c.relname in ('bewerber','personal_entsendung','hr_abwesenheiten','hr_schulungen','hr_checklisten','hr_checklisten_abschluss',
                        'hr_checklisten_vorlagen','hr_dokumente','hr_zeiterfassung','hr_zeit_korrekturen','tickets','report_gespeichert','kalkulator_normen')) as trigger,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'p187d_hrdok_%') as speicher_regeln,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('bewerber','personal_entsendung','hr_abwesenheiten','hr_schulungen','hr_checklisten','hr_checklisten_abschluss',
                        'hr_checklisten_vorlagen','hr_dokumente','hr_zeiterfassung','hr_zeit_korrekturen','tickets','report_gespeichert','kalkulator_normen')
      and not c.relrowsecurity) as rls_aus,
  (select string_agg(x, ' · ' order by x) from (
     select trim(coalesce(m.vorname, '') || ' ' || coalesce(m.nachname, '')) || ': ' || string_agg(b.modul, ', ' order by b.modul) as x
       from public.mitarbeiter m
       join public.mitarbeiter_rechte r on r.mitarbeiter_id = m.id
       join (values ('personal'), ('service'), ('reports'), ('kalkulator')) as b(modul)
         on b.modul = any(coalesce(r.module, '{}'::text[]))
        and not (b.modul = any(coalesce(r.schreib_module, '{}'::text[])))
      where m.auth_user_id is not null
      group by m.vorname, m.nachname) q) as ohne_schreibrecht;
