-- ============================================================
-- ARGONAUT OS · Paket PM · Mehrsprachiges Team (B25) — Stand 24.09.2026
--   sprach_profil        jede Person waehlt ihre Sprache (Team-Chat + Anweisungen)
--   sprach_anweisung     Anweisung / Unterweisung auf Deutsch + gepruefte Uebersetzungen
--   sprach_bestaetigung  "Gelesen und verstanden" je Person, mit Sprache und Zeit
--
-- ADDITIV UND IDEMPOTENT: drei neue Tabellen mit eigenen Regeln.
-- Nichts Bestehendes angefasst.
-- RLS:
--   sprach_profil       jeder nur seine eigene Zeile; der Chef liest die seines Betriebs
--   sprach_anweisung    Chef alles; Mitarbeiter lesen NUR freigegebene
--   sprach_bestaetigung Chef liest alle; Mitarbeiter legen nur ihre eigene an und
--                       lesen nur ihre eigenen. Kein Aendern/Loeschen fuer Mitarbeiter.
-- ============================================================

create table if not exists public.sprach_profil (
  user_id         uuid primary key default auth.uid(),
  owner_user_id   uuid not null default coalesce(mein_chef_id(), auth.uid()),
  name            text,
  sprache         text not null default 'de',
  aktualisiert_am timestamptz not null default now()
);
create index if not exists sprach_profil_owner_idx on public.sprach_profil (owner_user_id);

create table if not exists public.sprach_anweisung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(mein_chef_id(), auth.uid()),
  erstellt_von    uuid default auth.uid(),
  art             text not null default 'anweisung' check (art in ('anweisung', 'unterweisung', 'sicherheit', 'info')),
  titel_de        text not null,
  text_de         text not null,
  uebersetzungen  jsonb not null default '{}'::jsonb,
  status          text not null default 'entwurf' check (status in ('entwurf', 'freigegeben', 'archiviert')),
  projekt_id      uuid references public.projekte(id) on delete set null,
  freigegeben_am  timestamptz,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists sprach_anweisung_owner_idx on public.sprach_anweisung (owner_user_id, status, erstellt_am desc);

create table if not exists public.sprach_bestaetigung (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null default coalesce(mein_chef_id(), auth.uid()),
  anweisung_id   uuid not null references public.sprach_anweisung(id) on delete cascade,
  user_id        uuid not null default auth.uid(),
  name           text,
  sprache        text not null default 'de',
  bestaetigt_am  timestamptz not null default now()
);
create index if not exists sprach_bestaetigung_anw_idx on public.sprach_bestaetigung (anweisung_id, user_id);

alter table public.sprach_profil enable row level security;
alter table public.sprach_anweisung enable row level security;
alter table public.sprach_bestaetigung enable row level security;

do $$
begin
  -- sprach_profil
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sprach_profil' and policyname='sprach_profil_eigen') then
    create policy sprach_profil_eigen on public.sprach_profil for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid() and owner_user_id = coalesce(mein_chef_id(), auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sprach_profil' and policyname='sprach_profil_chef_select') then
    create policy sprach_profil_chef_select on public.sprach_profil for select to authenticated
      using (owner_user_id = auth.uid());
  end if;

  -- sprach_anweisung
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sprach_anweisung' and policyname='sprach_anweisung_chef') then
    create policy sprach_anweisung_chef on public.sprach_anweisung for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sprach_anweisung' and policyname='sprach_anweisung_ma_select') then
    create policy sprach_anweisung_ma_select on public.sprach_anweisung for select to authenticated
      using (owner_user_id = mein_chef_id() and status = 'freigegeben');
  end if;

  -- sprach_bestaetigung
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sprach_bestaetigung' and policyname='sprach_best_chef_select') then
    create policy sprach_best_chef_select on public.sprach_bestaetigung for select to authenticated
      using (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sprach_bestaetigung' and policyname='sprach_best_eigen_select') then
    create policy sprach_best_eigen_select on public.sprach_bestaetigung for select to authenticated
      using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sprach_bestaetigung' and policyname='sprach_best_eigen_insert') then
    create policy sprach_best_eigen_insert on public.sprach_bestaetigung for insert to authenticated
      with check (
        user_id = auth.uid()
        and owner_user_id = coalesce(mein_chef_id(), auth.uid())
        and exists (select 1 from public.sprach_anweisung a
                     where a.id = anweisung_id and a.owner_user_id = sprach_bestaetigung.owner_user_id and a.status = 'freigegeben')
      );
  end if;
end $$;

select tablename, count(*) as regeln
  from pg_policies
 where schemaname = 'public' and tablename in ('sprach_profil', 'sprach_anweisung', 'sprach_bestaetigung')
 group by tablename
 order by tablename;
