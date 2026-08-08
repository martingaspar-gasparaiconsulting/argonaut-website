-- ============================================================
-- ARGONAUT OS · D4 · Multistandort-Tiefe · Aufträge (Stempel)
-- „Stempel"-Muster: jeder Auftrag gehört EINEM Standort. Beim Anlegen wird der
-- aktive Filial-Standort mitgestempelt; die Liste zeigt fail-open den eigenen
-- Standort PLUS Aufträge ohne Standort (Alt-/zentrale Daten). Nichts verschwindet.
-- Nullable + ON DELETE SET NULL → nichts bricht, wenn ein Standort entfällt.
-- Additiv · idempotent · NICHT destruktiv.
-- ============================================================

alter table public.auftraege
  add column if not exists standort_id uuid references public.standorte(id) on delete set null;

create index if not exists auftraege_standort_idx
  on public.auftraege (standort_id);
