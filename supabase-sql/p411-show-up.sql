-- ARGONAUT OS · p411 · VK5 Show-up-Maschine (16.10.2026) · additiv, mehrfach ausfuehrbar
-- termine: erschienen (true/false, leer = offen), wann markiert, 1-Std.-Erinnerung, Rueckhol-Folge.
-- vk_showup: eine Zeile je Betrieb, ob 1-Std.-Erinnerung und Rueckhol-Folge laufen (Voreinstellung AUS).
do $$
begin
  if to_regclass('public.termine') is not null then
    alter table public.termine
      add column if not exists erschienen boolean,
      add column if not exists erschienen_am timestamptz,
      add column if not exists erinnerung_1h_am timestamptz,
      add column if not exists rueckhol_stufe smallint not null default 0,
      add column if not exists rueckhol_letzte_am timestamptz;
    create index if not exists termine_nicht_erschienen_idx on public.termine (owner_user_id, beginn_am) where erschienen = false;
  end if;
end $$;

create table if not exists public.vk_showup (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique default coalesce(public.mein_chef_id(), auth.uid()),
  erinnerung_1h boolean not null default false,
  rueckhol_an boolean not null default false,
  rueckhol_tage smallint[] not null default '{1,4}'
    check (cardinality(rueckhol_tage) between 1 and 3 and 1 <= all(rueckhol_tage) and 30 >= all(rueckhol_tage)),
  aktualisiert_am timestamptz not null default now()
);
alter table public.vk_showup enable row level security;
revoke all on public.vk_showup from anon;
drop policy if exists p411_owner on public.vk_showup;
create policy p411_owner on public.vk_showup for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p411_ma on public.vk_showup;
create policy p411_ma on public.vk_showup for select to authenticated using (owner_user_id = public.mein_chef_id());

-- Kontrolle: erwartet 1|2|5
select (select count(*) from information_schema.tables where table_schema='public' and table_name='vk_showup')
  || '|' || (select count(*) from pg_policies where schemaname='public' and tablename='vk_showup')
  || '|' || (select count(*) from information_schema.columns where table_schema='public' and table_name='termine'
       and column_name in ('erschienen','erschienen_am','erinnerung_1h_am','rueckhol_stufe','rueckhol_letzte_am')) as kontrolle;
