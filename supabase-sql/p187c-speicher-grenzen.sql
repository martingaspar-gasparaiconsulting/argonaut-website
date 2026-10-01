-- ============================================================
-- ARGONAUT OS · Paket 187c (01.10.2026) · Größen- und Typgrenzen je Speicherordner
--
-- Unabhängig vom Push, jederzeit ausführbar. Mehrfach ausführbar.
-- Ändert NUR die Grenzen von 16 Ordnern — keine Datei wird gelöscht oder
-- verändert; vorhandene größere Dateien bleiben (Grenzen gelten für neue Uploads).
-- Jede Grenze liegt auf oder über der Grenze, die die Seiten selbst prüfen.
-- Typlisten nur dort, wo der Server den Typ fest setzt (Dossiers, E-Books,
-- Belege, Landingpage-Bilder). Quelle der Werte: lib/speicherGrenzen.ts.
-- Nicht angefasst: ablauf-dateien, academy-videos, branchen-pdfs,
-- social-videos, webseiten (haben schon Grenzen).
-- ============================================================

update storage.buckets set file_size_limit = 26214400, allowed_mime_types = null where id = 'bau-plaene';  -- 25 MB
update storage.buckets set file_size_limit = 26214400, allowed_mime_types = null where id = 'baustellen-fotos';  -- 25 MB
update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] where id = 'belege';  -- 10 MB
update storage.buckets set file_size_limit = 209715200, allowed_mime_types = null where id = 'customer-documents';  -- 200 MB
update storage.buckets set file_size_limit = 26214400, allowed_mime_types = array['application/pdf'] where id = 'dossiers';  -- 25 MB
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = array['application/pdf'] where id = 'ebooks';  -- 50 MB
update storage.buckets set file_size_limit = 26214400, allowed_mime_types = null where id = 'einsatz-fotos';  -- 25 MB
update storage.buckets set file_size_limit = 26214400, allowed_mime_types = null where id = 'erechnungen';  -- 25 MB
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = null where id = 'erstellte-dokumente';  -- 50 MB
update storage.buckets set file_size_limit = 15728640, allowed_mime_types = null where id = 'formulare';  -- 15 MB
update storage.buckets set file_size_limit = 26214400, allowed_mime_types = null where id = 'freebies';  -- 25 MB
update storage.buckets set file_size_limit = 26214400, allowed_mime_types = null where id = 'hr-dokumente';  -- 25 MB
update storage.buckets set file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'] where id = 'lp-medien';  -- 8 MB
update storage.buckets set file_size_limit = 20971520, allowed_mime_types = null where id = 'portal-dokumente';  -- 20 MB
update storage.buckets set file_size_limit = 26214400, allowed_mime_types = null where id = 'teamchat-dateien';  -- 25 MB
update storage.buckets set file_size_limit = 10485760, allowed_mime_types = null where id = 'werkstatt-anhaenge';  -- 10 MB

-- KONTROLLE — Erwartung: ohne_groesse = 0, mit_html_oder_svg = 0, geaendert = 16.
select
  (select count(*) from storage.buckets where file_size_limit is null) as ohne_groesse,
  (select count(*) from storage.buckets
     where allowed_mime_types && array['text/html','image/svg+xml']) as mit_html_oder_svg,
  (select count(*) from storage.buckets where id in ('bau-plaene', 'baustellen-fotos', 'belege', 'customer-documents', 'dossiers', 'ebooks', 'einsatz-fotos', 'erechnungen', 'erstellte-dokumente', 'formulare', 'freebies', 'hr-dokumente', 'lp-medien', 'portal-dokumente', 'teamchat-dateien', 'werkstatt-anhaenge') and file_size_limit is not null) as geaendert;
