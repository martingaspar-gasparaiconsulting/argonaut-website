-- ============================================================================
-- ARGONAUT OS · SQL p373 · HW-10 Auftrag aus Angebot (15.10.2026)
--
-- 1) angebote.auftrag_id     -> welcher Auftrag aus dem Angebot entstand
-- 2) auftraege.angebot_id    -> aus welchem Angebot der Auftrag kommt
-- 3) angebot_positionen.rabatt_prozent absichern (wird seit Buendel 14
--    gelesen, hatte aber keine SQL-Datei im Repo)
-- Nur additiv, nichts wird geloescht. Zweimal ausfuehren schadet nicht.
-- angebote.auftrag_id ist auch bei angenommenen Angeboten setzbar
-- (Sperre p198 betrifft nur Kopfdaten und Summen).
-- Kein Aussperr-Risiko.
-- ============================================================================

alter table public.angebote
  add column if not exists auftrag_id uuid
  references public.auftraege(id) on delete set null;

alter table public.auftraege
  add column if not exists angebot_id uuid
  references public.angebote(id) on delete set null;

alter table public.angebot_positionen
  add column if not exists rabatt_prozent numeric(5,2) not null default 0;

create index if not exists angebote_auftrag_idx
  on public.angebote (auftrag_id) where auftrag_id is not null;

create index if not exists auftraege_angebot_idx
  on public.auftraege (angebot_id) where angebot_id is not null;

-- Kontrolle (nur lesen) — Erwartung: 3
select count(*) as spalten
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'angebote' and column_name = 'auftrag_id')
     or (table_name = 'auftraege' and column_name = 'angebot_id')
     or (table_name = 'angebot_positionen' and column_name = 'rabatt_prozent'));
