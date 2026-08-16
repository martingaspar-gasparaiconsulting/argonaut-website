-- ============================================================
-- ARGONAUT OS · Thema 7 · DSGVO-Center (Schritt 3/4)
-- Die Loeschung nach Art. 17 — mit Nachweis.
--
-- 1) Zwei Namens-Schnappschuesse, damit aufbewahrungspflichtige
--    Belege nach dem Loeschen des Kontakts noch zuordenbar sind.
--    Am 16.08.26 gegen die echte Datenbank geprueft: rechnungen,
--    abo_rechnungen, gutschein, spende und signatur_anfragen
--    tragen ihren Empfaengernamen selbst — kunden_mandate und
--    buchungen nicht.
-- 2) Ein Protokoll der Loeschvorgaenge: der Betrieb muss belegen
--    koennen, DASS und WANN geloescht wurde.
--
-- Additiv · idempotent · nichts Bestehendes wird veraendert.
-- ============================================================

-- ---------- 1) Namens-Schnappschuesse ----------
alter table public.kunden_mandate add column if not exists kontakt_name text;
alter table public.buchungen      add column if not exists kontakt_name text;

comment on column public.kunden_mandate.kontakt_name is
  'Schnappschuss des Kontoinhabers. Wird beim DSGVO-Loeschen gefuellt, damit das Mandat nachweisbar bleibt.';
comment on column public.buchungen.kontakt_name is
  'Schnappschuss des Kontaktnamens. Wird beim DSGVO-Loeschen gefuellt.';

-- ---------- 2) Protokoll der Loeschvorgaenge ----------
create table if not exists public.dsgvo_loeschungen (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null,
  akteur_id         uuid,
  kontakt_id        uuid,
  kontakt_kennung   text,                       -- Name zum Zeitpunkt der Loeschung
  modus             text not null default 'loeschen',   -- vorschau | loeschen
  geloescht         jsonb not null default '{}'::jsonb, -- { "tickets": 3, ... }
  anonymisiert      jsonb not null default '{}'::jsonb,
  behalten          jsonb not null default '{}'::jsonb,
  uebersprungen     text[] not null default '{}',
  fehler            text[] not null default '{}',
  begonnen_am       timestamptz not null default now(),
  fertig_am         timestamptz
);

create index if not exists dsgvo_loeschungen_owner_idx
  on public.dsgvo_loeschungen (owner_user_id, begonnen_am desc);
create index if not exists dsgvo_loeschungen_kontakt_idx
  on public.dsgvo_loeschungen (kontakt_id);

alter table public.dsgvo_loeschungen enable row level security;

drop policy if exists dl_select on public.dsgvo_loeschungen;
create policy dl_select on public.dsgvo_loeschungen
  for select to public using ((auth.uid() = owner_user_id));

drop policy if exists dl_select_ma on public.dsgvo_loeschungen;
create policy dl_select_ma on public.dsgvo_loeschungen
  for select to public using ((owner_user_id = mein_chef_id()));

drop policy if exists dl_insert on public.dsgvo_loeschungen;
create policy dl_insert on public.dsgvo_loeschungen
  for insert to public with check ((auth.uid() = owner_user_id));

drop policy if exists dl_update on public.dsgvo_loeschungen;
create policy dl_update on public.dsgvo_loeschungen
  for update to public using ((auth.uid() = owner_user_id));

-- Bewusst KEINE delete-Policy: ein Loeschnachweis, den man
-- selbst loeschen kann, ist kein Nachweis.
