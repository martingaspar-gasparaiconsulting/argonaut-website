-- ============================================================
-- ARGONAUT OS · Bündel 31 · Landwirtschaft & Forst
-- Schläge/Flächen + Maßnahmen (Aussaat/Düngung/Pflanzenschutz/Ernte) als
-- Schlagkartei-Kern. Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.agrar_schlaege (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null default 'Schlag',
  flaeche_ha    numeric(12,3),
  kultur        text,
  standort      text,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists agrar_schlaege_idx on public.agrar_schlaege (owner_user_id, name);

create table if not exists public.agrar_massnahmen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  schlag_id     uuid not null references public.agrar_schlaege(id) on delete cascade,
  datum         date not null default current_date,
  art           text not null default 'sonstige',      -- aussaat | duengung | pflanzenschutz | ernte | sonstige
  mittel        text,
  menge         numeric(12,2),
  einheit       text,
  ertrag        numeric(12,2),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists agrar_massnahmen_idx on public.agrar_massnahmen (schlag_id, datum desc);

alter table public.agrar_schlaege enable row level security;
alter table public.agrar_massnahmen enable row level security;

drop policy if exists as_owner_all on public.agrar_schlaege;
create policy as_owner_all on public.agrar_schlaege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists as_select_ma on public.agrar_schlaege;
create policy as_select_ma on public.agrar_schlaege for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists as_insert_ma on public.agrar_schlaege;
create policy as_insert_ma on public.agrar_schlaege for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists am_owner_all on public.agrar_massnahmen;
create policy am_owner_all on public.agrar_massnahmen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists am_select_ma on public.agrar_massnahmen;
create policy am_select_ma on public.agrar_massnahmen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists am_insert_ma on public.agrar_massnahmen;
create policy am_insert_ma on public.agrar_massnahmen for insert to public with check ((owner_user_id = mein_chef_id()));
