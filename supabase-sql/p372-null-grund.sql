-- ============================================================================
-- ARGONAUT OS · SQL p372 · HW-17 Grund bei 0 % Umsatzsteuer (15.10.2026)
--
-- Zwei neue Spalten an rechnungen:
--   null_grund       'pv_null' (§ 12 Abs. 3 UStG) | 'steuerfrei' | leer
--   null_grund_text  die Vorschrift bei „steuerfrei", z. B. „§ 4 Nr. 11 UStG"
-- Nur additiv. Nichts wird geloescht oder geaendert. Zweimal ausfuehren schadet nicht.
-- Kein Aussperr-Risiko.
-- ============================================================================

alter table public.rechnungen
  add column if not exists null_grund text;

alter table public.rechnungen
  add column if not exists null_grund_text text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'rechnungen_null_grund_check'
  ) then
    alter table public.rechnungen
      add constraint rechnungen_null_grund_check
      check (null_grund is null or null_grund in ('pv_null', 'steuerfrei'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'rechnungen_null_grund_text_check'
  ) then
    alter table public.rechnungen
      add constraint rechnungen_null_grund_text_check
      check (null_grund_text is null or char_length(null_grund_text) <= 120);
  end if;
end $$;

-- Kontrolle (nur lesen) — Erwartung: 2 | 2
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'rechnungen'
      and column_name in ('null_grund', 'null_grund_text')) as spalten,
  (select count(*) from pg_constraint
    where conname in ('rechnungen_null_grund_check',
                      'rechnungen_null_grund_text_check')) as regeln;
