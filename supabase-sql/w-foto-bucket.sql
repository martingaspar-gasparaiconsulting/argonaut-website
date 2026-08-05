-- ============================================================
-- ARGONAUT OS · Website-Bauer · Storage-Bucket für eigene Kundenfotos
-- Öffentlich lesbar (die Bilder erscheinen auf der veröffentlichten Seite).
-- Hochgeladen wird ausschließlich serverseitig über die geschützte Route
-- /api/webseite-foto (nur eingeloggt, Service-Role, Datei landet unter
-- <owner_user_id>/<uuid>.<endung>). 8 MB-Limit, nur Bildformate. Idempotent.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'webseiten',
  'webseiten',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;
