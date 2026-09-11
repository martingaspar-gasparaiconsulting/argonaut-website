-- ============================================================
-- ARGONAUT OS · Den ECHTEN Datenbank-Stand exportieren
--
-- WOZU
-- Am 11.09.2026 stellte sich heraus: supabase-sql/ ist nicht mehr die
-- vollstaendige Wahrheit. Das SQL von G1, G2 und G3 liegt nicht im Repo, und
-- die Tabelle `leads` fehlt in _ALLE-TABELLEN.sql ganz.
--
-- Entscheidung (Martin, 11.09.2026): SQL-Bloecke werden ab sofort IMMER im
-- Repo abgelegt. Fuer das, was bereits fehlt, ist Nachschreiben aus dem
-- Gedaechtnis der falsche Weg — eine Datei, die aus der Erinnerung entsteht,
-- BEHAUPTET nur etwas ueber die Datenbank. Diese Abfragen lesen den echten
-- Stand aus.
--
-- SO GEHT ES
-- Jeden Abschnitt EINZELN im Supabase-Editor markieren und ausfuehren; der
-- Editor zeigt bei mehreren Abfragen hintereinander nur das LETZTE Ergebnis.
-- Ergebnis als CSV herunterladen oder herauskopieren.
--
-- ALLES HIER LIEST NUR. Keine Abfrage aendert, legt an oder loescht etwas.
-- ============================================================


-- ============================================================
-- 1) ALLE TABELLEN MIT SPALTEN  — der Bauplan
-- ============================================================
select
  c.table_name                                  as tabelle,
  string_agg(
    c.column_name || ' ' || c.data_type
      || case when c.is_nullable = 'NO' then ' NOT NULL' else '' end,
    ' · ' order by c.ordinal_position
  )                                             as spalten
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema and t.table_name = c.table_name
where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
group by c.table_name
order by c.table_name;


-- ============================================================
-- 2) ALLE RECHTE-REGELN  — wer darf was sehen und aendern
-- Das Wichtigste im ganzen Export. Hier steht die Mandantentrennung.
-- ============================================================
select
  tablename                                     as tabelle,
  policyname                                    as regel,
  cmd                                           as fuer,
  coalesce(qual, '—')                           as lesebedingung,
  coalesce(with_check, '—')                     as schreibbedingung
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ============================================================
-- 3) TABELLEN OHNE RLS  — die gefaehrliche Liste
-- Jede Zeile hier ist eine Tabelle, auf die JEDER eingeloggte Nutzer
-- zugreifen kann. Sollte leer sein oder nur bewusst offene Tabellen zeigen.
-- ============================================================
select
  c.relname                                     as tabelle_ohne_rls,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as regeln_vorhanden
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
order by c.relname;


-- ============================================================
-- 4) TABELLEN MIT RLS, ABER OHNE JEDE REGEL  — die stille Sperre
-- RLS an, keine Policy: Dann kommt NIEMAND an die Daten ausser dem
-- Service-Role-Schluessel. Manchmal Absicht (siehe dossier_leads),
-- manchmal ein vergessener Block.
-- ============================================================
select c.relname as tabelle_rls_ohne_regel
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by c.relname;


-- ============================================================
-- 5) HELFER-FUNKTIONEN  — worauf die Regeln aufbauen
-- mein_chef_id() steckt in fast jeder Mitarbeiter-Regel. Aendert sich hier
-- etwas, aendert sich die Sichtbarkeit im ganzen System.
-- ============================================================
select
  p.proname                                     as funktion,
  pg_get_function_arguments(p.oid)              as parameter,
  pg_get_function_result(p.oid)                 as gibt_zurueck,
  case when p.prosecdef then 'SECURITY DEFINER' else 'normal' end as rechte
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;


-- ============================================================
-- 6) FREMDSCHLUESSEL  — was haengt woran
-- Wichtig fuer die DSGVO-Loeschung: Welche Tabelle wird mitgeloescht,
-- wenn ein Kontakt verschwindet (on delete cascade)?
-- ============================================================
select
  tc.table_name                                 as tabelle,
  kcu.column_name                               as spalte,
  ccu.table_name                                as zeigt_auf,
  rc.delete_rule                                as beim_loeschen
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
order by tc.table_name, kcu.column_name;


-- ============================================================
-- 7) SPEICHER-EIMER UND IHRE REGELN
-- ============================================================
select
  b.id                                          as eimer,
  b.public                                      as oeffentlich,
  b.file_size_limit                             as groessenlimit,
  (select count(*) from pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and (p.qual like '%' || b.id || '%' or coalesce(p.with_check,'') like '%' || b.id || '%')
  )                                             as regeln
from storage.buckets b
order by b.id;
