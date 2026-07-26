-- ============================================================
-- ARGONAUT OS · Compliance · Prüffristen (Führerschein, UVV/DGUV V3, u. a.)
-- EINE generische Tabelle für wiederkehrende Pflicht-Prüfungen mit Ampel &
-- Erinnerung (Führerscheinkontrolle 2×/Jahr, UVV/DGUV V3 jährlich, TÜV …).
-- Idempotent; RLS nach Tenant-Muster.
-- ============================================================

create table if not exists pruefpflichten (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  art text not null default 'sonstige',      -- fuehrerschein | uvv | tuev | sonstige
  bezeichnung text not null,
  verantwortlich text,
  letzte_pruefung date,
  intervall_monate integer not null default 12,
  naechste_pruefung date,
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pruefpflichten_owner on pruefpflichten (owner_user_id, naechste_pruefung);

alter table pruefpflichten enable row level security;
drop policy if exists owner_all on pruefpflichten;
create policy owner_all on pruefpflichten for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on pruefpflichten;
create policy select_ma on pruefpflichten for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on pruefpflichten;
create policy insert_ma on pruefpflichten for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on pruefpflichten;
create policy update_ma on pruefpflichten for update using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
