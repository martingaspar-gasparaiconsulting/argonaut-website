-- ============================================================
-- ARGONAUT OS · Thema 7 · Struktur-Abfrage (NUR LESEN, aendert nichts)
--
-- Beantwortet die Frage, die vor einer kaskadierenden Loeschung stehen MUSS:
-- Welche Tabellen haengen tatsaechlich an einem Kontakt — und was passiert
-- dort beim Loeschen? Die Antwort steht nicht vollstaendig im Repo, weil
-- mehrere Tabellen direkt in Supabase angelegt wurden.
-- ============================================================

-- A) Echte Fremdschluessel auf kontakte(id) — mit Loeschverhalten
select
  quote_ident(ns.nspname) || '.' || quote_ident(cl.relname) as tabelle,
  att.attname                                               as spalte,
  case con.confdeltype
    when 'a' then 'FEHLER beim Loeschen (no action)'
    when 'r' then 'FEHLER beim Loeschen (restrict)'
    when 'c' then 'wird mitgeloescht (cascade)'
    when 'n' then 'wird auf leer gesetzt (set null)'
    when 'd' then 'wird auf Standard gesetzt (set default)'
  end                                                       as beim_loeschen
from pg_constraint con
join pg_class cl        on cl.oid = con.conrelid
join pg_namespace ns    on ns.oid = cl.relnamespace
join pg_class ziel      on ziel.oid = con.confrelid
join unnest(con.conkey) with ordinality as k(attnum, ord) on true
join pg_attribute att   on att.attrelid = cl.oid and att.attnum = k.attnum
where con.contype = 'f'
  and ziel.relname = 'kontakte'
order by 1;

-- B) Spalten namens kontakt_id OHNE Fremdschluessel — hier entstehen Waisen
select
  quote_ident(c.table_schema) || '.' || quote_ident(c.table_name) as tabelle,
  c.column_name                                                   as spalte,
  'KEIN Fremdschluessel — bleibt als Waise stehen'                 as hinweis
from information_schema.columns c
where c.table_schema = 'public'
  and c.column_name = 'kontakt_id'
  and not exists (
    select 1
    from pg_constraint con
    join pg_class cl     on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join unnest(con.conkey) as k(attnum) on true
    join pg_attribute att on att.attrelid = cl.oid and att.attnum = k.attnum
    where con.contype = 'f'
      and ns.nspname = c.table_schema
      and cl.relname = c.table_name
      and att.attname = c.column_name
  )
order by 1;
