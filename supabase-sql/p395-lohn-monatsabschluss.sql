-- ============================================================
-- ARGONAUT OS · Paket 395 · LK5 Teil 2 Lohnvorbereitung: Freigabe + Sperre
--
-- ACHTUNG (vorher lesen): Nach der Freigabe eines Monats fuer einen Mitarbeiter
-- sind seine Zeiten (hr_zeiterfassung) und Ausfallstunden (hr_ausfall) in diesem
-- Monat GESPERRT — auch fuer den Chef. Neues Stempeln im laufenden Monat bleibt
-- moeglich. Korrektur nur, indem der Chef den Abschluss mit Grund aufhebt
-- (bleibt als Storno sichtbar), dann aendern, dann neu freigeben.
--
-- ADDITIV UND IDEMPOTENT: neue Tabelle lohn_monatsabschluss, Waechter-Trigger
-- auf hr_zeiterfassung und hr_ausfall. Keine Daten geaendert.
-- Rueckweg (nur nach Absprache):
--   drop trigger if exists p395_zeit_gesperrt on public.hr_zeiterfassung;
--   drop trigger if exists p395_ausfall_gesperrt on public.hr_ausfall;
-- ============================================================

create table if not exists public.lohn_monatsabschluss (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default auth.uid(),
  mitarbeiter_id   uuid not null,
  monat            text not null check (monat ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  werte            jsonb not null,
  freigegeben_von  uuid default auth.uid(),
  freigegeben_name text,
  freigegeben_am   timestamptz not null default now(),
  storniert_am     timestamptz,
  storno_grund     text check (storno_grund is null or char_length(btrim(storno_grund)) >= 10)
);
create unique index if not exists lohn_monatsabschluss_aktiv_uq
  on public.lohn_monatsabschluss (owner_user_id, mitarbeiter_id, monat) where storniert_am is null;
create index if not exists lohn_monatsabschluss_owner_idx on public.lohn_monatsabschluss (owner_user_id, monat);

-- Abschluss: nur anlegen; aendern nur zum Aufheben (Storno einmalig, mit Grund); nie loeschen
create or replace function public.p395_abschluss_fest() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Monatsabschluesse koennen nicht geloescht werden.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.freigegeben_am := now();
    new.freigegeben_von := auth.uid();
    new.storniert_am := null; new.storno_grund := null;
    return new;
  end if;
  if old.storniert_am is not null then
    raise exception 'Abschluss ist bereits aufgehoben.' using errcode = 'P0001';
  end if;
  if new.storniert_am is null or new.storno_grund is null
     or (to_jsonb(new) - 'storniert_am' - 'storno_grund') <> (to_jsonb(old) - 'storniert_am' - 'storno_grund') then
    raise exception 'Ein Monatsabschluss kann nur mit Grund aufgehoben, nicht geaendert werden.' using errcode = 'P0001';
  end if;
  new.storniert_am := now();
  return new;
end $$;
drop trigger if exists p395_abschluss_fest on public.lohn_monatsabschluss;
create trigger p395_abschluss_fest before insert or update or delete on public.lohn_monatsabschluss
  for each row execute function public.p395_abschluss_fest();

-- Gesperrter Monat? (security definer: Mitarbeiter sehen die Abschluesse nicht)
create or replace function public.p395_monat_gesperrt(p_owner uuid, p_ma uuid, p_datum date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lohn_monatsabschluss a
                  where a.owner_user_id = p_owner and a.mitarbeiter_id = p_ma
                    and a.monat = to_char(p_datum, 'YYYY-MM') and a.storniert_am is null)
$$;

create or replace function public.p395_zeile_gesperrt() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.datum is not null
     and public.p395_monat_gesperrt(old.owner_user_id, old.mitarbeiter_id, old.datum) then
    raise exception 'Der Monat ist fuer die Lohnvorbereitung freigegeben und gesperrt.' using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.datum is not null
     and public.p395_monat_gesperrt(new.owner_user_id, new.mitarbeiter_id, new.datum) then
    raise exception 'Der Monat ist fuer die Lohnvorbereitung freigegeben und gesperrt.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists p395_zeit_gesperrt on public.hr_zeiterfassung;
create trigger p395_zeit_gesperrt before insert or update or delete on public.hr_zeiterfassung
  for each row execute function public.p395_zeile_gesperrt();
do $$ begin
  if to_regclass('public.hr_ausfall') is not null then
    execute 'drop trigger if exists p395_ausfall_gesperrt on public.hr_ausfall';
    execute 'create trigger p395_ausfall_gesperrt before insert or update or delete on public.hr_ausfall for each row execute function public.p395_zeile_gesperrt()';
  end if;
end $$;

alter table public.lohn_monatsabschluss enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='lohn_monatsabschluss' and policyname='lohn_monatsabschluss_chef') then
    create policy lohn_monatsabschluss_chef on public.lohn_monatsabschluss for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
end $$;

select (select count(*) from pg_trigger where tgname in ('p395_abschluss_fest', 'p395_zeit_gesperrt', 'p395_ausfall_gesperrt'))
       || '|' || (select count(*) from pg_policies where tablename = 'lohn_monatsabschluss') as kontrolle_3_1;
