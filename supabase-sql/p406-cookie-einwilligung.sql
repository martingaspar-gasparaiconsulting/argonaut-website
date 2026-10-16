-- ARGONAUT OS · p406 · C1 Einwilligungs-Fenster (16.10.2026) · additiv, mehrfach ausfuehrbar
-- 1) Schalter je Betrieb  2) Nachweis-Tabelle (unveraenderbar)  3) Kennung an den Messdaten
alter table public.web_ci add column if not exists cookie_messung boolean not null default false;

create table if not exists public.web_einwilligung (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  oeffentlich_id text not null,
  entscheidung text not null check (entscheidung in ('ja','nein','widerruf')),
  besucher_id uuid,
  text_version text not null,
  erstellt_am timestamptz not null default now(),
  constraint web_einwilligung_kennung_chk check ((entscheidung = 'nein') = (besucher_id is null))
);
create index if not exists web_einwilligung_owner_idx on public.web_einwilligung (owner_user_id, erstellt_am desc);
alter table public.web_einwilligung enable row level security;
drop policy if exists web_einwilligung_select on public.web_einwilligung;
create policy web_einwilligung_select on public.web_einwilligung
  for select to authenticated using (auth.uid() = owner_user_id);

create or replace function public.web_einwilligung_sperre() returns trigger
language plpgsql as $$
begin
  raise exception 'Einwilligungs-Nachweise sind unveraenderbar';
end $$;
drop trigger if exists web_einwilligung_sperre_trg on public.web_einwilligung;
create trigger web_einwilligung_sperre_trg before update on public.web_einwilligung
  for each row execute function public.web_einwilligung_sperre();

do $$
begin
  if to_regclass('public.web_ereignisse') is not null then
    alter table public.web_ereignisse add column if not exists besucher_id uuid;
    create index if not exists web_ereignisse_besucher_idx on public.web_ereignisse (owner_user_id, besucher_id) where besucher_id is not null;
  end if;
end $$;

-- Kontrolle: erwartet 1|1|1
select (select count(*) from information_schema.columns where table_schema='public' and table_name='web_ci' and column_name='cookie_messung')
  || '|' || (select count(*) from pg_policies where tablename='web_einwilligung')
  || '|' || (select count(*) from information_schema.columns where table_schema='public' and table_name='web_ereignisse' and column_name='besucher_id') as kontrolle;
