-- ============================================================
-- ARGONAUT OS · Paket 308 (10.10.2026) · FM4 Bewertungs-Empfehlung im Ankauf
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht, keine Regel geändert.
-- Sperrt niemanden aus (Rechte der Tabellen bleiben wie in Paket 263/276).
--  1) kfz_marktvergleich (Paket 276) gilt jetzt auch für einen ANKAUF:
--     + ankauf_id; bestand_id darf leer sein, wenn ein Ankauf dranhängt
--     (Prüfregel: mindestens eins von beiden). Beim Ankaufen hängt die
--     Akte die Vergleiche zusätzlich an das Bestandsfahrzeug.
--     Wird ein Ankauf gelöscht, verschwinden nur seine Vergleiche, die noch
--     an keinem Bestandsfahrzeug hängen; die anderen bleiben (Verweis leer).
--  2) kfz_ankauf: DAT/Schwacke-Werte wie am Bestand (Paket 283) — Abfrage im
--     EIGENEN Konto des Betriebs, ARGONAUT speichert nur den übernommenen Wert —
--     und „empfehlung" (Angaben der Besichtigung: Zustand, Nichtraucher).
-- Zu- und Abschläge stellt die Geschäftsleitung in modul_einstellung
-- „kfz-ankauf" ein (kein neues SQL nötig).
-- ============================================================

-- 1) Marktvergleich auch am Ankauf ----------------------------------------------
alter table public.kfz_marktvergleich add column if not exists ankauf_id uuid references public.kfz_ankauf(id) on delete set null;
alter table public.kfz_marktvergleich alter column bestand_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kfz_marktvergleich_bezug_chk') then
    alter table public.kfz_marktvergleich add constraint kfz_marktvergleich_bezug_chk
      check (bestand_id is not null or ankauf_id is not null);
  end if;
end $$;
create index if not exists kfz_marktvergleich_ankauf_idx on public.kfz_marktvergleich (owner_user_id, ankauf_id, erfasst_am);

-- Vor dem Löschen eines Ankaufs: nur die Vergleiche OHNE Bestandsfahrzeug mitnehmen
create or replace function public.p308_ankauf_vergleiche_weg()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  delete from public.kfz_marktvergleich
   where ankauf_id = old.id and bestand_id is null and owner_user_id = old.owner_user_id;
  return old;
end $$;

drop trigger if exists p308_ankauf_vergleiche_weg on public.kfz_ankauf;
create trigger p308_ankauf_vergleiche_weg before delete on public.kfz_ankauf
  for each row execute function public.p308_ankauf_vergleiche_weg();

-- 2) Bewertung und Besichtigung am Ankauf ------------------------------------------
alter table public.kfz_ankauf add column if not exists bewertung_anbieter text;
alter table public.kfz_ankauf add column if not exists bewertung_ek numeric(12,2);
alter table public.kfz_ankauf add column if not exists bewertung_vk numeric(12,2);
alter table public.kfz_ankauf add column if not exists bewertung_am date;
alter table public.kfz_ankauf add column if not exists bewertung_url text;
alter table public.kfz_ankauf add column if not exists empfehlung jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kfz_ankauf_bewertung_chk') then
    alter table public.kfz_ankauf add constraint kfz_ankauf_bewertung_chk check (
      (bewertung_anbieter is null or bewertung_anbieter in ('dat', 'schwacke', 'sonstige'))
      and (bewertung_ek is null or bewertung_ek >= 0)
      and (bewertung_vk is null or bewertung_vk >= 0)
      and (bewertung_url is null or (char_length(bewertung_url) <= 500 and bewertung_url ~ '^https://[^[:space:]"''<>]+$')));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kfz_ankauf_empfehlung_chk') then
    alter table public.kfz_ankauf add constraint kfz_ankauf_empfehlung_chk check (jsonb_typeof(empfehlung) = 'object');
  end if;
end $$;

comment on column public.kfz_ankauf.bewertung_vk is 'Paket 308: Händler-Verkaufswert laut DAT/Schwacke (im Konto des Betriebs abgefragt), geht beim Ankauf in den Bestand';
comment on column public.kfz_ankauf.empfehlung is 'Paket 308: Angaben der Besichtigung für die Empfehlung (zustand, nichtraucher)';

-- KONTROLLE — Erwartung: ankauf_spalte = 1 | bestand_pflicht = YES | pruefregeln = 3 | ausloeser = 1 | neue_spalten = 6
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'kfz_marktvergleich' and column_name = 'ankauf_id') as ankauf_spalte,
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'kfz_marktvergleich' and column_name = 'bestand_id') as bestand_pflicht,
  (select count(*) from pg_constraint where conname in ('kfz_marktvergleich_bezug_chk', 'kfz_ankauf_bewertung_chk', 'kfz_ankauf_empfehlung_chk')) as pruefregeln,
  (select count(*) from pg_trigger where tgname = 'p308_ankauf_vergleiche_weg' and not tgisinternal) as ausloeser,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'kfz_ankauf'
     and column_name in ('bewertung_anbieter', 'bewertung_ek', 'bewertung_vk', 'bewertung_am', 'bewertung_url', 'empfehlung')) as neue_spalten;
