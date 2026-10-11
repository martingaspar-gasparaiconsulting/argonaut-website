-- ============================================================
-- ARGONAUT OS · Paket 309 (11.10.2026) · SP1 „Was ARGONAUT Ihnen gespart hat"
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht, keine bestehende
-- Regel geändert. Sperrt niemanden aus.
--  1) eingangsbelege + skonto_abzug: beim Bezahlen eines Lieferanten-Belegs
--     trägt der Betrieb den gezogenen Skonto-Betrag ein (leer = kein Skonto).
--     Die Rechte der Tabelle bleiben, wie sie sind.
--  2) Neue Tabelle ersparnis_angabe — NUR die Geschäftsleitung:
--     · altprogramm: was ein abgelöstes Programm im Monat gekostet hat und
--       ab wann es nicht mehr bezahlt wird
--     · thg: ausgezahlte THG-Prämie (Fahrzeug/Kennzeichen, Betrag, Datum)
--     Mitarbeiter sehen und ändern nichts (keine Mitarbeiter-Regel).
-- Die Einwilligung zum Teilen liegt in modul_einstellung „ersparnis"
-- (Paket 259: Chef schreibt) — dafür ist kein SQL nötig.
-- ============================================================

-- 1) Skonto am Eingangsbeleg ----------------------------------------------------
alter table public.eingangsbelege add column if not exists skonto_abzug numeric(12,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'eingangsbelege_skonto_chk') then
    alter table public.eingangsbelege add constraint eingangsbelege_skonto_chk
      check (skonto_abzug is null or (skonto_abzug > 0 and skonto_abzug <= 100000)) not valid;
  end if;
end $$;
comment on column public.eingangsbelege.skonto_abzug is 'Paket 309: beim Bezahlen gezogener Skonto in Euro (leer = kein Skonto); Vorsteuer-Korrektur nach § 17 UStG macht der Steuerberater';

-- 2) Angaben der Geschäftsleitung -------------------------------------------------
create table if not exists public.ersparnis_angabe (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null default auth.uid(),
  art            text not null check (art in ('altprogramm', 'thg')),
  bezeichnung    text not null check (char_length(bezeichnung) between 2 and 120),
  altsystem_key  text check (altsystem_key is null or char_length(altsystem_key) between 1 and 60),
  betrag_cent    integer not null check (betrag_cent > 0 and betrag_cent <= 10000000),
  je             text not null check (je in ('monat', 'einmal')),
  ab             date not null,
  notiz          text check (notiz is null or char_length(notiz) <= 300),
  erstellt_am    timestamptz not null default now(),
  geaendert_am   timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ersparnis_angabe_art_chk') then
    alter table public.ersparnis_angabe add constraint ersparnis_angabe_art_chk check (
      (art = 'altprogramm' and je = 'monat')
      or (art = 'thg' and je = 'einmal' and altsystem_key is null));
  end if;
end $$;

create index if not exists ersparnis_angabe_owner_idx on public.ersparnis_angabe (owner_user_id, art, ab);
-- Ein Programm hat höchstens einen Kosten-Eintrag je Betrieb
create unique index if not exists ersparnis_angabe_programm_uq
  on public.ersparnis_angabe (owner_user_id, altsystem_key) where art = 'altprogramm' and altsystem_key is not null;

alter table public.ersparnis_angabe enable row level security;

-- Nur die Geschäftsleitung (eigener Betrieb, kein Mitarbeiter-Konto)
drop policy if exists ersp_chef_select on public.ersparnis_angabe;
create policy ersp_chef_select on public.ersparnis_angabe for select to authenticated
  using (auth.uid() = owner_user_id and public.mein_chef_id() is null);
drop policy if exists ersp_chef_insert on public.ersparnis_angabe;
create policy ersp_chef_insert on public.ersparnis_angabe for insert to authenticated
  with check (auth.uid() = owner_user_id and public.mein_chef_id() is null);
drop policy if exists ersp_chef_update on public.ersparnis_angabe;
create policy ersp_chef_update on public.ersparnis_angabe for update to authenticated
  using (auth.uid() = owner_user_id and public.mein_chef_id() is null)
  with check (auth.uid() = owner_user_id and public.mein_chef_id() is null);
drop policy if exists ersp_chef_delete on public.ersparnis_angabe;
create policy ersp_chef_delete on public.ersparnis_angabe for delete to authenticated
  using (auth.uid() = owner_user_id and public.mein_chef_id() is null);

-- Besitzer bleibt fest, Änderungszeit wird gesetzt
create or replace function public.p309_angabe_waechter()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'UPDATE' then
    if new.owner_user_id is distinct from old.owner_user_id then
      raise exception 'Der Besitzer einer Angabe kann nicht geändert werden.';
    end if;
    new.erstellt_am := old.erstellt_am;
  end if;
  new.geaendert_am := now();
  return new;
end $$;

drop trigger if exists p309_angabe_waechter on public.ersparnis_angabe;
create trigger p309_angabe_waechter before insert or update on public.ersparnis_angabe
  for each row execute function public.p309_angabe_waechter();

grant select, insert, update, delete on public.ersparnis_angabe to authenticated;

comment on table public.ersparnis_angabe is 'Paket 309: Angaben der Geschäftsleitung für „Was ARGONAUT Ihnen gespart hat" (Kosten abgelöster Programme, ausgezahlte THG-Prämien)';

-- KONTROLLE — Erwartung: skonto_spalte = 1 | tabelle = 1 | regeln = 4 | ausloeser = 1 | pruefregeln = 2
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'eingangsbelege' and column_name = 'skonto_abzug') as skonto_spalte,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'ersparnis_angabe') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ersparnis_angabe') as regeln,
  (select count(*) from pg_trigger where tgname = 'p309_angabe_waechter' and not tgisinternal) as ausloeser,
  (select count(*) from pg_constraint where conname in ('eingangsbelege_skonto_chk', 'ersparnis_angabe_art_chk')) as pruefregeln;
