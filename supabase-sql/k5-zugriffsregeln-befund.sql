-- ============================================================
-- ARGONAUT OS · K5 (26.09.2026) · Befund Zugriffsregeln (NUR LESEN)
-- Für viele Tabellen liegt keine SQL-Datei im Repo. Diese Abfrage
-- ändert nichts — sie listet je Tabelle: RLS an/aus, Zahl der Regeln
-- je Art, ob Mitarbeiter (mein_chef_id) vorkommen und ob eine Regel
-- alles für alle öffnet (using true). Ergebnis bitte als CSV exportieren
-- und ins Repo legen: docs/k5-befund.csv
-- ============================================================
select
  c.relname                                                         as tabelle,
  c.relrowsecurity                                                  as rls_an,
  count(p.polname)                                                  as regeln,
  count(*) filter (where p.polcmd = 'r')                            as lesen,
  count(*) filter (where p.polcmd = 'a')                            as anlegen,
  count(*) filter (where p.polcmd = 'w')                            as aendern,
  count(*) filter (where p.polcmd = 'd')                            as loeschen,
  count(*) filter (where p.polcmd = '*')                            as alles,
  bool_or(coalesce(pg_get_expr(p.polqual, p.polrelid), '') ilike '%mein_chef_id%'
       or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ilike '%mein_chef_id%') as mitarbeiter_regel,
  bool_or(coalesce(pg_get_expr(p.polqual, p.polrelid), '') = 'true'
       or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') = 'true') as offen_fuer_alle,
  exists (select 1 from information_schema.columns k
          where k.table_schema = 'public' and k.table_name = c.relname
            and k.column_name = 'owner_user_id')                    as hat_owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by (not c.relrowsecurity) desc, offen_fuer_alle desc nulls last, c.relname;
