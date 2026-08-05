-- ============================================================
-- ARGONAUT OS · I5 · Storage-Bucket für die Branchen-Dossiers
-- Öffentlich lesbar (die Dossiers sind Werbematerial). Der Server (Service-Role)
-- lädt die generierten PDFs hoch; gelesen werden sie per öffentlicher URL.
-- Idempotent.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('dossiers', 'dossiers', true)
on conflict (id) do nothing;
