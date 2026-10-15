-- ============================================================
-- ARGONAUT OS · Paket 378 · HW-15 Nachtrag abrechnen (15.10.2026)
-- Ein beauftragter Nachtrag, der nicht ins LV kommt, bekommt eine eigene
-- Rechnung (/api/rechnung-aus-nachtrag). Die Rechnung wird am Nachtrag
-- vermerkt — das ist der Doppel-Schutz.
-- ADDITIV UND IDEMPOTENT: eine neue Spalte + Index, nichts geloescht.
-- ============================================================

alter table public.bau_nachtrag
  add column if not exists rechnung_id uuid
  references public.rechnungen(id) on delete set null;

create index if not exists bau_nachtrag_rechnung_idx
  on public.bau_nachtrag (rechnung_id)
  where rechnung_id is not null;

-- Kontrolle: erwartet 1
select count(*) as p378
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bau_nachtrag'
  and column_name = 'rechnung_id';
