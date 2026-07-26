-- ============================================================
-- ARGONAUT OS · Buchhaltung · Anlagenbuchhaltung (Anlagegüter + AfA)
-- Ein Anlagegut = ein Datensatz. Die Abschreibung (GWG-Sofort oder lineare
-- AfA, monatsgenau) rechnet die App nach den deutschen Regeln (Stand 2026).
-- Idempotent; RLS nach Tenant-Muster.
-- ============================================================

create table if not exists anlagegueter (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  bezeichnung text not null,
  kategorie text,
  anschaffungsdatum date,
  anschaffungskosten numeric(12,2) not null default 0,   -- netto
  nutzungsdauer_jahre integer not null default 1,
  notiz text,
  status text not null default 'aktiv',                   -- aktiv | verkauft | ausgemustert
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_anlagegueter_owner on anlagegueter (owner_user_id, anschaffungsdatum desc);

alter table anlagegueter enable row level security;
drop policy if exists owner_all on anlagegueter;
create policy owner_all on anlagegueter for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on anlagegueter;
create policy select_ma on anlagegueter for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on anlagegueter;
create policy insert_ma on anlagegueter for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on anlagegueter;
create policy update_ma on anlagegueter for update using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
