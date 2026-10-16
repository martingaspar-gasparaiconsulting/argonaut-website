-- ARGONAUT OS · p409 · VK3 Termin-Verteilung auf Closer (16.10.2026) · additiv, mehrfach ausfuehrbar
-- Eine Zeile je Betrieb: Modus (aus / reihum / freie_zeit), welche Terminarten Verkaufsgespraeche sind,
-- Regeln aus den Qualifizierungs-Antworten (VK2). Nur die Geschaeftsleitung schreibt, das Team liest.
create table if not exists public.vk_verteilung (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique default coalesce(public.mein_chef_id(), auth.uid()),
  modus text not null default 'aus' check (modus in ('aus','reihum','freie_zeit')),
  termin_art_ids uuid[] not null default '{}',
  regeln jsonb not null default '[]'::jsonb check (jsonb_typeof(regeln) = 'array'),
  aktualisiert_am timestamptz not null default now()
);
alter table public.vk_verteilung enable row level security;
revoke all on public.vk_verteilung from anon;
drop policy if exists p409_owner on public.vk_verteilung;
create policy p409_owner on public.vk_verteilung for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p409_ma on public.vk_verteilung;
create policy p409_ma on public.vk_verteilung for select to authenticated using (owner_user_id = public.mein_chef_id());

-- Warum ein Termin bei diesem Closer gelandet ist (nur Anzeige; leer = von Hand)
do $$
begin
  if to_regclass('public.termine') is not null then
    alter table public.termine add column if not exists verteilt_grund text;
  end if;
end $$;

-- Kontrolle: erwartet 1|2|1
select (select count(*) from information_schema.tables where table_schema='public' and table_name='vk_verteilung')
  || '|' || (select count(*) from pg_policies where schemaname='public' and tablename='vk_verteilung')
  || '|' || (select count(*) from information_schema.columns where table_schema='public' and table_name='termine' and column_name='verteilt_grund') as kontrolle;
