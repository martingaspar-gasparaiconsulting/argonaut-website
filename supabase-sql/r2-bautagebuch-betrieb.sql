-- ============================================================
-- ARGONAUT OS · R2 Bautagebuch gehoert dem Betrieb — 24.09.2026
-- Befund: Eintraege, Fotos und Maengel eines Mitarbeiters wurden unter
-- SEINER ID gespeichert -> der Chef sah sie nicht. LESEN am 24.09.:
-- alle drei Tabellen sind noch LEER -> es muss nichts umgehaengt werden.
--
-- NUR HINZUFUEGEN, nichts entfernt:
--   baustellen_fotos.erstellt_von (neue Spalte)
--   Mitarbeiter duerfen fuer den Betrieb anlegen (owner = mein_chef_id())
--   und ihre eigenen Eintraege aendern; Maengel bis "behoben" weiterschalten.
--   Loeschen und "abgenommen" bleiben beim Chef.
--   Speicher: Betriebs-Ordner (erster Ordner = Chef-ID) lesen/hochladen.
-- REIHENFOLGE: DIESES SQL VOR dem Push _p86 ausfuehren — sonst schlaegt das
-- Speichern fuer Mitarbeiter fehl, bis das SQL laeuft.
-- ============================================================

alter table public.baustellen_fotos add column if not exists erstellt_von uuid default auth.uid();

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bautagebuch' and policyname='btb_insert_ma') then
    create policy btb_insert_ma on public.bautagebuch for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bautagebuch' and policyname='btb_update_ma') then
    create policy btb_update_ma on public.bautagebuch for update to authenticated
      using (owner_user_id = mein_chef_id() and erstellt_von = auth.uid())
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='baustellen_fotos' and policyname='bfo_insert_ma') then
    create policy bfo_insert_ma on public.baustellen_fotos for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='maengel' and policyname='mgl_insert_ma') then
    create policy mgl_insert_ma on public.maengel for insert to authenticated
      with check (owner_user_id = mein_chef_id() and status <> 'abgenommen');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='maengel' and policyname='mgl_update_ma') then
    create policy mgl_update_ma on public.maengel for update to authenticated
      using (owner_user_id = mein_chef_id() and status <> 'abgenommen')
      with check (owner_user_id = mein_chef_id() and status <> 'abgenommen');
  end if;
end $$;

drop policy if exists baustellen_fotos_betrieb_select on storage.objects;
create policy baustellen_fotos_betrieb_select on storage.objects for select to authenticated
  using (bucket_id = 'baustellen-fotos' and (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text);
drop policy if exists baustellen_fotos_betrieb_insert on storage.objects;
create policy baustellen_fotos_betrieb_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'baustellen-fotos' and (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text);

select tablename || ' / ' || policyname as regel, cmd
  from pg_policies
 where (schemaname = 'public' and tablename in ('bautagebuch', 'baustellen_fotos', 'maengel'))
    or (schemaname = 'storage' and policyname like 'baustellen_fotos%')
 order by 1;
