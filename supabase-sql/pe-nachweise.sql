-- ============================================================
-- ARGONAUT OS · Paket PE · Nachweis- und Fristen-Motor — Stand 24.09.2026
--   nachweis              EIN Eintrag je Nachweis (Arbeitsschutz, Pflichten,
--                         Subunternehmer, Versicherung, Entsorgung)
--   nachweis_unterschrift Unterschriften unter einer Unterweisung
--
-- ADDITIV UND IDEMPOTENT: zwei neue Tabellen, nichts Bestehendes angefasst.
-- RLS nach Tenant-Muster: Chef alles. Mitarbeiter sehen NUR Arbeitsschutz
-- und Pflichten (keine Versicherungen, keine Subunternehmer) und duerfen
-- Unterschriften hinzufuegen — aendern oder loeschen koennen sie nichts.
-- ============================================================

create table if not exists public.nachweis (
  id                      uuid primary key default gen_random_uuid(),
  owner_user_id           uuid not null,
  mappe                   text not null check (mappe in ('arbeitsschutz', 'pflichten', 'subunternehmer', 'versicherung', 'entsorgung')),
  art                     text not null,
  bezeichnung             text not null,
  bezug                   text,
  letzte_am               date,
  intervall_monate        integer check (intervall_monate is null or intervall_monate between 1 and 120),
  gueltig_bis             date,
  kuendigungsfrist_monate integer check (kuendigungsfrist_monate is null or kuendigungsfrist_monate between 0 and 24),
  betrag                  numeric(12,2),
  notiz                   text,
  erstellt_am             timestamptz not null default now(),
  aktualisiert_am         timestamptz not null default now()
);
create index if not exists nachweis_owner_mappe_idx on public.nachweis (owner_user_id, mappe);

create table if not exists public.nachweis_unterschrift (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null,
  nachweis_id      uuid not null references public.nachweis(id) on delete cascade,
  mitarbeiter_id   uuid,
  name             text not null,
  thema            text,
  unterschrift     text not null check (length(unterschrift) <= 200000),
  unterschrieben_am timestamptz not null default now()
);
create index if not exists nachweis_unterschrift_idx on public.nachweis_unterschrift (nachweis_id, unterschrieben_am desc);

alter table public.nachweis enable row level security;
alter table public.nachweis_unterschrift enable row level security;

do $$
begin
  -- nachweis: Chef alles
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nachweis' and policyname='nachweis_chef') then
    create policy nachweis_chef on public.nachweis for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  -- nachweis: Mitarbeiter nur lesen, nur Arbeitsschutz und Pflichten
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nachweis' and policyname='nachweis_ma_select') then
    create policy nachweis_ma_select on public.nachweis for select to authenticated
      using (owner_user_id = mein_chef_id() and mappe in ('arbeitsschutz', 'pflichten'));
  end if;
  -- Unterschriften: Chef alles
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nachweis_unterschrift' and policyname='nachweis_unterschrift_chef') then
    create policy nachweis_unterschrift_chef on public.nachweis_unterschrift for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  -- Unterschriften: Mitarbeiter lesen und hinzufuegen, nicht aendern, nicht loeschen
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nachweis_unterschrift' and policyname='nachweis_unterschrift_ma_select') then
    create policy nachweis_unterschrift_ma_select on public.nachweis_unterschrift for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nachweis_unterschrift' and policyname='nachweis_unterschrift_ma_insert') then
    create policy nachweis_unterschrift_ma_insert on public.nachweis_unterschrift for insert to authenticated
      with check (owner_user_id = mein_chef_id());
  end if;
end $$;

select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('nachweis', 'nachweis_unterschrift') order by tablename;
