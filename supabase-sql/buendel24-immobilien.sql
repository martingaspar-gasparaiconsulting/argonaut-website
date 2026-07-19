-- ============================================================
-- ARGONAUT OS · Bündel 24 · Immobilienverwaltung
-- Einheiten (Wohnungen/Gewerbe), Mietverträge und Mieteingänge.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.immo_einheiten (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  objekt        text,                                  -- Gebäude/Adresse
  bezeichnung   text not null default 'Einheit',       -- Wohnung 1. OG links ...
  flaeche_qm    numeric(10,2),
  zimmer        numeric(4,1),
  kaltmiete     numeric(12,2) not null default 0,
  nebenkosten   numeric(12,2) not null default 0,
  status        text not null default 'frei',          -- frei | vermietet
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists immo_einheiten_idx on public.immo_einheiten (owner_user_id, status);

create table if not exists public.immo_mietvertraege (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  einheit_id    uuid references public.immo_einheiten(id) on delete set null,
  mieter_name   text,
  mieter_email  text,
  beginn        date,
  ende          date,
  kaltmiete     numeric(12,2) not null default 0,
  nebenkosten   numeric(12,2) not null default 0,
  kaution       numeric(12,2) not null default 0,
  status        text not null default 'aktiv',          -- aktiv | beendet
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists immo_vertraege_idx on public.immo_mietvertraege (owner_user_id, status);

create table if not exists public.immo_zahlungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  vertrag_id    uuid not null references public.immo_mietvertraege(id) on delete cascade,
  monat         date not null default current_date,     -- Monat der Miete (1. des Monats)
  betrag        numeric(12,2) not null default 0,
  bezahlt_am    date not null default current_date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists immo_zahlungen_idx on public.immo_zahlungen (vertrag_id, monat desc);

alter table public.immo_einheiten enable row level security;
alter table public.immo_mietvertraege enable row level security;
alter table public.immo_zahlungen enable row level security;

drop policy if exists ie_owner_all on public.immo_einheiten;
create policy ie_owner_all on public.immo_einheiten for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ie_select_ma on public.immo_einheiten;
create policy ie_select_ma on public.immo_einheiten for select to public using ((owner_user_id = mein_chef_id()));

drop policy if exists imv_owner_all on public.immo_mietvertraege;
create policy imv_owner_all on public.immo_mietvertraege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists imv_select_ma on public.immo_mietvertraege;
create policy imv_select_ma on public.immo_mietvertraege for select to public using ((owner_user_id = mein_chef_id()));

drop policy if exists iz_owner_all on public.immo_zahlungen;
create policy iz_owner_all on public.immo_zahlungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists iz_select_ma on public.immo_zahlungen;
create policy iz_select_ma on public.immo_zahlungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists iz_insert_ma on public.immo_zahlungen;
create policy iz_insert_ma on public.immo_zahlungen for insert to public with check ((owner_user_id = mein_chef_id()));
