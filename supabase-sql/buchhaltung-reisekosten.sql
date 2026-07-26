-- ============================================================
-- ARGONAUT OS · Buchhaltung · Reisekosten (Dienstreisen)
-- Eine Reise = ein Datensatz. Verpflegungspauschale, Fahrtkosten (km) und
-- Uebernachtung werden in der App nach den aktuellen deutschen Saetzen (2026)
-- gerechnet und hier gespeichert. Idempotent; RLS nach Tenant-Muster.
-- ============================================================

create table if not exists reisekosten (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  reisender text,
  anlass text,
  ziel text,
  abreise timestamptz,
  rueckkehr timestamptz,
  km numeric(10,1),
  fahrzeug text not null default 'pkw',        -- pkw | motorrad
  km_satz numeric(4,2) not null default 0.30,
  fahrt_betrag numeric(12,2) not null default 0,
  fruehstueck_anz integer not null default 0,
  mittag_anz integer not null default 0,
  abend_anz integer not null default 0,
  verpflegung_brutto numeric(12,2) not null default 0,
  verpflegung_kuerzung numeric(12,2) not null default 0,
  verpflegung_netto numeric(12,2) not null default 0,
  uebernachtung numeric(12,2) not null default 0,
  sonstige numeric(12,2) not null default 0,
  gesamt numeric(12,2) not null default 0,
  status text not null default 'offen',        -- offen | erstattet
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reisekosten_owner on reisekosten (owner_user_id, abreise desc);

alter table reisekosten enable row level security;
drop policy if exists owner_all on reisekosten;
create policy owner_all on reisekosten for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on reisekosten;
create policy select_ma on reisekosten for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on reisekosten;
create policy insert_ma on reisekosten for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on reisekosten;
create policy update_ma on reisekosten for update using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
