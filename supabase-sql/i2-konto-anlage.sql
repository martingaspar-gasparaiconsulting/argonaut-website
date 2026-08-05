-- ============================================================
-- ARGONAUT OS · I2 · Automatische Konto-Anlage
-- Verknüpft eine öffentliche Bestellung mit dem automatisch angelegten
-- Kunden-Login. Rein additiv · idempotent.
-- ============================================================

alter table public.oeffentliche_bestellungen
  add column if not exists kunde_user_id uuid;
