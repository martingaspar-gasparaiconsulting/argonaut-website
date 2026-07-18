-- ============================================================
-- ARGONAUT OS · Bündel 18 · KFZ-Fachpaket
-- Für KFZ-Betriebe: Fahrzeuge mit HU/AU-Fristen (Ampel) und ein Reifenhotel
-- (Einlagerung je Fahrzeug/Kunde mit Lagerplatz & Saison).
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.kfz_fahrzeuge (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  halter         text,
  kennzeichen    text,
  marke          text,
  modell         text,
  vin            text,
  erstzulassung  date,
  hu_faellig     date,          -- nächste Hauptuntersuchung
  au_faellig     date,          -- nächste Abgasuntersuchung
  km_stand       integer,
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists kfz_fahrzeuge_idx on public.kfz_fahrzeuge (owner_user_id, hu_faellig);

create table if not exists public.kfz_reifeneinlagerung (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  fahrzeug_id    uuid references public.kfz_fahrzeuge(id) on delete set null,
  kunde_name     text,
  kennzeichen    text,
  saison         text not null default 'sommer',   -- sommer | winter
  groesse        text,                               -- z.B. 205/55 R16
  anzahl         integer not null default 4,
  lagerplatz     text,
  eingelagert_am date not null default current_date,
  ausgelagert_am date,
  notiz          text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists kfz_reifen_idx on public.kfz_reifeneinlagerung (owner_user_id, ausgelagert_am);

alter table public.kfz_fahrzeuge enable row level security;
alter table public.kfz_reifeneinlagerung enable row level security;

-- Fahrzeuge (operativ: Chef + Mitarbeiter mit Modul)
drop policy if exists kfzf_owner_all on public.kfz_fahrzeuge;
create policy kfzf_owner_all on public.kfz_fahrzeuge for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kfzf_select_ma on public.kfz_fahrzeuge;
create policy kfzf_select_ma on public.kfz_fahrzeuge for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kfzf_insert_ma on public.kfz_fahrzeuge;
create policy kfzf_insert_ma on public.kfz_fahrzeuge for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists kfzf_update_ma on public.kfz_fahrzeuge;
create policy kfzf_update_ma on public.kfz_fahrzeuge for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

-- Reifeneinlagerung
drop policy if exists kfzr_owner_all on public.kfz_reifeneinlagerung;
create policy kfzr_owner_all on public.kfz_reifeneinlagerung for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kfzr_select_ma on public.kfz_reifeneinlagerung;
create policy kfzr_select_ma on public.kfz_reifeneinlagerung for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kfzr_insert_ma on public.kfz_reifeneinlagerung;
create policy kfzr_insert_ma on public.kfz_reifeneinlagerung for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists kfzr_update_ma on public.kfz_reifeneinlagerung;
create policy kfzr_update_ma on public.kfz_reifeneinlagerung for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
