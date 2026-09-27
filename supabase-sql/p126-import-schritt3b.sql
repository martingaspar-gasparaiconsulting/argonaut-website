-- ============================================================
-- ARGONAUT OS · Paket 126 (27.09.2026) · Import Schritt 3, Teil 2
--
-- Der Feldkatalog des Import-Motors (import_feldkatalog aus Paket 124/125)
-- darf jetzt auch die Spalten von sieben weiteren Tabellen nennen:
--   mitarbeiter, auftraege, projekte, vertraege, anlagegueter,
--   fahrzeuge, eingangsbelege.
-- Er liest nur die Spaltenbeschreibung, KEINE Daten. Welche Mitarbeiter-
-- Spalten der Motor anbietet, entscheidet der Code (Lohn, SV-/Steuernummer,
-- Bank und Zugaenge sind dort gesperrt). Anlegen von Mitarbeitern erlauben
-- die bestehenden Regeln ohnehin nur dem Chef.
-- Damit kann das Import-Center diese Daten uebernehmen — und bietet
-- dabei nur Felder an, die es in DIESER Datenbank wirklich gibt.
--
-- Nur die Funktion wird ersetzt (gleiche Unterschrift, gleiche Rechte,
-- liest nur die Tabellenbeschreibung, keine Daten). Keine Tabelle, keine
-- Regel wird geaendert. Mehrfach ausfuehrbar. Sperrt niemanden aus.
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
                                   'anlagegueter', 'fahrzeuge', 'eingangsbelege'])
   order by c.table_name, c.ordinal_position;
$$;

revoke all on function public.import_feldkatalog(text[]) from public;
revoke all on function public.import_feldkatalog(text[]) from anon;
grant execute on function public.import_feldkatalog(text[]) to authenticated;

-- ---------- Kontrolle (EINE Abfrage) ----------
-- Erwartet: 16 Zeilen, je Tabelle eine Zahl groesser 0 (Anzahl Spalten).
select t as tabelle, count(c.column_name)::text as spalten
  from unnest(array['kontakte','lieferanten','artikel','rechnungen','leistungskatalog',
                    'wartungsvertraege','verkaufschancen','kontakt_aktivitaeten','leads',
                    'mitarbeiter','auftraege','projekte','vertraege','anlagegueter',
                    'fahrzeuge','eingangsbelege']) as t
  left join information_schema.columns c on c.table_schema = 'public' and c.table_name = t
 group by t
 order by t;
