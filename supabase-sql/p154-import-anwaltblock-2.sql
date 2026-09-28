-- ============================================================
-- ARGONAUT OS · Paket 154 (28.09.2026) · Anwalt-Block Teil 2 — Hilfsmittel & Kanzlei
--
-- Der Feldkatalog (import_feldkatalog) darf die Spalten von Hilfsmittel-
-- Versorgungen (mit Positionen), Kanzlei-Akten und Fristen nennen.
-- Er liest nur die Spaltenbeschreibung, KEINE Daten.
--
-- Die Importe selbst bleiben GESPERRT, bis der Anwalt freigibt
-- (Schalter lib/anwaltFreigabe.ts) — dieses SQL schaltet nichts scharf.
--
-- Nur die Funktion wird ersetzt. Keine Tabelle, keine Regel wird geaendert.
-- Mehrfach ausfuehrbar. Sperrt niemanden aus.
-- ============================================================

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
                                   'hilfsmittel_versorgung', 'hilfsmittel_position', 'kanzlei_akte', 'kanzlei_frist'])
   order by c.table_name, c.ordinal_position;
$$;

revoke all on function public.import_feldkatalog(text[]) from public;
revoke all on function public.import_feldkatalog(text[]) from anon;
grant execute on function public.import_feldkatalog(text[]) to authenticated;

-- ---------- Kontrolle (EINE Abfrage) ----------
-- Erwartet (live gezaehlt 28.09.2026): hilfsmittel_position 11, hilfsmittel_versorgung 14,
-- kanzlei_akte 14, kanzlei_frist 12.
select tabelle, count(*)::text as spalten
  from public.import_feldkatalog(array['hilfsmittel_versorgung', 'hilfsmittel_position', 'kanzlei_akte', 'kanzlei_frist'])
 group by tabelle
 order by tabelle;
