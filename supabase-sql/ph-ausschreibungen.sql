-- ============================================================
-- ARGONAUT OS · Paket PH · Ausschreibungs-Radar — Stand 24.09.2026
--   ausschreibung_profil   Suchprofil je Betrieb (Stichwoerter, CPV, Region)
--   ausschreibung          gemerkte / gepruefte Ausschreibungen mit Status
--
-- ADDITIV UND IDEMPOTENT: zwei neue Tabellen, nichts Bestehendes angefasst.
-- RLS: NUR der Chef (owner_user_id = auth.uid()).
-- ============================================================

create table if not exists public.ausschreibung_profil (
  owner_user_id    uuid primary key default auth.uid(),
  suchwoerter      text[] not null default '{}',
  cpv              text[] not null default '{}',
  region           text[] not null default '{}',
  tage             integer not null default 30 check (tage between 1 and 90),
  letzte_suche_am  timestamptz,
  aktualisiert_am  timestamptz not null default now()
);

create table if not exists public.ausschreibung (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default auth.uid(),
  quelle           text not null default 'manuell' check (quelle in ('ted', 'manuell')),
  extern_id        text,
  titel            text not null,
  auftraggeber     text,
  ort              text,
  link             text,
  abgabe_am        date,
  wert             numeric(14,2),
  cpv              text[] not null default '{}',
  status           text not null default 'neu' check (status in ('neu', 'pruefen', 'bieten', 'abgegeben', 'gewonnen', 'verloren', 'verworfen')),
  auswertung       jsonb,
  notiz            text,
  erstellt_am      timestamptz not null default now(),
  aktualisiert_am  timestamptz not null default now()
);
create unique index if not exists ausschreibung_extern_uidx on public.ausschreibung (owner_user_id, extern_id) where extern_id is not null;
create index if not exists ausschreibung_owner_idx on public.ausschreibung (owner_user_id, status, abgabe_am);

alter table public.ausschreibung_profil enable row level security;
alter table public.ausschreibung enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ausschreibung_profil' and policyname='ausschreibung_profil_chef') then
    create policy ausschreibung_profil_chef on public.ausschreibung_profil for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ausschreibung' and policyname='ausschreibung_chef') then
    create policy ausschreibung_chef on public.ausschreibung for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
end $$;

select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('ausschreibung', 'ausschreibung_profil') order by tablename;
