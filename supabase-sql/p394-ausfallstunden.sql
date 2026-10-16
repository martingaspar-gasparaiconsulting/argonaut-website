-- ============================================================
-- ARGONAUT OS · Paket 394 · HW-4 Ausfallstunden (Schlechtwetter / Arbeitsmangel)
--   hr_ausfall  je Mitarbeiter und Tag: Stunden + Grund, fuer die Lohnvorbereitung
--
-- ADDITIV UND IDEMPOTENT: eine neue Tabelle mit RLS. Nichts Bestehendes angefasst.
-- RLS: Chef alles; Mitarbeiter mit Recht „Personal aendern" lesen/anlegen/aendern.
-- ============================================================

create table if not exists public.hr_ausfall (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null default coalesce(mein_chef_id(), auth.uid()),
  mitarbeiter_id uuid not null,
  datum          date not null,
  stunden        numeric(5,2) not null check (stunden > 0 and stunden <= 12),
  grund          text not null check (grund in ('schlechtwetter', 'arbeitsmangel')),
  notiz          text,
  erstellt_von   uuid default auth.uid(),
  erstellt_am    timestamptz not null default now()
);
create index if not exists hr_ausfall_owner_idx on public.hr_ausfall (owner_user_id, datum);

alter table public.hr_ausfall enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='hr_ausfall' and policyname='hr_ausfall_chef') then
    create policy hr_ausfall_chef on public.hr_ausfall for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='hr_ausfall' and policyname='hr_ausfall_ma') then
    create policy hr_ausfall_ma on public.hr_ausfall for all to authenticated
      using (owner_user_id = mein_chef_id() and darf_ich_modul_aendern('personal'))
      with check (owner_user_id = mein_chef_id() and darf_ich_modul_aendern('personal'));
  end if;
end $$;

select (select count(*) from pg_tables where schemaname='public' and tablename='hr_ausfall')
       || '|' || (select count(*) from pg_policies where tablename='hr_ausfall') as kontrolle_1_2;
