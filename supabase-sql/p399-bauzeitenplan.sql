-- ============================================================
-- ARGONAUT OS · Paket 399 · HW-2 Bauzeitenplan
--   bau_zeitplan  Vorgaenge (Gewerke) je Projekt: Dauer in Arbeitstagen,
--                 Vorgaenger (faengt an, wenn ... fertig), Wartezeit danach,
--                 fruehester Start, Fortschritt
--
-- ADDITIV UND IDEMPOTENT: eine neue Tabelle mit RLS. Nichts Bestehendes angefasst.
-- RLS: Chef alles. Mitarbeiter lesen und tragen den Fortschritt ein
--      (aendern sonst nichts, loeschen nicht).
-- ============================================================

create table if not exists public.bau_zeitplan (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  projekt_id    uuid not null,
  titel         text not null check (char_length(btrim(titel)) between 2 and 200),
  gewerk        text,
  firma         text,
  start_wunsch  date,
  dauer_tage    integer not null check (dauer_tage between 1 and 500),
  puffer_tage   integer not null default 0 check (puffer_tage between 0 and 60),
  vorgaenger    uuid[] not null default '{}' check (cardinality(vorgaenger) <= 20),
  fortschritt   integer not null default 0 check (fortschritt between 0 and 100),
  sortierung    integer not null default 0,
  notiz         text,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);
create index if not exists bau_zeitplan_projekt_idx on public.bau_zeitplan (owner_user_id, projekt_id, sortierung);

-- Mitarbeiter duerfen nur den Fortschritt aendern
create or replace function public.p399_zeitplan_ma() returns trigger
language plpgsql as $$
begin
  new.geaendert_am := now();
  if new.owner_user_id is distinct from auth.uid()
     and (to_jsonb(new) - 'fortschritt' - 'geaendert_am') <> (to_jsonb(old) - 'fortschritt' - 'geaendert_am') then
    raise exception 'Mitarbeiter koennen nur den Fortschritt eintragen.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists p399_zeitplan_ma on public.bau_zeitplan;
create trigger p399_zeitplan_ma before update on public.bau_zeitplan
  for each row execute function public.p399_zeitplan_ma();

alter table public.bau_zeitplan enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='bau_zeitplan' and policyname='bau_zeitplan_chef') then
    create policy bau_zeitplan_chef on public.bau_zeitplan for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='bau_zeitplan' and policyname='bau_zeitplan_ma_select') then
    create policy bau_zeitplan_ma_select on public.bau_zeitplan for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='bau_zeitplan' and policyname='bau_zeitplan_ma_update') then
    create policy bau_zeitplan_ma_update on public.bau_zeitplan for update to authenticated
      using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
  end if;
end $$;

select (select count(*) from pg_tables where schemaname='public' and tablename='bau_zeitplan')
       || '|' || (select count(*) from pg_policies where tablename='bau_zeitplan') as kontrolle_1_3;
