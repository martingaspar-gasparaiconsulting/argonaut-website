-- ============================================================
-- ARGONAUT OS · Bündel 1 · Nachtrag — "Ich (Chef)"-Einsätze
-- Eine neue Spalte trennt sauber:
--   inhaber_einsatz = true   -> der Chef macht diesen Einsatz selbst
--   inhaber_einsatz = false + mitarbeiter_id null -> noch niemandem zugewiesen
-- So kann der Inhaber sich im Dispo-Board selbst Einsätze zuweisen, ohne dass
-- er zum "Mitarbeiter" wird (die Chef-/Rechte-Logik bleibt unangetastet).
-- Nicht-brechend · idempotent · bestehende Zeilen werden auf false gesetzt.
-- ============================================================

alter table public.einsaetze
  add column if not exists inhaber_einsatz boolean not null default false;
