-- ============================================================
-- ARGONAUT OS · Bündel 8 · Mitglieds-/Abo-Verwaltung mit SEPA
-- 1) Gläubiger-/Konto-Daten des Betriebs am Profil (für die SEPA-Datei).
-- 2) mitglieder: Beiträge/Abos mit Mandat & IBAN.
-- Nicht-brechend · idempotent · RLS wie die übrigen Module.
-- HINWEIS: IBAN/Mandat sind sensible Daten — Zugriff nur Chef + (lesend) seine
-- Mitarbeiter über mein_chef_id().
-- ============================================================

-- 1) SEPA-Gläubigerdaten (einmal je Betrieb)
alter table public.profiles add column if not exists sepa_glaeubiger_id text;
alter table public.profiles add column if not exists sepa_kontoinhaber text;
alter table public.profiles add column if not exists sepa_iban text;
alter table public.profiles add column if not exists sepa_bic text;

-- 2) Mitglieder / Abos
create table if not exists public.mitglieder (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  name           text not null,
  email          text,
  telefon        text,
  betrag         numeric,                       -- Euro je Intervall
  intervall      text not null default 'monat', -- monat | quartal | jahr
  status         text not null default 'aktiv', -- aktiv | pausiert | gekuendigt
  beginn_am      date,
  kuendigung_zum date,
  iban           text,
  bic            text,
  mandatsreferenz text,
  mandat_datum   date,
  letzte_einziehung date,
  notiz          text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists mitglieder_owner_idx on public.mitglieder (owner_user_id, status);

alter table public.mitglieder enable row level security;

drop policy if exists mgd_select on public.mitglieder;
create policy mgd_select on public.mitglieder for select to public using ((auth.uid() = owner_user_id));
drop policy if exists mgd_select_ma on public.mitglieder;
create policy mgd_select_ma on public.mitglieder for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists mgd_insert on public.mitglieder;
create policy mgd_insert on public.mitglieder for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists mgd_update on public.mitglieder;
create policy mgd_update on public.mitglieder for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists mgd_delete on public.mitglieder;
create policy mgd_delete on public.mitglieder for delete to public using ((auth.uid() = owner_user_id));
