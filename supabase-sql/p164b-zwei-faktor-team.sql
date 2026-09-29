-- ============================================================
-- ARGONAUT OS · Paket 164 Stufe 2 (29.09.2026) · Zwei-Faktor im Team
--
--   zwei_faktor_helfer          Vertretung(en), die im Betrieb zuruecksetzen duerfen
--   zwei_faktor_grenze          wie viele Personen je Betrieb (Chef + Vertretungen), Standard 2
--   zwei_faktor_hilfe           „Handy und Codes verloren" — Anfragen an Chef/Vertretung/Betreiber
--   zwei_faktor_ruecksetzungen  Nachweis: wer hat fuer wen wann zurueckgesetzt
--
-- NEU, sonst nichts. Mehrfach ausfuehrbar. Sperrt niemanden aus (die Pflicht
-- schaltet erst der Schalter ZWEI_FAKTOR_PFLICHT=an in Vercel ein).
-- Alle vier Tabellen liest und schreibt nur der Server (keine Regel fuer Nutzer):
-- die Pruefung, wer was darf, steht in den Schnittstellen.
-- ============================================================

create table if not exists public.zwei_faktor_helfer (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  mitarbeiter_id uuid not null,
  user_id        uuid not null,
  erstellt_am    timestamptz not null default now(),
  erstellt_von   uuid
);
create unique index if not exists zwei_faktor_helfer_uidx on public.zwei_faktor_helfer (owner_user_id, user_id);
alter table public.zwei_faktor_helfer enable row level security;

create table if not exists public.zwei_faktor_grenze (
  owner_user_id uuid primary key,
  max_personen  integer not null default 2 check (max_personen between 1 and 20),
  geaendert_am  timestamptz not null default now()
);
alter table public.zwei_faktor_grenze enable row level security;

create table if not exists public.zwei_faktor_hilfe (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  owner_user_id  uuid not null,
  name           text,
  vom_chef       boolean not null default false,
  status         text not null default 'offen' check (status in ('offen', 'erledigt')),
  erstellt_am    timestamptz not null default now(),
  erledigt_am    timestamptz,
  erledigt_durch uuid
);
create index if not exists zwei_faktor_hilfe_idx on public.zwei_faktor_hilfe (owner_user_id, status, erstellt_am desc);
alter table public.zwei_faktor_hilfe enable row level security;

create table if not exists public.zwei_faktor_ruecksetzungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  ziel_user_id  uuid not null,
  ziel_name     text,
  durch_user_id uuid not null,
  durch_rolle   text not null check (durch_rolle in ('chef', 'helfer', 'betreiber')),
  zeit          timestamptz not null default now()
);
create index if not exists zwei_faktor_ruecksetzungen_idx on public.zwei_faktor_ruecksetzungen (owner_user_id, zeit desc);
alter table public.zwei_faktor_ruecksetzungen enable row level security;

-- Kontrolle: erwartet 6 | 3 | 9 | 7 | 0
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zwei_faktor_helfer') as helfer,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zwei_faktor_grenze') as grenze,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zwei_faktor_hilfe') as hilfe,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zwei_faktor_ruecksetzungen') as ruecksetzungen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('zwei_faktor_helfer', 'zwei_faktor_grenze', 'zwei_faktor_hilfe', 'zwei_faktor_ruecksetzungen')) as regeln;
