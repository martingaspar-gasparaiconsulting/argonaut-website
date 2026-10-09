-- ============================================================================
-- ARGONAUT OS · Paket 289 (09.10.2026) · F1a Führerscheinkontrolle
--
--   fuehrerschein_kontrolle      je Kontrolle eine Zeile: wer (Mitarbeiter
--                                bzw. Name), Klassen, Ablauf des Kartendokuments,
--                                geprüft am/von, Ergebnis, nächste Kontrolle.
--                                KEINE Führerscheinnummer, KEINE Kopie.
--                                Einträge sind ein Nachweis: nicht änderbar
--                                (nur löschen durch den Chef, z. B. nach Austritt).
--   rechts_freigabe_besteht()    gibt es für den eigenen Betrieb eine gültige,
--                                nicht widerrufene Freigabe? (Datenbank-Sperre:
--                                ohne Freigabe „Führerscheinkontrolle" kann
--                                niemand eine Kontrolle eintragen)
--
-- Additiv und mehrfach ausführbar. Braucht Paket 287 (rechts_freigabe).
-- Rechte: Chef alles (löschen nur Chef). Mitarbeiter mit Schreibrecht
-- „erp" oder „logistik" (Fuhrpark) sehen und tragen ein. Ändern: niemand.
-- AUSSPERR-RISIKO: keines — nur neue Tabelle und neue Funktion.
-- ============================================================================

begin;

create or replace function public.rechts_freigabe_besteht(p_funktion text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  return exists (
    select 1
      from public.rechts_freigabe r
     where r.owner_user_id = coalesce(public.mein_chef_id(), v_uid)
       and r.funktion = p_funktion
       and r.widerrufen_am is null
       and r.gueltig_bis > now()
  );
end;
$$;
revoke all on function public.rechts_freigabe_besteht(text) from public, anon;
grant execute on function public.rechts_freigabe_besteht(text) to authenticated, service_role;

create table if not exists public.fuehrerschein_kontrolle (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  mitarbeiter_id        uuid,
  person_name           text not null check (char_length(person_name) between 2 and 120),
  klassen               text check (klassen is null or klassen ~ '^[A-Z0-9, ]{1,60}$'),
  dokument_gueltig_bis  date,
  geprueft_am           date not null,
  geprueft_von          uuid default auth.uid(),
  geprueft_name         text check (geprueft_name is null or char_length(geprueft_name) <= 120),
  ergebnis              text not null default 'gueltig' check (ergebnis in ('gueltig', 'mangel')),
  bemerkung             text check (bemerkung is null or char_length(bemerkung) <= 300),
  naechste_am           date not null,
  erstellt_am           timestamptz not null default now(),
  check (naechste_am >= geprueft_am)
);
create index if not exists fuehrerschein_kontrolle_idx on public.fuehrerschein_kontrolle (owner_user_id, person_name, geprueft_am desc);

-- Fremdschlüssel zum Mitarbeiter nur, wenn mitarbeiter.id wirklich uuid ist
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='mitarbeiter' and column_name='id' and data_type='uuid')
     and not exists (select 1 from pg_constraint where conname='fuehrerschein_kontrolle_ma_fk') then
    alter table public.fuehrerschein_kontrolle add constraint fuehrerschein_kontrolle_ma_fk
      foreign key (mitarbeiter_id) references public.mitarbeiter(id) on delete set null;
  end if;
end $$;

-- Nachweis: Einträge lassen sich nicht ändern (Fehler = löschen und neu eintragen).
-- Ausnahme: das Löschen des Mitarbeiters setzt mitarbeiter_id auf null.
create or replace function public.p289_kontrolle_sperre()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.mitarbeiter_id is null and old.mitarbeiter_id is not null
     and (to_jsonb(new) - 'mitarbeiter_id') = (to_jsonb(old) - 'mitarbeiter_id') then
    return new;
  end if;
  raise exception 'Eine Führerscheinkontrolle ist ein Nachweis und kann nicht geändert werden. Bei einem Fehler löschen und neu eintragen.';
end;
$$;
drop trigger if exists p289_kontrolle_sperre_trg on public.fuehrerschein_kontrolle;
create trigger p289_kontrolle_sperre_trg before update on public.fuehrerschein_kontrolle
  for each row execute function public.p289_kontrolle_sperre();
revoke all on function public.p289_kontrolle_sperre() from public, anon, authenticated;

alter table public.fuehrerschein_kontrolle enable row level security;

drop policy if exists fsk_chef_select on public.fuehrerschein_kontrolle;
create policy fsk_chef_select on public.fuehrerschein_kontrolle for select to authenticated
  using (owner_user_id = auth.uid());
drop policy if exists fsk_chef_insert on public.fuehrerschein_kontrolle;
create policy fsk_chef_insert on public.fuehrerschein_kontrolle for insert to authenticated
  with check (owner_user_id = auth.uid() and public.rechts_freigabe_besteht('fuehrerschein'));
drop policy if exists fsk_chef_delete on public.fuehrerschein_kontrolle;
create policy fsk_chef_delete on public.fuehrerschein_kontrolle for delete to authenticated
  using (owner_user_id = auth.uid());
drop policy if exists fsk_ma_select on public.fuehrerschein_kontrolle;
create policy fsk_ma_select on public.fuehrerschein_kontrolle for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_aendern('erp') or public.darf_ich_modul_aendern('logistik')));
drop policy if exists fsk_ma_insert on public.fuehrerschein_kontrolle;
create policy fsk_ma_insert on public.fuehrerschein_kontrolle for insert to authenticated
  with check (owner_user_id = public.mein_chef_id()
    and (public.darf_ich_modul_aendern('erp') or public.darf_ich_modul_aendern('logistik'))
    and public.rechts_freigabe_besteht('fuehrerschein'));

commit;

-- KONTROLLE (nur lesen) — Erwartung: true | 5 | 1 | false
select to_regclass('public.fuehrerschein_kontrolle') is not null as tabelle,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'fuehrerschein_kontrolle') as regeln,
       (select count(*) from pg_trigger where tgname = 'p289_kontrolle_sperre_trg') as sperre,
       has_function_privilege('anon', 'public.rechts_freigabe_besteht(text)', 'execute') as anon_darf;
