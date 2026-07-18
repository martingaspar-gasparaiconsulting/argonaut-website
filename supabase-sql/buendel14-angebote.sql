-- ============================================================
-- ARGONAUT OS · Bündel 14 · Angebote mit Online-Zusage
-- Angebote (Kostenvoranschläge) -> Kunde nimmt online per Token-Link an oder
-- lehnt ab -> aus einem angenommenen Angebot entsteht per Klick eine Rechnung.
-- Muster wie rechnungen/rechnung_positionen. Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.angebote (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  angebotsnummer text,
  titel          text not null default 'Angebot',
  kunde_name     text,
  kunde_email    text,
  status         text not null default 'entwurf',
  -- entwurf | gesendet | angenommen | abgelehnt | abgelaufen
  gueltig_bis    date,
  netto_summe    numeric(12,2) not null default 0,
  mwst_summe     numeric(12,2) not null default 0,
  brutto_summe   numeric(12,2) not null default 0,
  token          uuid not null default gen_random_uuid(),
  angenommen_am  timestamptz,
  abgelehnt_am   timestamptz,
  rechnung_id    uuid,
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create unique index if not exists angebote_token_uidx on public.angebote (token);
create index if not exists angebote_owner_idx on public.angebote (owner_user_id, status, erstellt_am desc);

create table if not exists public.angebot_positionen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  angebot_id    uuid not null references public.angebote(id) on delete cascade,
  position      integer not null default 1,
  bezeichnung   text not null default '',
  menge         numeric(12,2) not null default 1,
  einheit       text not null default 'Stk',
  einzelpreis   numeric(12,2) not null default 0,
  mwst_satz     numeric(5,2) not null default 19,
  gesamt_netto  numeric(12,2) not null default 0
);
create index if not exists angebot_positionen_idx on public.angebot_positionen (angebot_id, position);

alter table public.angebote enable row level security;
alter table public.angebot_positionen enable row level security;

-- angebote
drop policy if exists ang_select on public.angebote;
create policy ang_select on public.angebote for select to public using ((auth.uid() = owner_user_id));
drop policy if exists ang_select_ma on public.angebote;
create policy ang_select_ma on public.angebote for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ang_insert on public.angebote;
create policy ang_insert on public.angebote for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists ang_update on public.angebote;
create policy ang_update on public.angebote for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ang_delete on public.angebote;
create policy ang_delete on public.angebote for delete to public using ((auth.uid() = owner_user_id));

-- angebot_positionen
drop policy if exists angp_select on public.angebot_positionen;
create policy angp_select on public.angebot_positionen for select to public using ((auth.uid() = owner_user_id));
drop policy if exists angp_select_ma on public.angebot_positionen;
create policy angp_select_ma on public.angebot_positionen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists angp_insert on public.angebot_positionen;
create policy angp_insert on public.angebot_positionen for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists angp_update on public.angebot_positionen;
create policy angp_update on public.angebot_positionen for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists angp_delete on public.angebot_positionen;
create policy angp_delete on public.angebot_positionen for delete to public using ((auth.uid() = owner_user_id));

-- HINWEIS: Die Online-Zusage laeuft ueber /api/oeffentlich/angebot (Service-Role,
-- hart auf den Token gefiltert, fail-closed). Ein bereits angenommenes/abgelehntes
-- Angebot kann nicht erneut entschieden werden.
