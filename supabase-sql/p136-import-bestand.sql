-- ============================================================
-- ARGONAUT OS · Paket 136 · Umzug Schritt 4 Rest — Bestand je Filiale
-- Der Import bucht Zaehlstaende als Korrektur (lager_buchen). Damit
-- „Rueckgaengig" den alten Stand wiederherstellen kann, merkt sich das
-- Protokoll je Buchung Artikel, Filiale, vorher und nachher.
-- Additiv · idempotent · NICHT destruktiv. Alte Zeilen: null.
-- ============================================================

alter table public.import_jobs add column if not exists rueck_daten jsonb;

comment on column public.import_jobs.rueck_daten is
  'Paket 136: alter Stand je gebuchtem Bestand [{a: artikel_id, s: standort_id|null, alt, neu}] fuer Rueckgaengig';

-- Kontrolle: 1 Spalte + die Buchungsfunktion der Lager-Matrix
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'import_jobs' and column_name = 'rueck_daten') as rueck_daten_spalte,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lager_buchen') as lager_buchen_funktion;
