-- ============================================================
-- ARGONAUT OS · Bündel 7 (vorgezogen) · Bewertungsmanagement
-- Kunden nach erledigtem Auftrag um eine Bewertung bitten, sammeln, freigeben.
-- Eine Tabelle. Öffentliche Abgabe läuft per Token über die Service-Role-Route
-- (kein Login) — daher betriebsscharfe Filterung im Endpunkt, keine Public-RLS.
-- Nicht-brechend · idempotent.
-- ============================================================

create table if not exists public.bewertungsanfragen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  kunde_name     text,
  kunde_email    text,
  token          text not null unique,
  status         text not null default 'offen',   -- offen | abgegeben
  sterne         int,                              -- 1..5
  text           text,
  veroeffentlicht boolean not null default false,
  quelle         text,                             -- auftrag | rechnung | manuell
  erstellt_am    timestamptz not null default now(),
  abgegeben_am   timestamptz
);
create index if not exists bewertungen_owner_idx on public.bewertungsanfragen (owner_user_id, erstellt_am desc);

alter table public.bewertungsanfragen enable row level security;

-- Chef pflegt seine, Mitarbeiter sieht die des Chefs. Öffentliche Abgabe = Service-Role.
drop policy if exists bew_select on public.bewertungsanfragen;
create policy bew_select on public.bewertungsanfragen for select to public using ((auth.uid() = owner_user_id));
drop policy if exists bew_select_ma on public.bewertungsanfragen;
create policy bew_select_ma on public.bewertungsanfragen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists bew_insert on public.bewertungsanfragen;
create policy bew_insert on public.bewertungsanfragen for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists bew_update on public.bewertungsanfragen;
create policy bew_update on public.bewertungsanfragen for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists bew_delete on public.bewertungsanfragen;
create policy bew_delete on public.bewertungsanfragen for delete to public using ((auth.uid() = owner_user_id));
