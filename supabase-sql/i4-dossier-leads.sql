-- ============================================================
-- ARGONAUT OS · I4 · Dossier-/Lead-Funnel (Double-Opt-In)
-- ARGONAUTs EIGENE Lead-Erfassung (getrennt von den Kunden-Newslettern).
-- Interessent fordert ein Dossier an -> bestätigt per Klick (DSGVO/BGH) ->
-- wird 'aktiv'. Nur der Server (Service-Role) schreibt; RLS an, keine
-- öffentlichen Policies. Additiv · idempotent.
-- ============================================================

create table if not exists public.dossier_leads (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  name           text,
  branche        text,
  status         text not null default 'unbestaetigt',   -- unbestaetigt | aktiv
  token          uuid not null default gen_random_uuid(),
  quelle         text default 'dossier',
  erstellt_am    timestamptz not null default now(),
  bestaetigt_am  timestamptz,
  unique (email)
);

create index if not exists dossier_leads_token_idx on public.dossier_leads (token);
create index if not exists dossier_leads_status_idx on public.dossier_leads (status, erstellt_am desc);

alter table public.dossier_leads enable row level security;
-- Bewusst KEINE Policies: nur der Service-Role-Key (API-Routen) schreibt/liest.
