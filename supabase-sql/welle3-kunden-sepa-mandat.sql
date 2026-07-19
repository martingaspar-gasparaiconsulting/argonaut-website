-- ============================================================
-- ARGONAUT OS · Welle 3 · Schritt 4 — Gemeinsames Kunden-SEPA-Mandat
-- EIN Mandat je Kontakt, überall nutzbar (Rechnungs-Einzug u. a.).
-- Gläubigerdaten bleiben am profiles-Datensatz (wie im Mitglieder-Modul).
-- Idempotent; RLS nach dem Tenant-Muster (Inhaber + Mitarbeiter des Inhabers).
-- ============================================================

create table if not exists kunden_mandate (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id uuid not null,
  kontoinhaber text,
  iban text,
  bic text,
  mandatsreferenz text,
  mandat_datum date,
  erst_einzug boolean not null default true,
  letzte_einziehung date,
  aktiv boolean not null default true,
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ein Mandat je Kontakt und Betrieb.
create unique index if not exists uq_kunden_mandate_kontakt on kunden_mandate (owner_user_id, kontakt_id);

alter table kunden_mandate enable row level security;

-- Inhaber: voller Zugriff auf eigene Zeilen.
drop policy if exists owner_all on kunden_mandate;
create policy owner_all on kunden_mandate for all
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- Mitarbeiter des Inhabers: lesen/anlegen/ändern (kein Löschen).
drop policy if exists select_ma on kunden_mandate;
create policy select_ma on kunden_mandate for select using (owner_user_id = mein_chef_id());
drop policy if exists insert_ma on kunden_mandate;
create policy insert_ma on kunden_mandate for insert with check (owner_user_id = mein_chef_id());
drop policy if exists update_ma on kunden_mandate;
create policy update_ma on kunden_mandate for update
  using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
