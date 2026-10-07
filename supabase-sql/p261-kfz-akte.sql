-- ============================================================
-- ARGONAUT OS · Paket 261 (07.10.2026) · K2 Handelsakte
--
-- Additiv und mehrfach ausführbar. Nur neue, leere Spalten an kfz_bestand
-- (Paket 259). Bestehende Fahrzeuge bleiben unverändert. Keine neue Regel:
-- es gelten die Rechte aus Paket 259 (Chef alles, Mitarbeiter nach „kfz").
-- ============================================================

alter table if exists public.kfz_bestand add column if not exists ausstattung       text[] not null default '{}';
alter table if exists public.kfz_bestand add column if not exists polster           text;
alter table if exists public.kfz_bestand add column if not exists vorbesitzer       integer check (vorbesitzer is null or vorbesitzer between 0 and 99);
alter table if exists public.kfz_bestand add column if not exists hu_bis            date;
alter table if exists public.kfz_bestand add column if not exists vorschaden        text check (vorschaden is null or vorschaden in ('keine_bekannt', 'ja', 'unbekannt'));
alter table if exists public.kfz_bestand add column if not exists vorschaden_text   text;
alter table if exists public.kfz_bestand add column if not exists inserat_titel     text check (inserat_titel is null or char_length(inserat_titel) <= 120);
alter table if exists public.kfz_bestand add column if not exists inserat_text      text;
alter table if exists public.kfz_bestand add column if not exists verbrauch_komb    numeric(6,2) check (verbrauch_komb is null or verbrauch_komb >= 0);
alter table if exists public.kfz_bestand add column if not exists verbrauch_einheit text check (verbrauch_einheit is null or verbrauch_einheit in ('l', 'kwh', 'kg'));
alter table if exists public.kfz_bestand add column if not exists co2_g_km          integer check (co2_g_km is null or co2_g_km >= 0);
alter table if exists public.kfz_bestand add column if not exists co2_klasse        text check (co2_klasse is null or co2_klasse in ('A', 'B', 'C', 'D', 'E', 'F', 'G'));

comment on column public.kfz_bestand.vorschaden is 'Paket 261: keine_bekannt | ja | unbekannt — „unfallfrei" im Inserat nur bei keine_bekannt';
comment on column public.kfz_bestand.co2_klasse is 'Paket 261: CO₂-Klasse A–G, vom Betrieb bestätigt (ARGONAUT schlägt nur vor)';

-- KONTROLLE — Erwartung: neue_spalten = 12
select count(*) as neue_spalten
from information_schema.columns
where table_schema = 'public' and table_name = 'kfz_bestand'
  and column_name in ('ausstattung', 'polster', 'vorbesitzer', 'hu_bis', 'vorschaden', 'vorschaden_text',
                      'inserat_titel', 'inserat_text', 'verbrauch_komb', 'verbrauch_einheit', 'co2_g_km', 'co2_klasse');
