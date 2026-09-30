-- ============================================================================
-- ARGONAUT OS · Paket 182 (30.09.2026) · Online-Zusage erst ab „gesendet"
--
-- Nachweis der Online-Entscheidung: Name der Person und Wortlaut der Erklärung
-- (Zeitpunkt steht schon in angenommen_am / abgelehnt_am).
-- NUR zwei neue Spalten, sonst nichts. Mehrfach ausführbar.
-- REIHENFOLGE: VOR dem Push ausführen — die neue Zusage-Schnittstelle schreibt
-- diese Spalten.
-- ============================================================================

alter table public.angebote add column if not exists entschieden_name text;
alter table public.angebote add column if not exists entschieden_erklaerung text;

-- KONTROLLE (nur lesen) — Erwartung: 2 | Zahl der Entwürfe (nur zur Info:
-- deren Links zeigen nach dem Push „noch nicht freigegeben", bis sie als
-- gesendet markiert sind)
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'angebote'
      and column_name in ('entschieden_name', 'entschieden_erklaerung')) as neue_spalten,
  (select count(*) from public.angebote where status = 'entwurf') as entwuerfe;
