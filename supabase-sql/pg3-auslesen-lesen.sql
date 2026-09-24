-- ============================================================
-- ARGONAUT OS · Paket PG3 · Dokumente selbst auslesen — Stand 24.09.2026
-- KEINE Aenderung. Nur LESEN: passt die neue Auslese-Route zur Datenbank?
--   · erlaubte Werte fuer documents.status (Pruefregel)?
--   · welche Spalten von document_chunks sind Pflicht?
--   · Groesse der Suchvektoren
-- ============================================================
select '1 pruefregel documents' as art, c.conname::text as name, pg_get_constraintdef(c.oid) as inhalt
from pg_constraint c where c.conrelid = 'public.documents'::regclass and c.contype = 'c'
union all
select '2 spalte document_chunks', a.attname::text,
       format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' | Pflicht' else '' end
       || coalesce(' | Standard: ' || pg_get_expr(d.adbin, d.adrelid), '')
from pg_attribute a
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid = 'public.document_chunks'::regclass and a.attnum > 0 and not a.attisdropped
order by 1, 2;
