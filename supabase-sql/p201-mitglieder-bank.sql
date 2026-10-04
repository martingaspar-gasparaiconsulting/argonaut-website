-- ============================================================
-- ARGONAUT OS · Paket 201 (04.10.2026) · Mitglieder-Bankdaten schützen
-- Entscheidungsrunde Block 2: E4 — GETRENNT geliefert (Aussperr-Hinweis)
--
-- BEFUND (Leseabfrage 04.10.): Die alte Regel mgd_select_ma lässt JEDEN
-- Mitarbeiter des Betriebs ALLE Mitglieder lesen — samt IBAN, BIC und
-- Mandat. Die Regel p181_ma_select (nur mit Mitglieder-Recht) war dadurch
-- wirkungslos, weil erlaubende Regeln mit ODER verknüpft werden.
-- Live stehen 0 IBANs in der Tabelle — es wird also nichts sichtbar verschoben.
--
-- WAS PASSIERT:
-- 1) Neue Tabelle mitglieder_bank (je Mitglied eine Zeile: IBAN, BIC,
--    Mandatsreferenz, Mandatsdatum). Lesen und Ändern: Chef bzw. Mitarbeiter
--    mit Mitglieder-SCHREIBrecht. Wer nur lesen darf, sieht keine Bankdaten.
-- 2) Vorhandene Bankdaten werden einmal hinüberkopiert (live 0).
-- 3) Schutz-Trigger auf mitglieder: Kommen Bankdaten doch noch in die alten
--    Spalten (alter Seitenstand, Import), wandern sie sofort in
--    mitglieder_bank, die alten Spalten bleiben leer. Löschen eines Mitglieds
--    löscht seine Bankzeile mit.
-- 4) Die Regel mgd_select_ma wird ENTFERNT.
--    AUSSPERR-HINWEIS (gewollt, Entscheidung E4): Mitarbeiter OHNE
--    Mitglieder-Recht sehen danach die Mitglieder-Liste nicht mehr (auch nicht
--    Check-in). Wer sie braucht, bekommt im Rechte-Bereich „Mitglieder sehen".
--    Chef und Mitarbeiter mit Mitglieder-Recht: keine Änderung.
-- 5) Zwei-Faktor-Regel (164·3) auf die neue Tabelle.
--
-- Spalten in mitglieder werden NICHT gelöscht (additiv).
--
-- RÜCKWEG (nur im Notfall):
--   create policy mgd_select_ma on public.mitglieder for select to public using ((owner_user_id = mein_chef_id()));
--   drop trigger if exists p201_bank_umleiten on public.mitglieder;
--   drop trigger if exists p201_bank_mitloeschen on public.mitglieder;
-- ============================================================

-- 1) Tabelle -----------------------------------------------------------------
create table if not exists public.mitglieder_bank (
  mitglied_id     uuid primary key,          -- bewusst ohne Fremdschluessel (Mitloeschen per Trigger)
  owner_user_id   uuid not null,
  iban            text,
  bic             text,
  mandatsreferenz text,
  mandat_datum    date,
  geaendert_am    timestamptz not null default now(),
  geaendert_von   uuid default auth.uid()
);
create index if not exists mitglieder_bank_owner_idx on public.mitglieder_bank (owner_user_id);

comment on table public.mitglieder_bank is
  'Paket 201: Bankdaten der Mitglieder getrennt von der Mitglieder-Liste. Lesen/Aendern nur Chef bzw. Mitglieder-Schreibrecht.';

alter table public.mitglieder_bank enable row level security;

drop policy if exists p201_bank_chef on public.mitglieder_bank;
create policy p201_bank_chef on public.mitglieder_bank for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists p201_bank_ma on public.mitglieder_bank;
create policy p201_bank_ma on public.mitglieder_bank for all to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('mitglieder'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('mitglieder'));

revoke all on public.mitglieder_bank from anon;
grant select, insert, update, delete on public.mitglieder_bank to authenticated;
grant all on public.mitglieder_bank to service_role;

-- Besitzer = Betrieb des Mitglieds (nie vom Browser), Zeitstempel + Person
create or replace function public.p201_bank_besitzer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  select m.owner_user_id into v_owner from public.mitglieder m where m.id = new.mitglied_id;
  if v_owner is null then
    raise exception 'p201: Mitglied nicht gefunden' using errcode = '23503';
  end if;
  new.owner_user_id := v_owner;
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  new.iban := nullif(upper(regexp_replace(coalesce(new.iban, ''), '\s+', '', 'g')), '');
  new.bic := nullif(upper(regexp_replace(coalesce(new.bic, ''), '\s+', '', 'g')), '');
  new.mandatsreferenz := nullif(btrim(coalesce(new.mandatsreferenz, '')), '');
  return new;
end;
$$;

drop trigger if exists p201_bank_besitzer on public.mitglieder_bank;
create trigger p201_bank_besitzer
  before insert or update on public.mitglieder_bank
  for each row execute function public.p201_bank_besitzer();

-- 2) Vorhandene Bankdaten einmal kopieren (live 0) ---------------------------------
insert into public.mitglieder_bank (mitglied_id, owner_user_id, iban, bic, mandatsreferenz, mandat_datum)
select m.id, m.owner_user_id, m.iban, m.bic, m.mandatsreferenz, m.mandat_datum
  from public.mitglieder m
 where m.iban is not null or m.bic is not null or m.mandatsreferenz is not null or m.mandat_datum is not null
