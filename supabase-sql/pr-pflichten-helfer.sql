-- ============================================================
-- ARGONAUT OS · Paket PR · Pflichten-Helfer (K03, K04) — Stand 24.09.2026
--   kassen_system      Verzeichnis der Kassen/Aufzeichnungssysteme mit TSE (§ 146a Abs. 4 AO)
--   kassen_meldung     wann je Betriebsstätte an ELSTER gemeldet wurde (+ Momentaufnahme)
--   bfsg_angaben       Fragebogen + Angaben für die Barrierefreiheits-Erklärung
--   web_ci.barrierefreiheit_text   Erklärung, die auf jeder Seite verankert wird
--
-- ADDITIV UND IDEMPOTENT. Chef pflegt, Mitarbeiter lesen das Kassenverzeichnis.
-- ============================================================

create table if not exists public.kassen_system (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null default coalesce(mein_chef_id(), auth.uid()),
  betriebsstaette    text not null,
  art                text not null check (art in ('kasse_pc','kasse_app','registrierkasse','taxameter','wegstreckenzaehler','sonstiges')),
  hersteller         text,
  modell             text,
  software           text,
  seriennummer       text,
  anschaffung_am     date,
  gemietet           boolean not null default false,
  ausser_betrieb_am  date,
  ausser_grund       text,
  tse_art            text,
  tse_seriennummer   text,
  tse_bsi_id         text,
  tse_anschaffung_am date,
  notiz              text,
  erstellt_am        timestamptz not null default now()
);
create index if not exists kassen_system_owner_idx on public.kassen_system (owner_user_id);

create table if not exists public.kassen_meldung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default auth.uid(),
  betriebsstaette text not null,
  gemeldet_am     date not null,
  transferticket  text,
  snapshot        jsonb not null default '[]'::jsonb,
  erstellt_am     timestamptz not null default now()
);
create index if not exists kassen_meldung_owner_idx on public.kassen_meldung (owner_user_id, gemeldet_am desc);

create table if not exists public.bfsg_angaben (
  owner_user_id  uuid primary key default auth.uid(),
  verbraucher    boolean,
  online_vertrag boolean,
  beschaeftigte  integer,
  umsatz_mio     numeric(10,2),
  leistung       text,
  erfuellt       text[] not null default '{}',
  barrieren      text,
  geprueft_am    date,
  aktualisiert_am timestamptz not null default now()
);

alter table public.web_ci add column if not exists barrierefreiheit_text text;

alter table public.kassen_system  enable row level security;
alter table public.kassen_meldung enable row level security;
alter table public.bfsg_angaben   enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='kassen_system' and policyname='ks_chef_all') then
    create policy ks_chef_all on public.kassen_system for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='kassen_system' and policyname='ks_ma_select') then
    create policy ks_ma_select on public.kassen_system for select to authenticated using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='kassen_meldung' and policyname='km_chef_all') then
    create policy km_chef_all on public.kassen_meldung for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='kassen_meldung' and policyname='km_ma_select') then
    create policy km_ma_select on public.kassen_meldung for select to authenticated using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bfsg_angaben' and policyname='bfsg_chef_all') then
    create policy bfsg_chef_all on public.bfsg_angaben for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
end $$;

-- ---------- LESEN: Kontrolle ----------
select t.tablename as tabelle, t.rowsecurity as rls_an, (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=t.tablename) as regeln
  from pg_tables t
 where t.schemaname='public' and t.tablename in ('kassen_system','kassen_meldung','bfsg_angaben')
union all
select 'web_ci.barrierefreiheit_text', exists (select 1 from information_schema.columns where table_schema='public' and table_name='web_ci' and column_name='barrierefreiheit_text'), null
order by 1;
