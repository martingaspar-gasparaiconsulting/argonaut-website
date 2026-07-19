-- ============================================================
-- ARGONAUT OS · Bündel 28 · Kanzlei & Steuer
-- Mandate + Fristenkalender (mit Erledigt-Status). KEINE Steuer-/Rechtsberatung.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.kanzlei_mandate (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  mandant       text not null default 'Mandant',
  art           text,                                  -- Steuer | Recht | Buchhaltung ...
  aktenzeichen  text,
  status        text not null default 'aktiv',          -- aktiv | ruht | beendet
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists kanzlei_mandate_idx on public.kanzlei_mandate (owner_user_id, status);

create table if not exists public.kanzlei_fristen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mandat_id     uuid references public.kanzlei_mandate(id) on delete cascade,
  bezeichnung   text not null default '',
  frist         date not null,
  erledigt      boolean not null default false,
  erledigt_am   date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists kanzlei_fristen_idx on public.kanzlei_fristen (owner_user_id, erledigt, frist);

alter table public.kanzlei_mandate enable row level security;
alter table public.kanzlei_fristen enable row level security;

drop policy if exists km_owner_all on public.kanzlei_mandate;
create policy km_owner_all on public.kanzlei_mandate for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists km_select_ma on public.kanzlei_mandate;
create policy km_select_ma on public.kanzlei_mandate for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists km_insert_ma on public.kanzlei_mandate;
create policy km_insert_ma on public.kanzlei_mandate for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists kf_owner_all on public.kanzlei_fristen;
create policy kf_owner_all on public.kanzlei_fristen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kf_select_ma on public.kanzlei_fristen;
create policy kf_select_ma on public.kanzlei_fristen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kf_insert_ma on public.kanzlei_fristen;
create policy kf_insert_ma on public.kanzlei_fristen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists kf_update_ma on public.kanzlei_fristen;
create policy kf_update_ma on public.kanzlei_fristen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
