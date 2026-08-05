-- ============================================================
-- ARGONAUT OS · W7 · Webseite veröffentlichen
-- Gibt jeder Seite eine öffentliche Kennung (oeffentlich_id) für die Live-URL
-- /p/<oeffentlich_id>. Die öffentliche Auslieferung läuft serverseitig über den
-- Service-Role-Admin (umgeht RLS) und zeigt NUR Seiten mit status = 'live'.
-- Additiv · idempotent · NICHT destruktiv. Keine RLS-Änderung nötig.
-- ============================================================

alter table public.web_seiten
  add column if not exists oeffentlich_id text;

-- Eindeutig, aber mehrere NULL erlaubt (nur veröffentlichte Seiten haben eine ID).
create unique index if not exists web_seiten_oeffentlich_id_idx
  on public.web_seiten (oeffentlich_id)
  where oeffentlich_id is not null;
