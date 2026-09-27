-- ============================================================
-- ARGONAUT OS · Paket 128 (27.09.2026) · Import Schritt 3, Karten Teil 1
--
-- 15 Import-Karten, die bisher nur eine Vorlage zum Herunterladen hatten,
-- laufen jetzt durch den Import-Motor. Dafuer darf der Feldkatalog
-- (import_feldkatalog) die Spalten von 16 weiteren Tabellen nennen:
--   assets, asset_gruppen, pruef_protokoll, bde_maschine, charge_los,
--   expose, bildung_kurse, event_veranstaltung, reservierung_platz,
--   belegung_einheit, erinnerung, gutachten, schlag, tier_gruppe,
--   ertrag_anlage, proof_asset
-- Er liest nur die Spaltenbeschreibung, KEINE Daten. Gleiche Unterschrift,
-- gleiche Rechte wie in Paket 124-127.
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
                                   'ertrag_anlage', 'proof_asset'])
   order by c.table_name, c.ordinal_position;
$$;

revoke all on function public.import_feldkatalog(text[]) from public;
revoke all on function public.import_feldkatalog(text[]) from anon;
grant execute on function public.import_feldkatalog(text[]) to authenticated;

-- ---------- Kontrolle (EINE Abfrage) ----------
-- Erwartet: 35 Zeilen, jede mit einer Spaltenzahl groesser 0.
-- Steht irgendwo 0, gibt es diese Tabelle in Ihrer Datenbank nicht — dann
-- bleibt die Karte ausgegraut, sonst passiert nichts.
select t as tabelle, count(c.column_name)::text as spalten
  from unnest(array['kontakte','lieferanten','artikel','rechnungen','leistungskatalog',
                    'wartungsvertraege','verkaufschancen','kontakt_aktivitaeten','leads',
                    'mitarbeiter','auftraege','projekte','vertraege','anlagegueter',
                    'fahrzeuge','eingangsbelege','mitarbeiter_qualifikation','bestellungen',
                    'bestellpositionen','assets','asset_gruppen','pruef_protokoll','bde_maschine',
                    'charge_los','expose','bildung_kurse','event_veranstaltung','reservierung_platz',
                    'belegung_einheit','erinnerung','gutachten','schlag','tier_gruppe',
                    'ertrag_anlage','proof_asset']) as t
  left join information_schema.columns c on c.table_schema = 'public' and c.table_name = t
 group by t
 order by (count(c.column_name) = 0) desc, t;
