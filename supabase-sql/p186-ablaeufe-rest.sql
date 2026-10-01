-- ============================================================
-- ARGONAUT OS · Paket 186 (01.10.2026) · Abläufe-Rest
--
-- VOR dem Push ausführen (der neue Code schreibt diese Spalten).
-- Nur neue Spalten, ein Index und eine zusätzliche Schranke.
-- Nichts wird gelöscht. Mehrfach ausführbar.
--
--   ablaeufe.geloescht_am          Löschen = ausblenden; Läufe + Protokoll bleiben
--   ablauf_laeufe.laeuft_seit      seit wann „läuft" (hängende Läufe nach 2 Std.)
--   ablauf_laeufe.neuversuche      Neuversuche am selben Schritt (max. 3)
--   ablauf_laeufe.neuversuch_pfad  an welchem Schritt
--
-- Schranke: Abläufe lassen sich über die Oberfläche/Datenbank NICHT mehr
-- echt löschen — sonst würden Läufe und Protokoll mitgelöscht (cascade).
-- Der Server (Musterbetrieb löschen usw.) ist davon nicht betroffen.
-- ============================================================

alter table public.ablaeufe add column if not exists geloescht_am timestamptz;
alter table public.ablauf_laeufe add column if not exists laeuft_seit timestamptz;
alter table public.ablauf_laeufe add column if not exists neuversuche integer not null default 0;
alter table public.ablauf_laeufe add column if not exists neuversuch_pfad text;

create index if not exists ablauf_laeufe_laeuft_idx
  on public.ablauf_laeufe (gestartet_am) where status = 'laeuft';

drop policy if exists p186_kein_echtes_loeschen on public.ablaeufe;
create policy p186_kein_echtes_loeschen on public.ablaeufe
  as restrictive for delete to authenticated using (false);

-- KONTROLLE — Erwartung: neue_spalten = 4, schranke = 1.
-- haengen_jetzt = Läufe, die schon heute länger als 2 Std. auf „läuft" stehen
-- (der Motor beendet sie beim nächsten Durchgang und meldet sie per Glocke).
select
  (select count(*) from information_schema.columns
     where table_schema = 'public'
       and ((table_name = 'ablaeufe' and column_name = 'geloescht_am')
         or (table_name = 'ablauf_laeufe' and column_name in ('laeuft_seit','neuversuche','neuversuch_pfad')))) as neue_spalten,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ablaeufe' and policyname = 'p186_kein_echtes_loeschen') as schranke,
  (select count(*) from public.ablauf_laeufe where status = 'laeuft' and probe = false and gestartet_am < now() - interval '2 hours') as haengen_jetzt;
