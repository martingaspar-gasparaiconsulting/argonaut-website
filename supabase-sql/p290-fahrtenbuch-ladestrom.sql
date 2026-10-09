-- ============================================================================
-- ARGONAUT OS · Paket 290 (09.10.2026) · F1b Fahrtenbuch und Ladestrom
--
--   fahrtenbuch_fahrt        je Fahrt eine Zeile: Fahrzeug, Datum, km Beginn/
--                            Ende, Art (dienstlich, privat, Arbeitsweg), Ziel,
--                            Zweck, Geschäftspartner, Fahrer, wann erfasst
--   fahrtenbuch_aenderung    jede Änderung und jedes Löschen mit altem Stand,
--                            Grund, wer, wann — schreibt NUR die Datenbank,
--                            nicht änderbar, nicht löschbar
--   fahrtenbuch_abschluss    abgeschlossene Monate je Fahrzeug: danach sind
--                            Fahrten dieses Monats gesperrt (kein Neu, kein
--                            Ändern, kein Löschen)
--   ladestrom_erstattung     Ladestrom zu Hause je Monat: Zählerstände, Preis
--                            je kWh laut Stromvertrag, Betrag in Cent
--
-- Ändern einer Fahrt nur mit Grund (Spalte aenderung_grund, mind. 5 Zeichen).
-- Additiv, mehrfach ausführbar. Rechte: Chef alles; Mitarbeiter mit
-- Schreibrecht „erp" oder „logistik" sehen, tragen ein und ändern mit Grund;
-- löschen und Monate abschließen nur der Chef.
-- AUSSPERR-RISIKO: keines — nur neue Tabellen.
-- ============================================================================

begin;

create table if not exists public.fahrtenbuch_fahrt (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  fahrzeug_id      uuid not null,
  datum            date not null,
  km_start         integer not null check (km_start between 0 and 5000000),
  km_ende          integer not null check (km_ende between 0 and 5000000),
  art              text not null check (art in ('dienst', 'privat', 'arbeitsweg')),
  start_ort        text check (start_ort is null or char_length(start_ort) <= 120),
  ziel             text check (ziel is null or char_length(ziel) <= 200),
  zweck            text check (zweck is null or char_length(zweck) <= 200),
  partner          text check (partner is null or char_length(partner) <= 120),
  fahrer_name      text check (fahrer_name is null or char_length(fahrer_name) <= 120),
  erfasst_am       timestamptz not null default now(),
  erfasst_von      uuid default auth.uid(),
  aenderung_grund  text check (aenderung_grund is null or char_length(aenderung_grund) <= 300),
  check (km_ende > km_start and km_ende - km_start <= 5000),
  check (art <> 'dienst' or (ziel is not null and zweck is not null))
);
create index if not exists fahrtenbuch_fahrt_idx on public.fahrtenbuch_fahrt (owner_user_id, fahrzeug_id, datum, km_start);

create table if not exists public.fahrtenbuch_aenderung (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  fahrt_id      uuid not null,
  aktion        text not null check (aktion in ('geaendert', 'geloescht')),
  alt           jsonb not null,
  neu           jsonb,
  grund         text,
  geaendert_von uuid,
  geaendert_am  timestamptz not null default now()
);
create index if not exists fahrtenbuch_aenderung_idx on public.fahrtenbuch_aenderung (owner_user_id, fahrt_id, geaendert_am);

create table if not exists public.fahrtenbuch_abschluss (
  owner_user_id    uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  fahrzeug_id      uuid not null,
  monat            date not null check (extract(day from monat) = 1),
  abgeschlossen_am timestamptz not null default now(),
  abgeschlossen_von uuid default auth.uid(),
  primary key (owner_user_id, fahrzeug_id, monat)
);

create table if not exists public.ladestrom_erstattung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  mitarbeiter_id  uuid,
  person_name     text not null check (char_length(person_name) between 2 and 120),
  fahrzeug_id     uuid,
  monat           date not null check (extract(day from monat) = 1),
  zaehler_anfang  numeric(12,2) not null check (zaehler_anfang >= 0),
  zaehler_ende    numeric(12,2) not null,
  preis_kwh_cent  numeric(8,3) not null check (preis_kwh_cent > 0 and preis_kwh_cent <= 200),
  kwh             numeric(12,2) not null,
  betrag_cent     integer not null check (betrag_cent >= 0),
  beleg_notiz     text check (beleg_notiz is null or char_length(beleg_notiz) <= 200),
  status          text not null default 'offen' check (status in ('offen', 'erstattet')),
  erstattet_am    date,
  erfasst_am      timestamptz not null default now(),
  erfasst_von     uuid default auth.uid(),
  check (zaehler_ende >= zaehler_anfang),
  check (kwh = zaehler_ende - zaehler_anfang),
  unique (owner_user_id, person_name, fahrzeug_id, monat)
);

