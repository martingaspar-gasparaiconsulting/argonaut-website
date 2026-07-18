-- ============================================================
-- ARGONAUT OS · Bündel 6 · Online-Terminbuchung
-- Öffentlicher Buchungs-Link je Betrieb + Freischalt-Schalter.
-- Liegt am Profil (profiles.id = owner_user_id). Nicht-brechend · idempotent.
-- Die öffentliche Route liest/schreibt über die Service-Role und filtert
-- strikt nach diesem Betrieb — es sind KEINE zusätzlichen RLS-Policies nötig.
-- ============================================================

alter table public.profiles add column if not exists buchung_slug text;
alter table public.profiles add column if not exists buchung_aktiv boolean not null default false;

-- Ein Slug darf nur einmal vergeben sein (nur für gesetzte Werte).
create unique index if not exists profiles_buchung_slug_uidx
  on public.profiles (buchung_slug) where buchung_slug is not null;
