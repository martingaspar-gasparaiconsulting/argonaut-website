-- ============================================================
-- ARGONAUT OS · Bündel 23 · Energie-Fachpaket
-- Energie-Anlagen (PV/Wärmepumpe/BHKW) mit Wartungsfrist + Zählerstände/Erträge.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.energie_anlagen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  bezeichnung   text not null default 'Anlage',
  typ           text,                                 -- PV | Waermepumpe | BHKW | Speicher ...
  standort      text,
  leistung_kw   numeric(12,2),
  inbetriebnahme date,
  wartung_faellig date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists energie_anlagen_idx on public.energie_anlagen (owner_user_id, wartung_faellig);

create table if not exists public.energie_ablesungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  anlage_id     uuid not null references public.energie_anlagen(id) on delete cascade,
  datum         date not null default current_date,
  zaehlerstand  numeric(14,2),
  ertrag_kwh    numeric(14,2),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists energie_ablesungen_idx on public.energie_ablesungen (anlage_id, datum desc);

alter table public.energie_anlagen enable row level security;
alter table public.energie_ablesungen enable row level security;

drop policy if exists ea_owner_all on public.energie_anlagen;
create policy ea_owner_all on public.energie_anlagen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ea_select_ma on public.energie_anlagen;
create policy ea_select_ma on public.energie_anlagen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ea_insert_ma on public.energie_anlagen;
create policy ea_insert_ma on public.energie_anlagen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists ea_update_ma on public.energie_anlagen;
create policy ea_update_ma on public.energie_anlagen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

drop policy if exists eab_owner_all on public.energie_ablesungen;
create policy eab_owner_all on public.energie_ablesungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists eab_select_ma on public.energie_ablesungen;
create policy eab_select_ma on public.energie_ablesungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists eab_insert_ma on public.energie_ablesungen;
create policy eab_insert_ma on public.energie_ablesungen for insert to public with check ((owner_user_id = mein_chef_id()));
