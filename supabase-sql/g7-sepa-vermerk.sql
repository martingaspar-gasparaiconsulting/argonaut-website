-- ============================================================
-- ARGONAUT OS · G7 (26.09.2026) · SEPA-Einzug: Doppel-Einzug verhindern
-- Rechnungen, die in einer erzeugten SEPA-Datei stehen, bekommen das
-- Ausführungsdatum vermerkt und verschwinden aus der Einzugs-Auswahl.
-- Additiv · idempotent · keine Regel wird geändert.
-- ============================================================
alter table public.rechnungen
  add column if not exists sepa_datei_am date;

-- Kontrolle
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'rechnungen' and column_name = 'sepa_datei_am';
