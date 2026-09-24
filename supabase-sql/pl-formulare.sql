-- ============================================================
-- ARGONAUT OS · Paket PL · Formular-Baukasten (B23) — Stand 24.09.2026
--   formular_vorlage   eigene Checklisten/Protokolle (Felder als Liste)
--   formular_eintrag   ausgefuellte Formulare (mit KOPIE der Felder)
--   Bucket 'formulare' (privat): <Betrieb-ID>/formulare/<Eintrag>/<Foto>
--
-- ADDITIV UND IDEMPOTENT: zwei neue Tabellen, ein neuer Bucket mit eigenen
-- Speicher-Regeln. Nichts Bestehendes angefasst.
-- RLS: Chef alles. Mitarbeiter: Vorlagen lesen; Formulare lesen, anlegen und
-- ihre EIGENEN Entwuerfe weiter ausfuellen. Abgeschlossen = fuer Mitarbeiter
-- nicht mehr aenderbar. Loeschen: nur Chef.
-- ============================================================

create table if not exists public.formular_vorlage (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  titel         text not null,
  kategorie     text not null default 'checkliste',
  beschreibung  text,
  felder        jsonb not null default '[]'::jsonb,
  version       integer not null default 1,
  aktiv         boolean not null default true,
  erstellt_am   timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists formular_vorlage_owner_idx on public.formular_vorlage (owner_user_id, aktiv);

create table if not exists public.formular_eintrag (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default coalesce(mein_chef_id(), auth.uid()),
  erstellt_von     uuid default auth.uid(),
  erstellt_von_name text,
  vorlage_id       uuid references public.formular_vorlage(id) on delete set null,
  vorlage_titel    text not null,
  vorlage_version  integer not null default 1,
  felder           jsonb not null,
  werte            jsonb not null default '{}'::jsonb,
  projekt_id       uuid references public.projekte(id) on delete set null,
  bezug            text,
  status           text not null default 'entwurf' check (status in ('entwurf', 'abgeschlossen')),
  ergebnis         text check (ergebnis is null or ergebnis in ('io', 'nio', 'offen')),
  abgeschlossen_am timestamptz,
  erstellt_am      timestamptz not null default now(),
  aktualisiert_am  timestamptz not null default now()
);
create index if not exists formular_eintrag_owner_idx on public.formular_eintrag (owner_user_id, erstellt_am desc);

alter table public.formular_vorlage enable row level security;
alter table public.formular_eintrag enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='formular_vorlage' and policyname='formular_vorlage_chef') then
    create policy formular_vorlage_chef on public.formular_vorlage for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='formular_vorlage' and policyname='formular_vorlage_ma_select') then
    create policy formular_vorlage_ma_select on public.formular_vorlage for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='formular_eintrag' and policyname='formular_eintrag_chef') then
    create policy formular_eintrag_chef on public.formular_eintrag for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='formular_eintrag' and policyname='formular_eintrag_ma_select') then
    create policy formular_eintrag_ma_select on public.formular_eintrag for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='formular_eintrag' and policyname='formular_eintrag_ma_insert') then
    create policy formular_eintrag_ma_insert on public.formular_eintrag for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='formular_eintrag' and policyname='formular_eintrag_ma_update') then
    create policy formular_eintrag_ma_update on public.formular_eintrag for update to authenticated
      using (owner_user_id = mein_chef_id() and erstellt_von = auth.uid() and status = 'entwurf')
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('formulare', 'formulare', false)
on conflict (id) do nothing;

drop policy if exists formulare_select on storage.objects;
create policy formulare_select on storage.objects for select to authenticated
  using (bucket_id = 'formulare' and (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text);
drop policy if exists formulare_insert on storage.objects;
create policy formulare_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'formulare' and (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text);
drop policy if exists formulare_delete on storage.objects;
create policy formulare_delete on storage.objects for delete to authenticated
  using (bucket_id = 'formulare' and (storage.foldername(name))[1] = auth.uid()::text);

select '1 tabelle' as art, tablename as name, rowsecurity::text as wert
  from pg_tables where schemaname = 'public' and tablename in ('formular_vorlage', 'formular_eintrag')
union all
select '2 bucket', id, case when public then 'OEFFENTLICH' else 'privat' end from storage.buckets where id = 'formulare'
union all
select '3 regel', tablename || ' / ' || policyname, cmd
  from pg_policies where (schemaname = 'public' and tablename in ('formular_vorlage', 'formular_eintrag'))
                      or (schemaname = 'storage' and policyname like 'formulare_%')
order by 1, 2;
