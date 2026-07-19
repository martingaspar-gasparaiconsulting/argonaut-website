-- ============================================================
-- ARGONAUT OS · Compliance-Center — Sofortmeldung + §48b Freistellung
--  · sofortmeldungen: neue Beschäftigte vor Arbeitsbeginn melden (Schwarzarbeit)
--  · freistellungen : §48b-Bescheinigungen (eigene + Subunternehmer),
--    ohne gültige Bescheinigung droht 15 % Bauabzugsteuer-Einbehalt.
-- ARGONAUT bereitet die Daten vor & erinnert; die Übermittlung/Prüfung bleibt
-- beim Betrieb (sv.net / Finanzamt). Idempotent; RLS nach Tenant-Muster.
-- ============================================================

create table if not exists sofortmeldungen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mitarbeiter_name text not null,
  sv_nummer text,
  geburtsdatum date,
  betriebsnummer text,
  beschaeftigung_ab date,
  gemeldet boolean not null default false,
  gemeldet_am date,
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sofortmeldungen_owner on sofortmeldungen (owner_user_id, beschaeftigung_ab);

create table if not exists freistellungen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  art text not null default 'eigen',       -- 'eigen' | 'partner' (Subunternehmer)
  inhaber text,
  finanzamt text,
  sicherheitsnummer text,
  gueltig_von date,
  gueltig_bis date,
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_freistellungen_owner on freistellungen (owner_user_id, gueltig_bis);

alter table sofortmeldungen enable row level security;
alter table freistellungen enable row level security;

drop policy if exists owner_all on sofortmeldungen;
create policy owner_all on sofortmeldungen for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on sofortmeldungen;
create policy select_ma on sofortmeldungen for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on sofortmeldungen;
create policy insert_ma on sofortmeldungen for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on sofortmeldungen;
create policy update_ma on sofortmeldungen for update using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

drop policy if exists owner_all on freistellungen;
create policy owner_all on freistellungen for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on freistellungen;
create policy select_ma on freistellungen for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on freistellungen;
create policy insert_ma on freistellungen for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on freistellungen;
create policy update_ma on freistellungen for update using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
