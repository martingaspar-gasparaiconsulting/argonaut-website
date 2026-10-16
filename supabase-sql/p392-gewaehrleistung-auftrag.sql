-- ============================================================
-- ARGONAUT OS · Paket 392 · LK2 Gewaehrleistung am Auftrag
--   bau_gewaehrleistung.auftrag_id   Gewaehrleistung haengt am Auftrag
--   bau_gewaehrleistung.begehung_am  Gewaehrleistungs-Begehung erledigt
--
-- ADDITIV UND IDEMPOTENT: zwei neue Spalten + Index. Nichts geloescht,
-- RLS unveraendert (nur Geschaeftsleitung). Code laeuft auch vorher.
-- ============================================================

alter table public.bau_gewaehrleistung add column if not exists auftrag_id uuid references public.auftraege(id) on delete set null;
alter table public.bau_gewaehrleistung add column if not exists begehung_am date;
create index if not exists bau_gewaehrleistung_auftrag_idx on public.bau_gewaehrleistung (auftrag_id);

select count(*) as kontrolle_2
  from information_schema.columns
 where table_schema = 'public' and table_name = 'bau_gewaehrleistung'
   and column_name in ('auftrag_id', 'begehung_am');
