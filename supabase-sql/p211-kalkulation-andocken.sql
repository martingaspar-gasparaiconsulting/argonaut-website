-- ============================================================
-- ARGONAUT OS · Paket 211 (05.10.2026) · Stufe 3 B9 „Paket 2 Andocken"
--
-- Kalkulator merkt sich, aus welchem Aufmaß die Menge stammt (mit
-- Rechenweg). Die Spalte projekt_id gibt es schon — sie wird ab jetzt beim
-- Speichern gesetzt (Ist-Stunden aus dem Projekt fließen zurück).
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder geändert,
-- keine Regel wird angefasst. AUSSPERR-RISIKO: keines.
-- Ohne dieses SQL speichert der Kalkulator wie bisher (nur ohne Aufmaß-Bezug).
--
-- RÜCKWEG (nur im Notfall):
--   alter table public.kalkulationen drop column if exists aufmass_id, drop column if exists aufmass_rechenweg;
-- ============================================================

alter table public.kalkulationen add column if not exists aufmass_id uuid;
alter table public.kalkulationen add column if not exists aufmass_rechenweg text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'kalkulationen_aufmass_rechenweg_laenge') then
    alter table public.kalkulationen
      add constraint kalkulationen_aufmass_rechenweg_laenge check (aufmass_rechenweg is null or char_length(aufmass_rechenweg) <= 2000);
  end if;
end $$;

create index if not exists kalkulationen_projekt_idx on public.kalkulationen (owner_user_id, projekt_id) where projekt_id is not null;

comment on column public.kalkulationen.aufmass_id is 'Paket 211: Aufmaß, aus dem die Menge übernommen wurde (nur Bezug, kein Fremdschlüssel).';
comment on column public.kalkulationen.aufmass_rechenweg is 'Paket 211: Rechenweg der übernommenen Aufmaß-Positionen.';

-- KONTROLLE — Erwartung: neue_spalten 2 · pruefregel 1 · mit_projekt (Info: bisher verknüpfte Kalkulationen, erwartet 0)
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'kalkulationen'
     and column_name in ('aufmass_id', 'aufmass_rechenweg')) as neue_spalten,
  (select count(*) from pg_constraint where conname = 'kalkulationen_aufmass_rechenweg_laenge') as pruefregel,
  (select count(*) from public.kalkulationen where projekt_id is not null) as mit_projekt;
