-- ============================================================
-- ARGONAUT OS · Multistandort · Lager je Filiale (Block D · #4, Push 2)
-- Zu-/Abgänge je Filiale (Wareneingang, Warenausgang, Korrektur) mit Verlauf.
-- Bucht auf artikel_bestand_standort (Push 1) und protokolliert die Bewegung.
-- Additiv · idempotent · NICHT destruktiv. RLS wie artikel_bestand_standort.
-- ============================================================

create table if not exists public.lager_bewegung (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  artikel_id    uuid not null references public.artikel(id)   on delete cascade,
  standort_id   uuid not null references public.standorte(id) on delete cascade,
  typ           text not null default 'zugang',   -- zugang | abgang | korrektur
  menge         numeric not null,                  -- gebuchte Menge (bei Korrektur: neuer Bestand)
  grund         text,
  datum         date not null default current_date,
  erstellt_von  uuid,
  erstellt_am   timestamptz not null default now()
);

create index if not exists lager_bewegung_owner_idx    on public.lager_bewegung (owner_user_id);
create index if not exists lager_bewegung_artikel_idx  on public.lager_bewegung (artikel_id);
create index if not exists lager_bewegung_standort_idx on public.lager_bewegung (standort_id);
create index if not exists lager_bewegung_datum_idx    on public.lager_bewegung (datum);

alter table public.lager_bewegung enable row level security;

drop policy if exists lbw_owner_all on public.lager_bewegung;
create policy lbw_owner_all on public.lager_bewegung
  as PERMISSIVE for ALL to public
  using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));

drop policy if exists lbw_select_ma on public.lager_bewegung;
create policy lbw_select_ma on public.lager_bewegung
  as PERMISSIVE for SELECT to public using ((owner_user_id = mein_chef_id()));

drop policy if exists lbw_insert_ma on public.lager_bewegung;
create policy lbw_insert_ma on public.lager_bewegung
  as PERMISSIVE for INSERT to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists lbw_delete_ma on public.lager_bewegung;
create policy lbw_delete_ma on public.lager_bewegung
  as PERMISSIVE for DELETE to public using ((owner_user_id = mein_chef_id()));
