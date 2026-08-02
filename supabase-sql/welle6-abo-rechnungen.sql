-- ============================================================
-- ARGONAUT OS · Betreiber-Rechnungen (ARGONAUT OS -> Kunde) aus Abo/Upgrade
-- Wird von /api/kunde-abo automatisch befüllt (Service-Role).
-- Fortlaufende, eindeutige Rechnungsnummer (§14 UStG). Idempotent.
-- ============================================================

create sequence if not exists seq_abo_rechnung_nr;

create table if not exists kunden_abo_rechnungen (
  id uuid primary key default gen_random_uuid(),
  tenant_user_id uuid not null,
  abo_id uuid,
  rechnungsnummer text not null unique
    default ('ARGO-' || to_char(now(),'YYYY') || '-' || lpad(nextval('seq_abo_rechnung_nr')::text, 5, '0')),
  art text not null default 'neu',                  -- 'neu' | 'upgrade'
  rechnungsdatum date not null default current_date,
  zeitraum text,
  positionen jsonb not null default '[]'::jsonb,     -- [{label, betrag}]
  netto numeric(12,2) not null default 0,
  mwst numeric(12,2) not null default 0,
  brutto numeric(12,2) not null default 0,
  onboarding_netto numeric(12,2) not null default 0,
  empfaenger_email text,
  pdf_versandt boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_abo_rechnung_tenant
  on kunden_abo_rechnungen (tenant_user_id, created_at desc);

alter table kunden_abo_rechnungen enable row level security;

-- Kunde sieht nur seine eigenen Rechnungen; der Betreiber-Zugriff läuft über
-- die Service-Role (umgeht RLS) in der Route.
drop policy if exists select_eigene on kunden_abo_rechnungen;
create policy select_eigene on kunden_abo_rechnungen
  for select using (auth.uid() = tenant_user_id);
