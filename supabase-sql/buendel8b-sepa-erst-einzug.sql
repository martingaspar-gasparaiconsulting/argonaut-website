-- ============================================================
-- ARGONAUT OS · Bündel 8b · SEPA-Verfeinerung
-- Merkt, ob ein Mandat schon eingezogen wurde: erster Einzug = FRST,
-- danach automatisch RCUR. Nicht-brechend · idempotent.
-- (Ergänzt Bündel 8. IBAN-Prüfsumme + Erklär-Box laufen rein im Code.)
-- ============================================================

alter table public.mitglieder
  add column if not exists erst_einzug boolean not null default true;
