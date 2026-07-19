-- ============================================================
-- ARGONAUT OS · Welle 5 · Schritt 3 — Onboarding-Checkliste
-- Speichert die manuell abgehakten Startschritte je Betrieb. Die meisten
-- Schritte erkennt die Seite automatisch (Firmendaten, IBAN, erste Rechnung …);
-- diese Tabelle hält die manuellen Haken. Idempotent; RLS nach Tenant-Muster.
-- ============================================================

create table if not exists onboarding_schritte (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  schritt_key text not null,
  erledigt boolean not null default true,
  erledigt_am timestamptz not null default now(),
  unique (owner_user_id, schritt_key)
);

alter table onboarding_schritte enable row level security;

drop policy if exists owner_all on onboarding_schritte;
create policy owner_all on onboarding_schritte for all
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists select_ma on onboarding_schritte;
create policy select_ma on onboarding_schritte for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on onboarding_schritte;
create policy insert_ma on onboarding_schritte for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on onboarding_schritte;
create policy update_ma on onboarding_schritte for update
  using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
