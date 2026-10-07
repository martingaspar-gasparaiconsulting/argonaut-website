-- ============================================================
-- ARGONAUT OS · Paket 262 (07.10.2026) · K3 Fotos und Medien
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) Speicherordner „fahrzeug-medien" (privat, 50 MB je Datei, nur Bilder
--     und Videos — nie HTML oder SVG)
--  2) Regeln im Speicher: Ordner = Betrieb (wie das Bautagebuch); lesen mit
--     Recht „kfz", hochladen und löschen mit Schreibrecht „kfz"
--  3) Tabelle kfz_bestand_medien (Foto/Video je Bestandsfahrzeug,
--     Schablonen-Ansicht, Reihenfolge)
-- ============================================================

-- 1) Speicherordner -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fahrzeug-medien', 'fahrzeug-medien', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 2) Regeln im Speicher (erster Ordner = Betrieb) ----------------------------------
drop policy if exists fahrzeug_medien_select on storage.objects;
create policy fahrzeug_medien_select on storage.objects for select to authenticated
  using (bucket_id = 'fahrzeug-medien'
    and (storage.foldername(name))[1] = coalesce(public.mein_chef_id(), auth.uid())::text
    and (public.mein_chef_id() is null or public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists fahrzeug_medien_insert on storage.objects;
create policy fahrzeug_medien_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fahrzeug-medien'
    and (storage.foldername(name))[1] = coalesce(public.mein_chef_id(), auth.uid())::text
    and (public.mein_chef_id() is null or public.darf_ich_modul_aendern('kfz')));
drop policy if exists fahrzeug_medien_delete on storage.objects;
create policy fahrzeug_medien_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fahrzeug-medien'
    and (storage.foldername(name))[1] = coalesce(public.mein_chef_id(), auth.uid())::text
    and (public.mein_chef_id() is null or public.darf_ich_modul_aendern('kfz')));

-- 3) Medien je Fahrzeug -------------------------------------------------------------
create table if not exists public.kfz_bestand_medien (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  bestand_id    uuid not null references public.kfz_bestand(id) on delete cascade,
  art           text not null default 'foto' check (art in ('foto', 'video')),
  pfad          text not null,
  schablone     text,
  position      integer not null default 0,
  dateiname     text,
  bytes         bigint check (bytes is null or bytes >= 0),
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now()
);
create index if not exists kfz_bestand_medien_idx on public.kfz_bestand_medien (bestand_id, position);
alter table public.kfz_bestand_medien enable row level security;

drop trigger if exists p181_besitzer on public.kfz_bestand_medien;
create trigger p181_besitzer before insert or update on public.kfz_bestand_medien
  for each row execute function public.p181_besitzer();

drop policy if exists kfzbm_owner_all on public.kfz_bestand_medien;
create policy kfzbm_owner_all on public.kfz_bestand_medien for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_bestand_medien;
create policy p181_ma_select on public.kfz_bestand_medien for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_bestand_medien;
create policy p181_ma_insert on public.kfz_bestand_medien for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_bestand_medien;
create policy p181_ma_update on public.kfz_bestand_medien for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p262_ma_delete on public.kfz_bestand_medien;
create policy p262_ma_delete on public.kfz_bestand_medien for delete to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- KONTROLLE — Erwartung: ordner = 1, ordner_privat = true, speicher_regeln = 3,
-- tabelle = 1, regeln_medien = 5, rls_an = true
select
  (select count(*) from storage.buckets where id = 'fahrzeug-medien') as ordner,
  (select public = false from storage.buckets where id = 'fahrzeug-medien') as ordner_privat,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'fahrzeug_medien_%') as speicher_regeln,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'kfz_bestand_medien') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_bestand_medien') as regeln_medien,
  (select relrowsecurity from pg_class where relname = 'kfz_bestand_medien') as rls_an;