-- Fremdschlüssel nur, wenn fahrzeuge.id / mitarbeiter.id wirklich uuid sind
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='fahrzeuge' and column_name='id' and data_type='uuid') then
    if not exists (select 1 from pg_constraint where conname='fahrtenbuch_fahrt_fz_fk') then
      alter table public.fahrtenbuch_fahrt add constraint fahrtenbuch_fahrt_fz_fk foreign key (fahrzeug_id) references public.fahrzeuge(id) on delete restrict;
    end if;
    if not exists (select 1 from pg_constraint where conname='ladestrom_erstattung_fz_fk') then
      alter table public.ladestrom_erstattung add constraint ladestrom_erstattung_fz_fk foreign key (fahrzeug_id) references public.fahrzeuge(id) on delete set null;
    end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='mitarbeiter' and column_name='id' and data_type='uuid')
     and not exists (select 1 from pg_constraint where conname='ladestrom_erstattung_ma_fk') then
    alter table public.ladestrom_erstattung add constraint ladestrom_erstattung_ma_fk foreign key (mitarbeiter_id) references public.mitarbeiter(id) on delete set null;
  end if;
end $$;

-- Wächter: abgeschlossene Monate sperren, Änderungen nur mit Grund, alles protokollieren
create or replace function public.p290_fahrt_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_fz uuid;
  v_tag date;
begin
  if tg_op = 'DELETE' then
    v_owner := old.owner_user_id; v_fz := old.fahrzeug_id; v_tag := old.datum;
  else
    v_owner := new.owner_user_id; v_fz := new.fahrzeug_id; v_tag := new.datum;
  end if;
  if exists (select 1 from public.fahrtenbuch_abschluss a where a.owner_user_id = v_owner and a.fahrzeug_id = v_fz and a.monat = date_trunc('month', v_tag)::date) then
    raise exception 'Der Monat ist im Fahrtenbuch abgeschlossen — Fahrten darin lassen sich nicht mehr anlegen, ändern oder löschen.';
  end if;
  if tg_op = 'UPDATE' then
    if exists (select 1 from public.fahrtenbuch_abschluss a where a.owner_user_id = old.owner_user_id and a.fahrzeug_id = old.fahrzeug_id and a.monat = date_trunc('month', old.datum)::date) then
      raise exception 'Der Monat ist im Fahrtenbuch abgeschlossen — Fahrten darin lassen sich nicht mehr ändern.';
    end if;
    if new.owner_user_id <> old.owner_user_id or new.erfasst_am <> old.erfasst_am or new.erfasst_von is distinct from old.erfasst_von then
      raise exception 'Besitzer und Erfassungszeit einer Fahrt sind unveränderlich.';
    end if;
    if coalesce(char_length(trim(new.aenderung_grund)), 0) < 5 or new.aenderung_grund is not distinct from old.aenderung_grund then
      raise exception 'Eine Fahrt lässt sich nur mit Angabe eines neuen Grundes ändern (mindestens 5 Zeichen).';
    end if;
    insert into public.fahrtenbuch_aenderung (owner_user_id, fahrt_id, aktion, alt, neu, grund, geaendert_von)
      values (old.owner_user_id, old.id, 'geaendert', to_jsonb(old), to_jsonb(new), new.aenderung_grund, auth.uid());
    return new;
  end if;
  if tg_op = 'DELETE' then
    insert into public.fahrtenbuch_aenderung (owner_user_id, fahrt_id, aktion, alt, neu, grund, geaendert_von)
      values (old.owner_user_id, old.id, 'geloescht', to_jsonb(old), null, null, auth.uid());
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists p290_fahrt_waechter_trg on public.fahrtenbuch_fahrt;
create trigger p290_fahrt_waechter_trg before insert or update or delete on public.fahrtenbuch_fahrt
  for each row execute function public.p290_fahrt_waechter();
revoke all on function public.p290_fahrt_waechter() from public, anon, authenticated;

