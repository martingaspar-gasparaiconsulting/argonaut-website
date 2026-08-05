-- ============================================================
-- ARGONAUT OS · I1d · Öffentliche Bestellungen (ISOLIERT)
-- Eigene Tabelle für die öffentliche Buchen-Strecke — bewusst GETRENNT von
-- der internen Abrechnung. Name oeffentliche_bestellungen, um eine bereits
-- vorhandene Tabelle „bestellungen" NICHT zu berühren.
-- Nur der Server (Service-Role über /api/bestellung) schreibt hier; RLS ist an,
-- es gibt KEINE öffentlichen Policies. IBAN nur maskiert (iban_masked).
-- Additiv · idempotent · nicht destruktiv.
-- ============================================================

create table if not exists public.oeffentliche_bestellungen (
  id               uuid primary key default gen_random_uuid(),
  stufe_key        text not null,
  sitze            jsonb not null default '{}'::jsonb,
  laufzeit_monate  integer not null default 12,
  firma            text not null,
  strasse          text,
  plz              text,
  ort              text,
  ust_id           text,
  ansprechpartner  text not null,
  email            text not null,
  telefon          text,
  kontoinhaber     text,
  iban_masked      text,
  bic              text,
  betrag_snapshot  jsonb,
  paragraf14_ok    boolean not null default false,
  agb_ok           boolean not null default false,
  avv_ok           boolean not null default false,
  status           text not null default 'neu',
  erstellt_am      timestamptz not null default now()
);

create index if not exists oeff_bestellungen_status_idx
  on public.oeffentliche_bestellungen (status, erstellt_am desc);

alter table public.oeffentliche_bestellungen enable row level security;
-- Bewusst KEINE Policies: nur der Service-Role-Key (API-Route) darf schreiben/lesen.
