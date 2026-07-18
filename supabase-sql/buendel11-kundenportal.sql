-- ============================================================
-- ARGONAUT OS · Bündel 11 · Kunden-Portal (Self-Service)
-- Jeder Kontakt kann einen eigenen, login-freien Portal-Link bekommen.
-- Über diesen Link sieht der Kunde AUSSCHLIESSLICH seine eigenen
-- Rechnungen und Termine — nichts Fremdes. Ein Token zeigt genau auf
-- einen Kontakt eines Betriebs.
--
-- Zugriff nach aussen laeuft NUR ueber /api/oeffentlich/portal (Service-Role,
-- Token-basiert, hart auf owner_user_id + kontakt_id gefiltert, fail-closed).
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

create table if not exists public.portal_zugaenge (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null,
  kontakt_id       uuid not null references public.kontakte(id) on delete cascade,
  token            uuid not null default gen_random_uuid(),
  aktiv            boolean not null default true,
  erstellt_am      timestamptz not null default now(),
  letzter_zugriff_am timestamptz
);

-- Ein Token ist global eindeutig (Sicherheit: kein Erraten ueber Kollisionen).
create unique index if not exists portal_zugaenge_token_uidx on public.portal_zugaenge (token);
-- Pro Kontakt hoechstens EIN Zugang (kein Wildwuchs an Links je Kunde).
create unique index if not exists portal_zugaenge_kontakt_uidx on public.portal_zugaenge (kontakt_id);
create index if not exists portal_zugaenge_owner_idx on public.portal_zugaenge (owner_user_id, aktiv);

alter table public.portal_zugaenge enable row level security;

-- Owner: volle Kontrolle ueber die eigenen Zugaenge.
drop policy if exists pz_owner_all on public.portal_zugaenge;
create policy pz_owner_all on public.portal_zugaenge
  for all to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

-- Mitarbeiter: darf die Zugaenge seines Chefs sehen (Lesen genuegt fuer die Liste).
drop policy if exists pz_select_ma on public.portal_zugaenge;
create policy pz_select_ma on public.portal_zugaenge
  for select to public
  using ((owner_user_id = mein_chef_id()));

-- HINWEIS: Der oeffentliche Portal-Endpunkt nutzt die Service-Role und umgeht
-- damit RLS bewusst — er filtert dafuer selbst HART auf owner_user_id + kontakt_id
-- aus dem Token (fail-closed). Ohne gueltigen, aktiven Token gibt es keine Daten.
