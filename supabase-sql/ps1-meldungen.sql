-- ============================================================
-- ARGONAUT OS · Paket PS1 · Meldungen & Register — Stand 24.09.2026
--   Neue Mappe 'meldungen' in der Tabelle nachweis (Paket PE):
--   Verpackungsregister LUCID, Kuenstlersozialkasse, Marktstammdatenregister,
--   Netzbetreiber, Agrarantrag, AZAV, Intrastat, stiftung ear.
--
-- ADDITIV UND IDEMPOTENT: Die Pruefregel der Spalte mappe wird nur
-- ERWEITERT (alle bisherigen Werte bleiben erlaubt). Keine Zeile wird
-- geaendert oder geloescht. Laeuft beliebig oft.
-- RLS unveraendert: Mitarbeiter sehen weiterhin NUR Arbeitsschutz und
-- Pflichten — die Mappe Meldungen sieht nur der Chef.
-- ============================================================

begin;

do $$
declare
  r record;
begin
  -- alte Pruefregel(n) auf der Spalte mappe entfernen (Name egal)
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.nachweis'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%mappe%'
  loop
    execute format('alter table public.nachweis drop constraint %I', r.conname);
  end loop;

  alter table public.nachweis add constraint nachweis_mappe_check
    check (mappe in ('arbeitsschutz', 'pflichten', 'subunternehmer', 'versicherung', 'entsorgung', 'meldungen'));
end $$;

commit;

-- ------------------------------------------------------------
-- LESEN (Kontrolle): Pruefregel und Regeln der Tabelle
-- ------------------------------------------------------------
select conname, pg_get_constraintdef(oid) as regel
from pg_constraint
where conrelid = 'public.nachweis'::regclass and contype = 'c';

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'nachweis'
order by policyname;
