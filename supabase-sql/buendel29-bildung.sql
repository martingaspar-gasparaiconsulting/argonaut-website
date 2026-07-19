-- ============================================================
-- ARGONAUT OS · Bündel 29 · Bildung & Kurse
-- Kurse (mit Plätzen) + Anmeldungen/Teilnehmer mit Status.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.bildung_kurse (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  titel         text not null default 'Kurs',
  start_am      date,
  ende_am       date,
  ort           text,
  plaetze       integer not null default 10,
  preis         numeric(12,2) not null default 0,
  status        text not null default 'geplant',        -- geplant | laeuft | abgeschlossen | abgesagt
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists bildung_kurse_idx on public.bildung_kurse (owner_user_id, start_am);

create table if not exists public.bildung_anmeldungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kurs_id       uuid not null references public.bildung_kurse(id) on delete cascade,
  name          text not null default '',
  email         text,
  status        text not null default 'angemeldet',      -- angemeldet | bestaetigt | teilgenommen | storniert
  erstellt_am   timestamptz not null default now()
);
create index if not exists bildung_anm_idx on public.bildung_anmeldungen (kurs_id, status);

alter table public.bildung_kurse enable row level security;
alter table public.bildung_anmeldungen enable row level security;

drop policy if exists bk_owner_all on public.bildung_kurse;
create policy bk_owner_all on public.bildung_kurse for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists bk_select_ma on public.bildung_kurse;
create policy bk_select_ma on public.bildung_kurse for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists bk_insert_ma on public.bildung_kurse;
create policy bk_insert_ma on public.bildung_kurse for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists ba_owner_all on public.bildung_anmeldungen;
create policy ba_owner_all on public.bildung_anmeldungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ba_select_ma on public.bildung_anmeldungen;
create policy ba_select_ma on public.bildung_anmeldungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ba_insert_ma on public.bildung_anmeldungen;
create policy ba_insert_ma on public.bildung_anmeldungen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists ba_update_ma on public.bildung_anmeldungen;
create policy ba_update_ma on public.bildung_anmeldungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
