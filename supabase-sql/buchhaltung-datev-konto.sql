-- ============================================================
-- ARGONAUT OS · Buchhaltung · DATEV-Konto am Eingangsbeleg
-- Ergaenzt die bestehende Tabelle eingangsbelege um das gebuchte/vorge-
-- schlagene Sachkonto (SKR03 oder SKR04). Idempotent, keine Datenverluste.
-- ============================================================

alter table eingangsbelege add column if not exists datev_konto text;

-- Optional-Merker, welcher Kontenrahmen gemeint ist (skr03 | skr04).
alter table eingangsbelege add column if not exists datev_rahmen text;
