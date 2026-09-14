-- ============================================================================
-- ARGONAUT OS · Webinar-Baustein (Punkt 3.13 / Paket 5)  ·  14.09.2026
-- ADDITIV und IDEMPOTENT. Kein drop, kein alter type, nichts Destruktives.
-- Mehrfaches Ausfuehren ist unschaedlich.
-- ============================================================================

-- 1) Das Webinar selbst -------------------------------------------------------
create table if not exists public.webinare (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  key           text not null,
  titel         text not null default '',
  beschreibung  text not null default '',
  referent      text not null default '',
  aufzeichnung_url text,
  aktiv         boolean not null default false,
  erstellt_am   timestamptz not null default now()
);
create unique index if not exists webinare_key_uniq on public.webinare (lower(key));
create index if not exists webinare_owner_idx on public.webinare (owner_user_id);

-- 2) Die Termine --------------------------------------------------------------
create table if not exists public.webinar_termin (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  webinar_id    uuid not null references public.webinare(id) on delete cascade,
  beginnt_am    timestamptz,
  dauer_minuten integer not null default 60,
  kapazitaet    integer,
  zugang_url    text,
  status        text not null default 'geplant',
  erstellt_am   timestamptz not null default now()
);
create index if not exists webinar_termin_webinar_idx on public.webinar_termin (webinar_id);
-- Der Cron sucht immer nach: offene Termine, sortiert nach Beginn.
create index if not exists webinar_termin_lauf_idx on public.webinar_termin (status, beginnt_am);

-- 3) Die Anmeldungen ----------------------------------------------------------
create table if not exists public.webinar_anmeldung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  webinar_id      uuid not null references public.webinare(id) on delete cascade,
  termin_id       uuid not null references public.webinar_termin(id) on delete cascade,
  email           text not null,
  name            text,
  firma           text,
  status          text not null default 'unbestaetigt',
  token           text not null,
  bestaetigt_am   timestamptz,
  abgemeldet_am   timestamptz,
  teilnahme       text not null default 'offen',
  nachbereitung_am timestamptz,
  erstellt_am     timestamptz not null default now()
);
-- Niemand kann sich zweimal fuer denselben Termin eintragen.
create unique index if not exists webinar_anmeldung_uniq on public.webinar_anmeldung (termin_id, lower(email));
-- Der Bestaetigungs- und Abmeldelink findet die Zeile ueber den Token.
create unique index if not exists webinar_anmeldung_token_uniq on public.webinar_anmeldung (token);
create index if not exists webinar_anmeldung_lauf_idx on public.webinar_anmeldung (status, termin_id);

-- 4) Das Versandprotokoll -----------------------------------------------------
-- WICHTIG: Die Zeile wird VOR dem Versand geschrieben, nicht danach. Der
-- eindeutige Index darunter ist die eigentliche Sperre gegen Doppelmails —
-- bricht der Cron mitten im Lauf ab, ist die Stufe trotzdem vermerkt.
create table if not exists public.webinar_versand (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  anmeldung_id  uuid not null references public.webinar_anmeldung(id) on delete cascade,
  termin_id     uuid not null references public.webinar_termin(id) on delete cascade,
  art           text not null,
  stufe         integer not null default 0,
  betreff       text,
  gesendet_am   timestamptz not null default now()
);
create unique index if not exists webinar_versand_uniq on public.webinar_versand (anmeldung_id, art, stufe);
create index if not exists webinar_versand_anmeldung_idx on public.webinar_versand (anmeldung_id);

-- 5) Zeilenschutz -------------------------------------------------------------
alter table public.webinare           enable row level security;
alter table public.webinar_termin     enable row level security;
alter table public.webinar_anmeldung  enable row level security;
alter table public.webinar_versand    enable row level security;

do $$
declare
  t text;
  p text;
begin
  foreach t in array array['webinare','webinar_termin','webinar_anmeldung','webinar_versand']
  loop
    -- lesen
    p := t || '_select';
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=p) then
      execute format('create policy %I on public.%I for select to authenticated using (owner_user_id = auth.uid())', p, t);
    end if;
    -- anlegen
    p := t || '_insert';
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=p) then
      execute format('create policy %I on public.%I for insert to authenticated with check (owner_user_id = auth.uid())', p, t);
    end if;
    -- aendern
    p := t || '_update';
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=p) then
      execute format('create policy %I on public.%I for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid())', p, t);
    end if;
  end loop;

  -- Loeschen NUR fuer Webinar und Termin (die Anmeldung eines Interessenten
  -- verschwindet nicht auf Zuruf; sie wird abgemeldet, nicht geloescht —
  -- sonst fehlt der Nachweis der Einwilligung nach Art. 7 Abs. 1 DSGVO).
  foreach t in array array['webinare','webinar_termin']
  loop
    p := t || '_delete';
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=p) then
      execute format('create policy %I on public.%I for delete to authenticated using (owner_user_id = auth.uid())', p, t);
    end if;
  end loop;
end $$;

-- 6) Kontrolle ----------------------------------------------------------------
-- Erwartung: 4 Tabellen, 14 Regeln (4x select + 4x insert + 4x update + 2x delete).
select 'Tabellen' as was, count(*)::text as zahl
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('webinare','webinar_termin','webinar_anmeldung','webinar_versand')
union all
select 'Regeln', count(*)::text
  from pg_policies
 where schemaname = 'public'
   and tablename in ('webinare','webinar_termin','webinar_anmeldung','webinar_versand')
union all
select 'Eindeutige Sperren', count(*)::text
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('webinare_key_uniq','webinar_anmeldung_uniq','webinar_anmeldung_token_uniq','webinar_versand_uniq');
