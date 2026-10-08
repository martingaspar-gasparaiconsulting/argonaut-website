-- ============================================================
-- ARGONAUT OS · Paket 274 (08.10.2026) · Fahrzeughistorie am Fahrzeug
--
-- Additiv und mehrfach ausführbar. Nur neue, leere Spalten an kfz_bestand
-- (Paket 259). Bestehende Fahrzeuge bleiben unverändert. Keine neue Regel:
-- es gelten die Rechte aus Paket 259 (Chef alles, Mitarbeiter nach „kfz").
--  historie_url          Link zum Bericht (nur https, höchstens 500 Zeichen)
--  historie_anbieter     carvertical | sonstige
--  historie_am           Datum des Berichts
--  historie_oeffentlich  in der Fahrzeugbörse zeigen (Standard: nein)
-- ============================================================

alter table if exists public.kfz_bestand add column if not exists historie_url text
  check (historie_url is null or (historie_url ~ '^https://[^[:space:]"''<>]+$' and char_length(historie_url) <= 500));
alter table if exists public.kfz_bestand add column if not exists historie_anbieter text
  check (historie_anbieter is null or historie_anbieter in ('carvertical', 'sonstige'));
alter table if exists public.kfz_bestand add column if not exists historie_am date;
alter table if exists public.kfz_bestand add column if not exists historie_oeffentlich boolean not null default false;

comment on column public.kfz_bestand.historie_url is 'Paket 274: Link zum Historienbericht (z. B. carVertical), gekauft im Konto des Betriebs';
comment on column public.kfz_bestand.historie_oeffentlich is 'Paket 274: true = Fahrzeugbörse zeigt „Fahrzeughistorie geprüft" mit Link';

-- KONTROLLE — Erwartung: neue_spalten = 4
select count(*) as neue_spalten
from information_schema.columns
where table_schema = 'public' and table_name = 'kfz_bestand'
  and column_name in ('historie_url', 'historie_anbieter', 'historie_am', 'historie_oeffentlich');
