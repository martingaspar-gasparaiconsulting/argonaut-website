-- ============================================================
-- ARGONAUT OS · Paket 332 (12.10.2026) · BV2b Teil 1 · Handel mit Einzelstücken
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut,
-- keine Regel (RLS) wird angefasst — niemand wird ausgesperrt.
--
-- kfz_bestand bekommt vier Spalten, damit derselbe Bestand (mit Akte, Ankauf,
-- Kalkulation, § 25a, Börse, Anfragen, Preisen) auch Boote, Maschinen, Uhren
-- und Schmuck, Kunst und Antiquitäten, Fahrräder und Second Hand trägt:
--   art             Sorte Einzelstück (alter Bestand: 'kfz')
--   merkmale        Merkmale der Art als JSON-Objekt (Länge, Tiefgang, Gangwerk …)
--   betriebsstunden Zähler für Maschinen und Boote
--   seriennr        Kennung, wo es keine 17-stellige FIN gibt (die FIN-Prüfung bleibt)
-- ============================================================

alter table public.kfz_bestand add column if not exists art text not null default 'kfz';
alter table public.kfz_bestand add column if not exists merkmale jsonb not null default '{}'::jsonb;
alter table public.kfz_bestand add column if not exists betriebsstunden integer;
alter table public.kfz_bestand add column if not exists seriennr text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p332_art_check' and conrelid = 'public.kfz_bestand'::regclass) then
    alter table public.kfz_bestand add constraint p332_art_check
      check (art in ('kfz', 'boot', 'maschine', 'uhr_schmuck', 'kunst_antik', 'fahrrad', 'sonstig'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p332_merkmale_check' and conrelid = 'public.kfz_bestand'::regclass) then
    alter table public.kfz_bestand add constraint p332_merkmale_check
      check (jsonb_typeof(merkmale) = 'object' and pg_column_size(merkmale) <= 8000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p332_bh_check' and conrelid = 'public.kfz_bestand'::regclass) then
    alter table public.kfz_bestand add constraint p332_bh_check
      check (betriebsstunden is null or (betriebsstunden >= 0 and betriebsstunden <= 200000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p332_seriennr_check' and conrelid = 'public.kfz_bestand'::regclass) then
    alter table public.kfz_bestand add constraint p332_seriennr_check
      check (seriennr is null or char_length(seriennr) between 1 and 60);
  end if;
end $$;

create index if not exists kfz_bestand_art_idx on public.kfz_bestand (owner_user_id, art, status);
create index if not exists kfz_bestand_seriennr_idx on public.kfz_bestand (owner_user_id, seriennr) where seriennr is not null;

-- KONTROLLE — Erwartung: spalten = 4 | pruefungen = 4 | nicht_kfz = 0
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'kfz_bestand'
     and column_name in ('art', 'merkmale', 'betriebsstunden', 'seriennr')) as spalten,
  (select count(*) from pg_constraint where conrelid = 'public.kfz_bestand'::regclass
     and conname in ('p332_art_check', 'p332_merkmale_check', 'p332_bh_check', 'p332_seriennr_check')) as pruefungen,
  (select count(*) from public.kfz_bestand where art <> 'kfz') as nicht_kfz;
