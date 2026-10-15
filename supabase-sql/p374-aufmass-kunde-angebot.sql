-- ============================================================================
-- ARGONAUT OS · SQL p374 · HW-11 Angebot aus Aufmass + Kunde am Aufmass
-- (15.10.2026)
--
-- aufmasse.kontakt_id  -> Kunde als Kontakt (statt nur Freitext-Name)
-- aufmasse.angebot_id  -> welches Angebot aus dem Aufmass entstand
-- Nur additiv, nichts wird geloescht. Zweimal ausfuehren schadet nicht.
-- Kein Aussperr-Risiko.
-- ============================================================================

alter table public.aufmasse
  add column if not exists kontakt_id uuid
  references public.kontakte(id) on delete set null;

alter table public.aufmasse
  add column if not exists angebot_id uuid
  references public.angebote(id) on delete set null;

create index if not exists aufmasse_kontakt_idx
  on public.aufmasse (kontakt_id) where kontakt_id is not null;

-- Kontrolle (nur lesen) — Erwartung: 2
select count(*) as spalten
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'aufmasse'
   and column_name in ('kontakt_id', 'angebot_id');
