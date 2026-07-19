-- ============================================================
-- ARGONAUT OS · Bündel 33 · Verein, Kultur & Sozial
-- Vereinsmitglieder (mit Beitrag) + Veranstaltungen mit Teilnehmerzählung.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.verein_mitglieder (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null default 'Mitglied',
  email         text,
  telefon       text,
  eintritt      date,
  beitrag       numeric(12,2) not null default 0,
  intervall     text not null default 'jahr',           -- monat | quartal | jahr
  rolle         text,                                     -- Mitglied | Vorstand | Ehrenamt ...
  status        text not null default 'aktiv',            -- aktiv | ruht | ausgetreten
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists verein_mitglieder_idx on public.verein_mitglieder (owner_user_id, status);

create table if not exists public.verein_veranstaltungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  titel         text not null default 'Veranstaltung',
  datum         date,
  ort           text,
  teilnehmer    integer not null default 0,
  ehrenamt_stunden numeric(10,2) not null default 0,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists verein_veranst_idx on public.verein_veranstaltungen (owner_user_id, datum desc);

alter table public.verein_mitglieder enable row level security;
alter table public.verein_veranstaltungen enable row level security;

drop policy if exists vm_owner_all on public.verein_mitglieder;
create policy vm_owner_all on public.verein_mitglieder for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists vm_select_ma on public.verein_mitglieder;
create policy vm_select_ma on public.verein_mitglieder for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists vm_insert_ma on public.verein_mitglieder;
create policy vm_insert_ma on public.verein_mitglieder for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists vm_update_ma on public.verein_mitglieder;
create policy vm_update_ma on public.verein_mitglieder for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

drop policy if exists vv_owner_all on public.verein_veranstaltungen;
create policy vv_owner_all on public.verein_veranstaltungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists vv_select_ma on public.verein_veranstaltungen;
create policy vv_select_ma on public.verein_veranstaltungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists vv_insert_ma on public.verein_veranstaltungen;
create policy vv_insert_ma on public.verein_veranstaltungen for insert to public with check ((owner_user_id = mein_chef_id()));
