-- ============================================================
-- ARGONAUT OS · Mandantentrennung pruefen (Punkt 2.6)
-- Stand: 12.09.2026
--
-- WOZU
-- Abschnitt 3 und 4 aus _LESEN-stand-exportieren.sql, zu EINER Abfrage
-- zusammengezogen. Grund: Der Supabase-Editor zeigt bei mehreren Abfragen
-- hintereinander nur das Ergebnis der letzten.
--
-- Zwei Spalten sind neu:
--   zeilen_ca        grobe Schaetzung aus der Statistik (-1 = nie gezaehlt,
--                    meist eine leere oder frisch angelegte Tabelle)
--   mandantenspalte  gibt es ueberhaupt eine Spalte, an der eine Regel
--                    festmachen koennte, wem die Zeile gehoert?
--                    "— keine" heisst: die Tabelle ist entweder bewusst
--                    fuer alle (Branchen, Preise, Normen) oder sie hat ein
--                    Problem.
--
-- DIESE ABFRAGE LIEST NUR. Sie aendert, legt an und loescht nichts.
-- ============================================================

select
  'A · OHNE RLS (jeder Eingeloggte kommt ran)'          as befund,
  c.relname                                             as tabelle,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname)
                                                        as regeln,
  case when c.reltuples < 0 then -1
       else c.reltuples::bigint end                     as zeilen_ca,
  coalesce((
    select string_agg(a.attname, ', ' order by a.attname)
    from pg_attribute a
    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      and a.attname in (
        'user_id','chef_id','betrieb_id','tenant_id','owner_id',
        'mandant_id','firma_id','standort_id','profile_id',
        'created_by','angelegt_von','benutzer_id'
      )
  ), '— keine')                                         as mandantenspalte
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false

union all

select
  'B · RLS AN, ABER KEINE REGEL (niemand kommt ran)'    as befund,
  c.relname                                             as tabelle,
  0                                                     as regeln,
  case when c.reltuples < 0 then -1
       else c.reltuples::bigint end                     as zeilen_ca,
  coalesce((
    select string_agg(a.attname, ', ' order by a.attname)
    from pg_attribute a
    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      and a.attname in (
        'user_id','chef_id','betrieb_id','tenant_id','owner_id',
        'mandant_id','firma_id','standort_id','profile_id',
        'created_by','angelegt_von','benutzer_id'
      )
  ), '— keine')                                         as mandantenspalte
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )

order by 1, 2;