on conflict (mitglied_id) do nothing;

-- 3) Schutz-Trigger: Bankdaten nie mehr in mitglieder ------------------------------
create or replace function public.p201_bank_umleiten()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.iban is not null or new.bic is not null or new.mandatsreferenz is not null or new.mandat_datum is not null then
    insert into public.mitglieder_bank (mitglied_id, owner_user_id, iban, bic, mandatsreferenz, mandat_datum)
    values (new.id, new.owner_user_id, new.iban, new.bic, new.mandatsreferenz, new.mandat_datum)
    on conflict (mitglied_id) do update
      set iban = coalesce(excluded.iban, mitglieder_bank.iban),
          bic = coalesce(excluded.bic, mitglieder_bank.bic),
          mandatsreferenz = coalesce(excluded.mandatsreferenz, mitglieder_bank.mandatsreferenz),
          mandat_datum = coalesce(excluded.mandat_datum, mitglieder_bank.mandat_datum);
    new.iban := null;
    new.bic := null;
    new.mandatsreferenz := null;
    new.mandat_datum := null;
  end if;
  return new;
end;
$$;

-- AFTER der Besitzer-Regel (p181_besitzer laeuft alphabetisch vorher), aber
-- als BEFORE-Trigger, damit die alten Spalten leer gespeichert werden.
-- Beim INSERT existiert die Mitglieds-Zeile noch nicht -> die Bank-Zeile wird
-- im AFTER-Trigger angelegt (siehe unten), hier nur beim UPDATE.
drop trigger if exists p201_bank_umleiten on public.mitglieder;
create trigger p201_bank_umleiten
  before update on public.mitglieder
  for each row execute function public.p201_bank_umleiten();

create or replace function public.p201_bank_neu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.iban is not null or new.bic is not null or new.mandatsreferenz is not null or new.mandat_datum is not null then
    insert into public.mitglieder_bank (mitglied_id, owner_user_id, iban, bic, mandatsreferenz, mandat_datum)
    values (new.id, new.owner_user_id, new.iban, new.bic, new.mandatsreferenz, new.mandat_datum)
    on conflict (mitglied_id) do nothing;
    update public.mitglieder set iban = null, bic = null, mandatsreferenz = null, mandat_datum = null where id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists p201_bank_neu on public.mitglieder;
create trigger p201_bank_neu
  after insert on public.mitglieder
  for each row execute function public.p201_bank_neu();

create or replace function public.p201_bank_mitloeschen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.mitglieder_bank where mitglied_id = old.id;
  return old;
end;
$$;

drop trigger if exists p201_bank_mitloeschen on public.mitglieder;
create trigger p201_bank_mitloeschen
  after delete on public.mitglieder
  for each row execute function public.p201_bank_mitloeschen();

revoke all on function public.p201_bank_besitzer() from public, anon;
revoke all on function public.p201_bank_umleiten() from public, anon;
revoke all on function public.p201_bank_neu() from public, anon;
revoke all on function public.p201_bank_mitloeschen() from public, anon;

-- Alte Spalten leeren, wo schon kopiert (live 0 Zeilen)
update public.mitglieder m set iban = null, bic = null, mandatsreferenz = null, mandat_datum = null
 where (m.iban is not null or m.bic is not null or m.mandatsreferenz is not null or m.mandat_datum is not null)
   and exists (select 1 from public.mitglieder_bank b where b.mitglied_id = m.id);

-- 4) Die zu weite Leseregel entfernen (AUSSPERR-HINWEIS oben) -----------------------
drop policy if exists mgd_select_ma on public.mitglieder;

-- 5) Zwei-Faktor-Regel (164·3) ---------------------------------------------------
drop policy if exists p164s3_aal on public.mitglieder_bank;
create policy p164s3_aal on public.mitglieder_bank as restrictive for all to authenticated
  using ((select public.p164s3_aal_ok())) with check ((select public.p164s3_aal_ok()));

-- KONTROLLE — Erwartung: tabelle 1 · regeln 3 · trigger 4 · alte_regel 0 · bank_in_alt 0 · zwei_faktor_fehlt 0
-- (mitarbeiter_betroffen = Zugaenge in Betrieben mit Mitgliedern — nur zur Info: wer davon
--  kein Mitglieder-Recht hat, sieht die Liste ab jetzt nicht mehr)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'mitglieder_bank') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mitglieder_bank') as regeln,
  (select count(*) from pg_trigger where tgname in ('p201_bank_besitzer', 'p201_bank_umleiten', 'p201_bank_neu', 'p201_bank_mitloeschen') and not tgisinternal) as trigger,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mitglieder' and policyname = 'mgd_select_ma') as alte_regel,
  (select count(*) from public.mitglieder where iban is not null or bic is not null or mandatsreferenz is not null or mandat_datum is not null) as bank_in_alt,
  (select count(*) from public.mitarbeiter ma where ma.auth_user_id is not null
     and ma.owner_user_id in (select distinct owner_user_id from public.mitglieder)) as mitarbeiter_betroffen,
  (select count(*) from pg_tables t where t.schemaname = 'public' and t.rowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename and p.policyname = 'p164s3_aal')) as zwei_faktor_fehlt;
