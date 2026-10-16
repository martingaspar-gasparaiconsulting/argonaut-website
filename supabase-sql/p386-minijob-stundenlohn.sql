-- ============================================================================
-- ARGONAUT OS · Paket 386 · MO0c Mindestlohn je Minijobber (16.10.2026)
-- ADDITIV + IDEMPOTENT. Leer = gesetzlicher Mindestlohn des Monats.
-- Der Schichtplan laeuft auch ohne dieses SQL (dann immer gesetzlicher Mindestlohn).
-- ============================================================================

alter table public.mitarbeiter
  add column if not exists minijob_stundenlohn numeric(8,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mitarbeiter_minijob_stundenlohn_chk') then
    alter table public.mitarbeiter
      add constraint mitarbeiter_minijob_stundenlohn_chk
      check (minijob_stundenlohn is null or (minijob_stundenlohn > 0 and minijob_stundenlohn <= 500));
  end if;
end $$;

-- Kontrolle: muss 1|1 ergeben
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'mitarbeiter'
      and column_name = 'minijob_stundenlohn') as spalte,
  (select count(*) from pg_constraint
    where conname = 'mitarbeiter_minijob_stundenlohn_chk') as regel;
