-- ============================================================================
-- ARGONAUT OS · Termin-Nachfass — Feld auf website_termine
-- Additiv & idempotent. „Success. No rows returned" = passt.
-- ============================================================================
alter table website_termine add column if not exists nachfass_gesendet_am timestamptz;

-- Beschleunigt den Tages-Cron (nur noch nicht nachgefasste Termine).
create index if not exists website_termine_nachfass_idx
  on website_termine (slot_date)
  where nachfass_gesendet_am is null;
