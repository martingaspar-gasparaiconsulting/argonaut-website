-- ============================================================
-- C1 · Vertrag kündigen (§ 312k-Ablauf)
-- Zwei additive, idempotente Spalten auf vertraege für die Kündigung.
-- Nicht destruktiv; bestehende Daten bleiben unberührt.
-- ============================================================

alter table public.vertraege add column if not exists kuendigung_grund text;
alter table public.vertraege add column if not exists kuendigung_am date;
