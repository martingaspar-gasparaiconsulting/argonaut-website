-- ============================================================
-- ARGONAUT OS · Welle 3 · Schritt 2 — Fachpaket → Rechnung
-- Fügt den Fachpaket-Tabellen die Doppel-Abrechnungs-Sperre hinzu:
--   abgerechnet (bool) + rechnung_id (uuid).
-- Idempotent: mehrfaches Ausführen ist gefahrlos.
-- ============================================================

alter table if exists wellness_behandlungen
  add column if not exists abgerechnet boolean not null default false,
  add column if not exists rechnung_id uuid;

alter table if exists tier_behandlungen
  add column if not exists abgerechnet boolean not null default false,
  add column if not exists rechnung_id uuid;

alter table if exists bildung_anmeldungen
  add column if not exists abgerechnet boolean not null default false,
  add column if not exists rechnung_id uuid;

-- Index für schnelle "offene" Filter (optional, schadet nie)
create index if not exists idx_wellness_beh_offen on wellness_behandlungen (kunde_id) where abgerechnet = false;
create index if not exists idx_tier_beh_offen on tier_behandlungen (tier_id) where abgerechnet = false;
create index if not exists idx_bildung_anm_offen on bildung_anmeldungen (kurs_id) where abgerechnet = false;
