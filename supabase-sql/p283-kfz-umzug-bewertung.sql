-- ============================================================
-- ARGONAUT OS · Paket 283 (09.10.2026) · K16 Umzug und Schnittstellen Kfz-Handel
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht, keine Regel geändert.
-- Sperrt niemanden aus.
--
--  1) Bewertung am Fahrzeug (DAT, Schwacke oder anderer Anbieter):
--     Händler-Einkaufswert und -Verkaufswert, Datum, Link. Abgefragt wird im
--     EIGENEN Konto des Händlers beim Anbieter — ARGONAUT vermittelt nur.
--     Nur neue, leere Spalten an kfz_bestand (Paket 259); es gelten dessen
--     Rechte (Chef alles, Mitarbeiter nach „kfz").
--  2) Der Feldkatalog des Import-Centers (import_feldkatalog) darf die
--     Spalten des Fahrzeugbestands nennen. Er liest nur die
--     Spaltenbeschreibung, KEINE Daten. Nur die Funktion wird ersetzt.
-- ============================================================

-- 1) Bewertung ------------------------------------------------------------------
alter table if exists public.kfz_bestand add column if not exists bewertung_anbieter text
  check (bewertung_anbieter is null or bewertung_anbieter in ('dat', 'schwacke', 'sonstige'));
alter table if exists public.kfz_bestand add column if not exists bewertung_ek numeric(12,2)
  check (bewertung_ek is null or bewertung_ek >= 0);
alter table if exists public.kfz_bestand add column if not exists bewertung_vk numeric(12,2)
  check (bewertung_vk is null or bewertung_vk >= 0);
alter table if exists public.kfz_bestand add column if not exists bewertung_am date;
alter table if exists public.kfz_bestand add column if not exists bewertung_url text
  check (bewertung_url is null or (bewertung_url ~ '^https://[^[:space:]"''<>]+$' and char_length(bewertung_url) <= 500));

comment on column public.kfz_bestand.bewertung_ek is 'Paket 283: Händler-Einkaufswert laut DAT/Schwacke (im Konto des Betriebs abgefragt)';
comment on column public.kfz_bestand.bewertung_vk is 'Paket 283: Händler-Verkaufswert laut DAT/Schwacke (im Konto des Betriebs abgefragt)';

-- 2) Feldkatalog des Import-Centers ---------------------------------------------
create or replace function public.import_feldkatalog(p_tabellen text[])
returns table (tabelle text, spalte text, datentyp text, pflicht boolean, generiert boolean)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select c.table_name::text,
         c.column_name::text,
         c.data_type::text,
         (c.is_nullable = 'NO' and c.column_default is null and c.is_identity = 'NO' and c.is_generated = 'NEVER'),
         (c.is_generated <> 'NEVER' or c.is_identity = 'YES')
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = any (p_tabellen)
     and c.table_name = any (array['kontakte', 'lieferanten', 'artikel', 'rechnungen',
                                   'leistungskatalog', 'wartungsvertraege', 'verkaufschancen',
                                   'kontakt_aktivitaeten', 'leads',
                                   'mitarbeiter', 'auftraege', 'projekte', 'vertraege',
                                   'anlagegueter', 'fahrzeuge', 'eingangsbelege',
                                   'mitarbeiter_qualifikation', 'bestellungen', 'bestellpositionen',
                                   'assets', 'asset_gruppen', 'pruef_protokoll', 'bde_maschine', 'charge_los',
                                   'expose', 'bildung_kurse', 'event_veranstaltung', 'reservierung_platz',
                                   'belegung_einheit', 'erinnerung', 'gutachten', 'schlag', 'tier_gruppe',
                                   'ertrag_anlage', 'proof_asset',
                                   'rezeptur_zutaten', 'rezepturen', 'zuschnitt_teil', 'zuschnitt_projekt',
                                   'tour_stopp', 'tour', 'bk_einheit', 'bk_abrechnung', 'reservierung_vorgang',
                                   'einsaetze', 'tickets', 'inventar', 'verleih_artikel',
                                   'lm_haccp_plan', 'lm_haccp', 'kassen_system', 'agentur_retainer',
                                   'schlag_duengung', 'forst_objekte', 'forst_baeume',
                                   'schlag_psm', 'immo_einheiten', 'immo_mietvertraege', 'expose_interessent',
                                   'bildung_anmeldungen', 'verein_ehrenamt', 'agentur_nutzungsrecht',
                                   'gutschein', 'foerder_vorhaben', 'mitglieder', 'spende', 'angebote',
                                   'angebot_positionen', 'projektleistungen', 'immo_kaution', 'immo_zahlungen',
                                   'shop_bestellungen',
                                   'termine',
                                   'wellness_kunden', 'wellness_behandlungen', 'tier_tiere', 'tier_behandlungen',
                                   'hilfsmittel_versorgung', 'hilfsmittel_position', 'kanzlei_akte', 'kanzlei_frist',
                                   'kfz_bestand'])
   order by c.table_name, c.ordinal_position;
$$;

revoke all on function public.import_feldkatalog(text[]) from public;
revoke all on function public.import_feldkatalog(text[]) from anon;
grant execute on function public.import_feldkatalog(text[]) to authenticated;

-- KONTROLLE — Erwartung: neue_spalten = 5, katalog_kfz mindestens 40, anon_darf = false
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'kfz_bestand'
       and column_name in ('bewertung_anbieter', 'bewertung_ek', 'bewertung_vk', 'bewertung_am', 'bewertung_url')) as neue_spalten,
  (select count(*) from public.import_feldkatalog(array['kfz_bestand'])) as katalog_kfz,
  has_function_privilege('anon', 'public.import_feldkatalog(text[])', 'execute') as anon_darf;
