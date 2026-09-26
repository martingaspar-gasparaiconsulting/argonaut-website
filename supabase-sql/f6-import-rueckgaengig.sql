-- ============================================================
-- ARGONAUT OS · F6 (26.09.2026) · Import rückgängig machen
-- import_jobs merkt sich die ids der NEU angelegten Datensätze, damit
-- „↺ … löschen" im Import-Center genau diese wieder entfernen kann.
-- Additiv · idempotent · nicht destruktiv. Keine neue Zugriffsregel.
-- Ohne dieses SQL läuft das Import-Center wie bisher (ohne Rückgängig).
-- ============================================================

alter table public.import_jobs
  add column if not exists angelegte_ids jsonb not null default '[]'::jsonb;

alter table public.import_jobs
  add column if not exists rueckgaengig_am timestamptz;

-- Kontrolle: beide Spalten müssen erscheinen
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'import_jobs'
  and column_name in ('angelegte_ids', 'rueckgaengig_am')
order by column_name;