create or replace function public.p290_aenderung_sperre()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Das Änderungsprotokoll des Fahrtenbuchs ist ein Nachweis und kann nicht geändert oder gelöscht werden.';
end;
$$;
drop trigger if exists p290_aenderung_sperre_trg on public.fahrtenbuch_aenderung;
create trigger p290_aenderung_sperre_trg before update or delete on public.fahrtenbuch_aenderung
  for each row execute function public.p290_aenderung_sperre();
revoke all on function public.p290_aenderung_sperre() from public, anon, authenticated;

alter table public.fahrtenbuch_fahrt enable row level security;
alter table public.fahrtenbuch_aenderung enable row level security;
alter table public.fahrtenbuch_abschluss enable row level security;
alter table public.ladestrom_erstattung enable row level security;

-- Fahrten: Chef alles; Mitarbeiter mit Schreibrecht Fuhrpark sehen, tragen ein, ändern (mit Grund)
drop policy if exists fbf_chef_all on public.fahrtenbuch_fahrt;
create policy fbf_chef_all on public.fahrtenbuch_fahrt for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists fbf_ma_select on public.fahrtenbuch_fahrt;
create policy fbf_ma_select on public.fahrtenbuch_fahrt for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_aendern('erp') or public.darf_ich_modul_aendern('logistik')));
drop policy if exists fbf_ma_insert on public.fahrtenbuch_fahrt;
create policy fbf_ma_insert on public.fahrtenbuch_fahrt for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_aendern('erp') or public.darf_ich_modul_aendern('logistik')));
drop policy if exists fbf_ma_update on public.fahrtenbuch_fahrt;
create policy fbf_ma_update on public.fahrtenbuch_fahrt for update to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_aendern('erp') or public.darf_ich_modul_aendern('logistik')))
  with check (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_aendern('erp') or public.darf_ich_modul_aendern('logistik')));

-- Änderungsprotokoll: nur lesen
drop policy if exists fba_chef_select on public.fahrtenbuch_aenderung;
create policy fba_chef_select on public.fahrtenbuch_aenderung for select to authenticated
  using (owner_user_id = auth.uid());
drop policy if exists fba_ma_select on public.fahrtenbuch_aenderung;
create policy fba_ma_select on public.fahrtenbuch_aenderung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_aendern('erp') or public.darf_ich_modul_aendern('logistik')));

-- Monatsabschluss: Chef legt an (aufheben geht nicht), Mitarbeiter sehen
drop policy if exists fbm_chef_select on public.fahrtenbuch_abschluss;
create policy fbm_chef_select on public.fahrtenbuch_abschluss for select to authenticated
  using (owner_user_id = auth.uid());
drop policy if exists fbm_chef_insert on public.fahrtenbuch_abschluss;
create policy fbm_chef_insert on public.fahrtenbuch_abschluss for insert to authenticated
  with check (owner_user_id = auth.uid());
drop policy if exists fbm_ma_select on public.fahrtenbuch_abschluss;
create policy fbm_ma_select on public.fahrtenbuch_abschluss for select to authenticated
  using (owner_user_id = public.mein_chef_id());

-- Ladestrom: Chef alles; Mitarbeiter mit Schreibrecht Fuhrpark sehen und tragen ein (Status setzt nur der Chef)
drop policy if exists lse_chef_all on public.ladestrom_erstattung;
create policy lse_chef_all on public.ladestrom_erstattung for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists lse_ma_select on public.ladestrom_erstattung;
create policy lse_ma_select on public.ladestrom_erstattung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_aendern('erp') or public.darf_ich_modul_aendern('logistik')));
drop policy if exists lse_ma_insert on public.ladestrom_erstattung;
create policy lse_ma_insert on public.ladestrom_erstattung for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and status = 'offen'
    and (public.darf_ich_modul_aendern('erp') or public.darf_ich_modul_aendern('logistik')));

commit;

-- KONTROLLE (nur lesen) — Erwartung: 4 | 12 | 2
select (select count(*) from information_schema.tables where table_schema = 'public'
          and table_name in ('fahrtenbuch_fahrt', 'fahrtenbuch_aenderung', 'fahrtenbuch_abschluss', 'ladestrom_erstattung')) as tabellen,
       (select count(*) from pg_policies where schemaname = 'public'
          and tablename in ('fahrtenbuch_fahrt', 'fahrtenbuch_aenderung', 'fahrtenbuch_abschluss', 'ladestrom_erstattung')) as regeln,
       (select count(*) from pg_trigger where tgname in ('p290_fahrt_waechter_trg', 'p290_aenderung_sperre_trg')) as waechter;
