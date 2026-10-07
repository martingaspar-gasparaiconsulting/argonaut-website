-- ============================================================
-- ARGONAUT OS · Paket 259 (07.10.2026) · Branchen-Vorlage + K1 Fahrzeugbestand
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) kfz_bestand        Handelsbestand (eigene Tabelle; Kundenfahrzeuge
--                        bleiben in kfz_fahrzeuge, Lebensakte in
--                        werkstatt_fahrzeuge — Verknüpfung später über die FIN)
--  2) kfz_bestand_preis  Preisverlauf, schreibt NUR die Datenbank selbst
--                        (Auslöser bei jeder Preisänderung), nicht änderbar
--  3) modul_einstellung  Einstellungen des Betriebs je Modul (Branchen-
--                        Vorlage + eigene Spalten/Status/Suchen), nur Chef schreibt
-- Rechte wie Paket 181: Besitzer = Betrieb (Auslöser p181_besitzer),
-- Mitarbeiter lesen mit Modul „kfz" (sehen oder ändern), schreiben nur mit
-- Schreibrecht „kfz", löschen nur der Chef.
-- ============================================================

-- 1) Handelsbestand -----------------------------------------------------------
create table if not exists public.kfz_bestand (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  interne_nr      text,
  status          text not null default 'bestand' check (char_length(status) between 1 and 40),
  sparte          text,
  marke           text,
  modell          text,
  variante        text,
  fin             text check (fin is null or fin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  kennzeichen     text,
  erstzulassung   date,
  km_stand        integer check (km_stand is null or km_stand >= 0),
  leistung_kw     integer check (leistung_kw is null or leistung_kw >= 0),
  kraftstoff      text,
  farbe           text,
  farbcode        text,
  standort_id     uuid references public.standorte(id) on delete set null,
  eingang_am      date default current_date,
  verkauft_am     date,
  ek_netto        numeric(12,2) check (ek_netto is null or ek_netto >= 0),
  vk_brutto       numeric(12,2) check (vk_brutto is null or vk_brutto >= 0),
  besteuerung     text check (besteuerung is null or besteuerung in ('25a', 'regel')),
  inseriert       boolean not null default false,
  notiz           text,
  erstellt_von    uuid default auth.uid(),
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists kfz_bestand_owner_idx on public.kfz_bestand (owner_user_id, status);
create index if not exists kfz_bestand_fin_idx on public.kfz_bestand (owner_user_id, fin);
create unique index if not exists kfz_bestand_nr_uq on public.kfz_bestand (owner_user_id, interne_nr) where interne_nr is not null;

-- 2) Preisverlauf --------------------------------------------------------------
create table if not exists public.kfz_bestand_preis (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  bestand_id    uuid not null references public.kfz_bestand(id) on delete cascade,
  vk_alt        numeric(12,2),
  vk_neu        numeric(12,2),
  geaendert_von uuid,
  geaendert_am  timestamptz not null default now()
);
create index if not exists kfz_bestand_preis_idx on public.kfz_bestand_preis (bestand_id, geaendert_am);

create or replace function public.p259_preis_merken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.vk_brutto is not null then
      insert into public.kfz_bestand_preis (owner_user_id, bestand_id, vk_alt, vk_neu, geaendert_von)
      values (new.owner_user_id, new.id, null, new.vk_brutto, auth.uid());
    end if;
  elsif new.vk_brutto is distinct from old.vk_brutto then
    insert into public.kfz_bestand_preis (owner_user_id, bestand_id, vk_alt, vk_neu, geaendert_von)
    values (new.owner_user_id, new.id, old.vk_brutto, new.vk_brutto, auth.uid());
  end if;
  return null;
end $$;

-- 3) Einstellungen je Modul -----------------------------------------------------
create table if not exists public.modul_einstellung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  modul           text not null check (char_length(modul) between 1 and 60),
  einstellung     jsonb not null default '{}'::jsonb,
  aktualisiert_am timestamptz not null default now(),
  unique (owner_user_id, modul)
);

-- Rechte ------------------------------------------------------------------------
alter table public.kfz_bestand enable row level security;
alter table public.kfz_bestand_preis enable row level security;
alter table public.modul_einstellung enable row level security;

-- Auslöser: Besitzer = Betrieb (wie Paket 181), Preisverlauf
drop trigger if exists p181_besitzer on public.kfz_bestand;
create trigger p181_besitzer before insert or update on public.kfz_bestand
  for each row execute function public.p181_besitzer();
drop trigger if exists p259_preis on public.kfz_bestand;
create trigger p259_preis after insert or update of vk_brutto on public.kfz_bestand
  for each row execute function public.p259_preis_merken();

-- kfz_bestand: Chef alles, Mitarbeiter nach Modul „kfz", löschen nur Chef
drop policy if exists kfzb_owner_all on public.kfz_bestand;
create policy kfzb_owner_all on public.kfz_bestand for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_bestand;
create policy p181_ma_select on public.kfz_bestand for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_bestand;
create policy p181_ma_insert on public.kfz_bestand for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_bestand;
create policy p181_ma_update on public.kfz_bestand for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- kfz_bestand_preis: nur lesen (geschrieben wird nur über den Auslöser)
drop policy if exists kfzbp_owner_select on public.kfz_bestand_preis;
create policy kfzbp_owner_select on public.kfz_bestand_preis for select to authenticated
  using (auth.uid() = owner_user_id);
drop policy if exists kfzbp_ma_select on public.kfz_bestand_preis;
create policy kfzbp_ma_select on public.kfz_bestand_preis for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));

-- modul_einstellung: Chef schreibt, Mitarbeiter lesen
drop policy if exists modein_owner_all on public.modul_einstellung;
create policy modein_owner_all on public.modul_einstellung for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists modein_ma_select on public.modul_einstellung;
create policy modein_ma_select on public.modul_einstellung for select to authenticated
  using (owner_user_id = public.mein_chef_id());

-- KONTROLLE — Erwartung: tabellen = 3, regeln_bestand = 4, regeln_preis = 2,
-- regeln_einstellung = 2, ausloeser = 2, rls_an = 3
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('kfz_bestand', 'kfz_bestand_preis', 'modul_einstellung')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_bestand') as regeln_bestand,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_bestand_preis') as regeln_preis,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'modul_einstellung') as regeln_einstellung,
  (select count(*) from pg_trigger where tgrelid = 'public.kfz_bestand'::regclass and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('kfz_bestand', 'kfz_bestand_preis', 'modul_einstellung') and relrowsecurity) as rls_an;
