-- ============================================================
-- ARGONAUT OS · Paket 405 · HW-3 Teil 2 Foerder-Vorgang je Kunde (KfW 458)
--   foerder_vorgang  Status in fester Reihenfolge (geplant -> vertrag -> bza ->
--                    antrag -> zusage -> eingebaut -> nachweis -> ausgezahlt,
--                    jederzeit 'abgelehnt'), BzA-ID, Daten, Nachweis-Frist
--
-- ADDITIV UND IDEMPOTENT: eine neue Tabelle mit RLS. Nichts Bestehendes angefasst.
-- Kein Einkommen, keine Steuerdaten. RLS: Chef alles, Mitarbeiter lesen.
-- ============================================================

create table if not exists public.foerder_vorgang (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null default coalesce(mein_chef_id(), auth.uid()),
  kontakt_id          uuid,
  kunde_name          text not null check (char_length(btrim(kunde_name)) between 2 and 200),
  angebot_id          uuid,
  programm            text not null default 'kfw458',
  status              text not null default 'geplant'
                        check (status in ('geplant','vertrag','bza','antrag','zusage','eingebaut','nachweis','ausgezahlt','abgelehnt')),
  bza_id              text,
  antrag_am           date,
  zusage_am           date,
  nachweis_bis        date,
  zuschuss_geschaetzt numeric(12,2) check (zuschuss_geschaetzt is null or zuschuss_geschaetzt >= 0),
  notiz               text,
  erstellt_am         timestamptz not null default now(),
  geaendert_am        timestamptz not null default now()
);
create index if not exists foerder_vorgang_owner_idx on public.foerder_vorgang (owner_user_id, status);

-- Status nur einen Schritt vor (oder auf 'abgelehnt'), nie zurueck; abgeschlossen bleibt
create or replace function public.p405_status_reihe() returns trigger
language plpgsql as $$
declare
  reihe text[] := array['geplant','vertrag','bza','antrag','zusage','eingebaut','nachweis','ausgezahlt'];
  a int; n int;
begin
  new.geaendert_am := now();
  if new.status is not distinct from old.status then return new; end if;
  if old.status in ('ausgezahlt', 'abgelehnt') then
    raise exception 'Der Foerder-Vorgang ist abgeschlossen.' using errcode = 'P0001';
  end if;
  if new.status = 'abgelehnt' then return new; end if;
  a := array_position(reihe, old.status);
  n := array_position(reihe, new.status);
  if n is null or a is null or n <> a + 1 then
    raise exception 'Bitte der Reihe nach: Vertrag mit Bedingung, BzA, Antrag, Zusage, Einbau, Nachweis, Auszahlung.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists p405_status_reihe on public.foerder_vorgang;
create trigger p405_status_reihe before update on public.foerder_vorgang
  for each row execute function public.p405_status_reihe();

alter table public.foerder_vorgang enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='foerder_vorgang' and policyname='foerder_vorgang_chef') then
    create policy foerder_vorgang_chef on public.foerder_vorgang for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='foerder_vorgang' and policyname='foerder_vorgang_ma_select') then
    create policy foerder_vorgang_ma_select on public.foerder_vorgang for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
end $$;

select (select count(*) from pg_tables where schemaname='public' and tablename='foerder_vorgang')
       || '|' || (select count(*) from pg_policies where tablename='foerder_vorgang') as kontrolle_1_2;
