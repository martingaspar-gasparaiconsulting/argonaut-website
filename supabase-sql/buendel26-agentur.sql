-- ============================================================
-- ARGONAUT OS · Bündel 26 · Agentur & Kreativ
-- Retainer (monatliches Stundenbudget je Kunde) + gebuchte Zeiten darauf.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.agentur_retainer (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  kunde_name     text,
  bezeichnung    text not null default 'Retainer',
  monatsstunden  numeric(10,2) not null default 0,
  stundensatz    numeric(12,2) not null default 0,
  status         text not null default 'aktiv',        -- aktiv | pausiert | beendet
  notiz          text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists agentur_retainer_idx on public.agentur_retainer (owner_user_id, status);

create table if not exists public.agentur_zeiten (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  retainer_id    uuid not null references public.agentur_retainer(id) on delete cascade,
  datum          date not null default current_date,
  stunden        numeric(10,2) not null default 0,
  beschreibung   text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists agentur_zeiten_idx on public.agentur_zeiten (retainer_id, datum desc);

alter table public.agentur_retainer enable row level security;
alter table public.agentur_zeiten enable row level security;

drop policy if exists ar_owner_all on public.agentur_retainer;
create policy ar_owner_all on public.agentur_retainer for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ar_select_ma on public.agentur_retainer;
create policy ar_select_ma on public.agentur_retainer for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ar_insert_ma on public.agentur_retainer;
create policy ar_insert_ma on public.agentur_retainer for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists az_owner_all on public.agentur_zeiten;
create policy az_owner_all on public.agentur_zeiten for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists az_select_ma on public.agentur_zeiten;
create policy az_select_ma on public.agentur_zeiten for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists az_insert_ma on public.agentur_zeiten;
create policy az_insert_ma on public.agentur_zeiten for insert to public with check ((owner_user_id = mein_chef_id()));
