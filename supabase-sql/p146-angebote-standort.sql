-- ============================================================
-- ARGONAUT OS · Paket 146 · angebote.standort_id nachholen
-- Claude-Befund 28.09.2026: Die Angebote-Seite (Anlegen, Filial-Filter),
-- der Kalkulator und /api/rechnung-aus-angebot benutzen seit Block D
-- (09.08.2026) die Spalte angebote.standort_id — live gibt es sie nicht
-- (Pruefung 28.09.: nur rabatt_prozent, rabatt_betrag, genehmigung_noetig,
-- genehmigt als Zusatzspalten). Folge: „→ Rechnung" aus einem Angebot meldet
-- „Angebot nicht gefunden", Anlegen scheitert, sobald die Spalte mitgeschickt wird.
-- Rein additiv · idempotent · nichts wird geloescht oder umgeschrieben.
-- ============================================================

alter table public.angebote
  add column if not exists standort_id uuid references public.standorte(id) on delete set null;

create index if not exists angebote_standort_idx on public.angebote (standort_id);

-- Kontrolle: muss 1 Zeile „standort_id | uuid" zeigen
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'angebote' and column_name = 'standort_id';
