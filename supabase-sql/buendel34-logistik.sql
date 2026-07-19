-- ============================================================
-- ARGONAUT OS · Bündel 34 · Logistik-Fachpaket
-- Touren (Datum/Fahrer/Fahrzeug) + Sendungen mit Status-Tracking.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.logistik_touren (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  datum         date not null default current_date,
  fahrer        text,
  fahrzeug      text,
  status        text not null default 'geplant',        -- geplant | unterwegs | abgeschlossen
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists logistik_touren_idx on public.logistik_touren (owner_user_id, datum desc);

create table if not exists public.logistik_sendungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  tour_id       uuid references public.logistik_touren(id) on delete set null,
  sendungsnr    text,
  empfaenger    text,
  adresse       text,
  status        text not null default 'offen',           -- offen | unterwegs | zugestellt | fehlgeschlagen
  reihenfolge   integer not null default 1,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists logistik_sendungen_idx on public.logistik_sendungen (owner_user_id, status);

alter table public.logistik_touren enable row level security;
alter table public.logistik_sendungen enable row level security;

drop policy if exists lt_owner_all on public.logistik_touren;
create policy lt_owner_all on public.logistik_touren for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists lt_select_ma on public.logistik_touren;
create policy lt_select_ma on public.logistik_touren for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists lt_insert_ma on public.logistik_touren;
create policy lt_insert_ma on public.logistik_touren for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists lt_update_ma on public.logistik_touren;
create policy lt_update_ma on public.logistik_touren for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

drop policy if exists ls_owner_all on public.logistik_sendungen;
create policy ls_owner_all on public.logistik_sendungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ls_select_ma on public.logistik_sendungen;
create policy ls_select_ma on public.logistik_sendungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ls_insert_ma on public.logistik_sendungen;
create policy ls_insert_ma on public.logistik_sendungen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists ls_update_ma on public.logistik_sendungen;
create policy ls_update_ma on public.logistik_sendungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
