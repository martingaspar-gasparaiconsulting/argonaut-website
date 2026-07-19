-- ============================================================
-- ARGONAUT OS · Bündel 27 · Gesundheit & Wellness
-- Kundenkartei (mit Hinweisen) + Behandlungen/Termine je Kunde.
-- KEINE Medizinberatung — reines Verwaltungswerkzeug.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.wellness_kunden (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null default 'Kunde',
  telefon       text,
  email         text,
  geburtsdatum  date,
  hinweise      text,                                  -- z.B. Allergien, Wünsche
  erstellt_am   timestamptz not null default now()
);
create index if not exists wellness_kunden_idx on public.wellness_kunden (owner_user_id, name);

create table if not exists public.wellness_behandlungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kunde_id      uuid not null references public.wellness_kunden(id) on delete cascade,
  datum         date not null default current_date,
  behandlung    text not null default '',
  dauer_min     integer,
  preis         numeric(12,2) not null default 0,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists wellness_beh_idx on public.wellness_behandlungen (kunde_id, datum desc);

alter table public.wellness_kunden enable row level security;
alter table public.wellness_behandlungen enable row level security;

drop policy if exists wk_owner_all on public.wellness_kunden;
create policy wk_owner_all on public.wellness_kunden for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists wk_select_ma on public.wellness_kunden;
create policy wk_select_ma on public.wellness_kunden for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists wk_insert_ma on public.wellness_kunden;
create policy wk_insert_ma on public.wellness_kunden for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists wb_owner_all on public.wellness_behandlungen;
create policy wb_owner_all on public.wellness_behandlungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists wb_select_ma on public.wellness_behandlungen;
create policy wb_select_ma on public.wellness_behandlungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists wb_insert_ma on public.wellness_behandlungen;
create policy wb_insert_ma on public.wellness_behandlungen for insert to public with check ((owner_user_id = mein_chef_id()));
