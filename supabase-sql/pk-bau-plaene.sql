-- ============================================================
-- ARGONAUT OS · Paket PK · Plaene mit Maengel-Pins (B22) + Foto-KI (B27)
-- Stand 24.09.2026
--   bau_plan       Plaene je Projekt (Bild), mit Versionen
--   bau_plan_pin   Pins auf dem Plan: Mangel, Schaden, Hinweis, Aufmass-Stelle
--   Bucket 'bau-plaene' (privat): <Betrieb-ID>/plaene/... und /pins/...
--
-- ADDITIV UND IDEMPOTENT: zwei neue Tabellen, ein neuer Bucket, vier eigene
-- Speicher-Regeln (nur fuer diesen Bucket). Nichts Bestehendes angefasst.
-- Anders als beim Bautagebuch haengt der Speicherordner am BETRIEB (Chef-ID),
-- nicht an der Person — so sehen Chef und Monteure dieselben Plaene und Fotos.
-- RLS: Chef alles. Mitarbeiter: lesen, Plaene und Pins anlegen, Pins bis
-- "behoben" weiterschalten und Nachher-Foto setzen. Abnehmen und Loeschen: Chef.
-- ============================================================

create table if not exists public.bau_plan (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  erstellt_von  uuid default auth.uid(),
  projekt_id    uuid references public.projekte(id) on delete set null,
  titel         text not null,
  version       integer not null default 1 check (version between 1 and 999),
  vorgaenger_id uuid references public.bau_plan(id) on delete set null,
  datei_pfad    text not null,
  breite        integer,
  hoehe         integer,
  aktiv         boolean not null default true,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists bau_plan_owner_idx on public.bau_plan (owner_user_id, projekt_id, aktiv);

create table if not exists public.bau_plan_pin (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(mein_chef_id(), auth.uid()),
  erstellt_von      uuid default auth.uid(),
  plan_id           uuid not null references public.bau_plan(id) on delete cascade,
  nummer            integer not null,
  x                 numeric(6,5) not null check (x between 0 and 1),
  y                 numeric(6,5) not null check (y between 0 and 1),
  titel             text not null,
  art               text not null default 'mangel' check (art in ('mangel', 'schaden', 'hinweis', 'aufmass')),
  status            text not null default 'offen' check (status in ('offen', 'in_arbeit', 'behoben', 'abgenommen')),
  gewerk            text,
  frist             date,
  zustaendig        text,
  beschreibung      text,
  foto_pfad         text,
  foto_nachher_pfad text,
  erledigt_am       timestamptz,
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now()
);
create index if not exists bau_plan_pin_plan_idx on public.bau_plan_pin (plan_id, nummer);
create index if not exists bau_plan_pin_owner_idx on public.bau_plan_pin (owner_user_id, status);

alter table public.bau_plan enable row level security;
alter table public.bau_plan_pin enable row level security;

do $$
begin
  -- bau_plan
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_plan' and policyname='bau_plan_chef') then
    create policy bau_plan_chef on public.bau_plan for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_plan' and policyname='bau_plan_ma_select') then
    create policy bau_plan_ma_select on public.bau_plan for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_plan' and policyname='bau_plan_ma_insert') then
    create policy bau_plan_ma_insert on public.bau_plan for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
  end if;

  -- bau_plan_pin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_plan_pin' and policyname='bau_plan_pin_chef') then
    create policy bau_plan_pin_chef on public.bau_plan_pin for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_plan_pin' and policyname='bau_plan_pin_ma_select') then
    create policy bau_plan_pin_ma_select on public.bau_plan_pin for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_plan_pin' and policyname='bau_plan_pin_ma_insert') then
    create policy bau_plan_pin_ma_insert on public.bau_plan_pin for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid() and status in ('offen', 'in_arbeit', 'behoben'));
  end if;
  -- Mitarbeiter duerfen weiterschalten bis "behoben", nie "abgenommen"
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_plan_pin' and policyname='bau_plan_pin_ma_update') then
    create policy bau_plan_pin_ma_update on public.bau_plan_pin for update to authenticated
      using (owner_user_id = mein_chef_id() and status <> 'abgenommen')
      with check (owner_user_id = mein_chef_id() and status in ('offen', 'in_arbeit', 'behoben'));
  end if;
end $$;

-- Speicher: privater Bucket, erster Ordner = Betrieb
insert into storage.buckets (id, name, public)
values ('bau-plaene', 'bau-plaene', false)
on conflict (id) do nothing;

drop policy if exists bau_plaene_select on storage.objects;
create policy bau_plaene_select on storage.objects for select to authenticated
  using (bucket_id = 'bau-plaene' and (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text);
drop policy if exists bau_plaene_insert on storage.objects;
create policy bau_plaene_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bau-plaene' and (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text);
drop policy if exists bau_plaene_update on storage.objects;
create policy bau_plaene_update on storage.objects for update to authenticated
  using (bucket_id = 'bau-plaene' and (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text);
drop policy if exists bau_plaene_delete on storage.objects;
create policy bau_plaene_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bau-plaene' and (storage.foldername(name))[1] = auth.uid()::text);

-- Kontrolle: EINE Ergebnistabelle
select '1 tabelle' as art, tablename as name, rowsecurity::text as wert
  from pg_tables where schemaname = 'public' and tablename in ('bau_plan', 'bau_plan_pin')
union all
select '2 bucket', id, case when public then 'OEFFENTLICH' else 'privat' end
  from storage.buckets where id = 'bau-plaene'
union all
select '3 regel', tablename || ' / ' || policyname, cmd
  from pg_policies where (schemaname = 'public' and tablename in ('bau_plan', 'bau_plan_pin'))
                      or (schemaname = 'storage' and policyname like 'bau_plaene_%')
order by 1, 2;
