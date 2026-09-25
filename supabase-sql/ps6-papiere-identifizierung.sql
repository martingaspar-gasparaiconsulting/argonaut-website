-- ============================================================
-- ARGONAUT OS · Paket PS6 · Papiere & Identifizierung — Stand 25.09.2026
--   hotel_meldeschein        Meldescheine auslaendischer Gaeste (§§ 29, 30 BMG)
--   hotel_kurtaxe            Kurtaxe-Saetze der Gemeinde (je Betrieb eine Zeile)
--   hotel_kurtaxe_beleg      Kurtaxe je Belegung (Gaeste, Betrag, an Gemeinde gemeldet)
--   cmr_frachtbrief          CMR-Frachtbriefe
--   logistik_kartenbuchung   Tankkarten- und Maut-Buchungen (NUR Chef — Geld)
--   fahrzeuge                + tank_liter
--   gwg_identifizierung      GwG-Identifizierungen (Chef alles; Mitarbeiter anlegen + eigene lesen)
--   agentur_nutzungsrecht    Nutzungsrechte an Werken
--   agrar_duengebedarf       Duengebedarfsermittlung je Schlag und Jahr
--   agrar_schlaege           + flaechenart, rotes_gebiet
--
-- ADDITIV UND IDEMPOTENT: neue Tabellen, neue Spalten, nichts geaendert oder geloescht.
-- Besitzer = Betrieb (coalesce(mein_chef_id(), auth.uid())). Loeschen: nur der Chef.
-- ============================================================

-- ---------- Beherbergung: Meldeschein ----------
create table if not exists public.hotel_meldeschein (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null default coalesce(mein_chef_id(), auth.uid()),
  belegung_id         uuid references public.hotel_belegungen(id) on delete set null,
  ankunft             date not null,
  abreise             date not null,
  familienname        text not null,
  vornamen            text,
  geburtsdatum        date,
  staatsangehoerigkeit text,
  anschrift           text,
  mitreisende_anzahl  integer not null default 0 check (mitreisende_anzahl >= 0),
  mitreisende_staaten text,
  partner_name        text,
  ausweis_nr          text,
  reisegruppe         boolean not null default false,
  unterschrift        text,
  erfasst_von         uuid default auth.uid(),
  erstellt_am         timestamptz not null default now()
);
create index if not exists hotel_meldeschein_owner_idx on public.hotel_meldeschein (owner_user_id, abreise desc);
alter table public.hotel_meldeschein enable row level security;
drop policy if exists hms_chef_all on public.hotel_meldeschein;
create policy hms_chef_all on public.hotel_meldeschein for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists hms_ma_select on public.hotel_meldeschein;
create policy hms_ma_select on public.hotel_meldeschein for select to public using (owner_user_id = mein_chef_id());
drop policy if exists hms_ma_insert on public.hotel_meldeschein;
create policy hms_ma_insert on public.hotel_meldeschein for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists hms_ma_update on public.hotel_meldeschein;
create policy hms_ma_update on public.hotel_meldeschein for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---------- Beherbergung: Kurtaxe ----------
create table if not exists public.hotel_kurtaxe (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default auth.uid(),
  gemeinde        text,
  satz_erwachsen  numeric(8,2) not null check (satz_erwachsen >= 0),
  satz_kind       numeric(8,2) check (satz_kind is null or satz_kind >= 0),
  kind_bis_alter  integer,
  frei_bis_alter  integer,
  max_naechte     integer,
  aktualisiert_am timestamptz not null default now()
);
create unique index if not exists hotel_kurtaxe_owner_uidx on public.hotel_kurtaxe (owner_user_id);
alter table public.hotel_kurtaxe enable row level security;
drop policy if exists hkt_chef_all on public.hotel_kurtaxe;
create policy hkt_chef_all on public.hotel_kurtaxe for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists hkt_ma_select on public.hotel_kurtaxe;
create policy hkt_ma_select on public.hotel_kurtaxe for select to public using (owner_user_id = mein_chef_id());

create table if not exists public.hotel_kurtaxe_beleg (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  belegung_id   uuid references public.hotel_belegungen(id) on delete set null,
  anreise       date not null,
  abreise       date not null,
  gaeste        jsonb not null default '[]'::jsonb,
  betrag        numeric(10,2) not null default 0,
  gemeldet_am   date,
  erstellt_am   timestamptz not null default now()
);
create unique index if not exists hotel_kurtaxe_beleg_uidx on public.hotel_kurtaxe_beleg (belegung_id) where belegung_id is not null;
create index if not exists hotel_kurtaxe_beleg_owner_idx on public.hotel_kurtaxe_beleg (owner_user_id, anreise desc);
alter table public.hotel_kurtaxe_beleg enable row level security;
drop policy if exists hkb_chef_all on public.hotel_kurtaxe_beleg;
create policy hkb_chef_all on public.hotel_kurtaxe_beleg for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists hkb_ma_select on public.hotel_kurtaxe_beleg;
create policy hkb_ma_select on public.hotel_kurtaxe_beleg for select to public using (owner_user_id = mein_chef_id());
drop policy if exists hkb_ma_insert on public.hotel_kurtaxe_beleg;
create policy hkb_ma_insert on public.hotel_kurtaxe_beleg for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists hkb_ma_update on public.hotel_kurtaxe_beleg;
create policy hkb_ma_update on public.hotel_kurtaxe_beleg for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---------- Logistik: CMR-Frachtbrief ----------
create table if not exists public.cmr_frachtbrief (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default coalesce(mein_chef_id(), auth.uid()),
  nummer           text not null,
  tour_id          uuid references public.logistik_touren(id) on delete set null,
  absender         text,
  absender_land    text,
  empfaenger       text,
  empfaenger_land  text,
  frachtfuehrer    text,
  nachfolgend      text,
  uebernahme_ort   text,
  uebernahme_datum date,
  ablieferung_ort  text,
  positionen       jsonb not null default '[]'::jsonb,
  gefahrgut        jsonb not null default '[]'::jsonb,
  weisungen        text,
  kosten           text,
  vereinbarungen   text,
  ausgestellt_ort  text,
  ausgestellt_am   date not null default current_date,
  status           text not null default 'entwurf' check (status in ('entwurf', 'ausgestellt', 'abgeliefert', 'storniert')),
  erstellt_von     uuid default auth.uid(),
  erstellt_am      timestamptz not null default now()
);
create unique index if not exists cmr_frachtbrief_nr_uidx on public.cmr_frachtbrief (owner_user_id, nummer);
alter table public.cmr_frachtbrief enable row level security;
drop policy if exists cmr_chef_all on public.cmr_frachtbrief;
create policy cmr_chef_all on public.cmr_frachtbrief for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists cmr_ma_select on public.cmr_frachtbrief;
create policy cmr_ma_select on public.cmr_frachtbrief for select to public using (owner_user_id = mein_chef_id());
drop policy if exists cmr_ma_insert on public.cmr_frachtbrief;
create policy cmr_ma_insert on public.cmr_frachtbrief for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists cmr_ma_update on public.cmr_frachtbrief;
create policy cmr_ma_update on public.cmr_frachtbrief for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---------- Logistik: Tankkarten- und Maut-Buchungen (nur Chef) ----------
create table if not exists public.logistik_kartenbuchung (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  art           text not null check (art in ('tanken', 'maut')),
  schluessel    text not null,
  datum         date not null,
  zeit          text,
  kennzeichen   text not null,
  produkt       text,
  liter         numeric(10,2),
  km            numeric(10,1),
  betrag        numeric(12,2),
  ort           text,
  karte         text,
  geprueft      boolean not null default false,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create unique index if not exists logistik_kartenbuchung_uidx on public.logistik_kartenbuchung (owner_user_id, art, schluessel);
create index if not exists logistik_kartenbuchung_datum_idx on public.logistik_kartenbuchung (owner_user_id, datum desc);
alter table public.logistik_kartenbuchung enable row level security;
drop policy if exists lkb_chef_all on public.logistik_kartenbuchung;
create policy lkb_chef_all on public.logistik_kartenbuchung for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

alter table public.fahrzeuge add column if not exists tank_liter numeric(6,1);

-- ---------- Geldwaesche: Identifizierung ----------
create table if not exists public.gwg_identifizierung (
  id                        uuid primary key default gen_random_uuid(),
  owner_user_id             uuid not null default coalesce(mein_chef_id(), auth.uid()),
  bereich                   text not null check (bereich in ('kfz', 'immobilien', 'kanzlei', 'handel')),
  datum                     date not null default current_date,
  anlass                    text,
  vorgang                   text,
  betrag                    numeric(14,2),
  bar                       numeric(14,2),
  pflicht_grund             text,
  person_art                text not null default 'natuerlich' check (person_art in ('natuerlich', 'juristisch')),
  nachname                  text,
  vornamen                  text,
  geburtsdatum              date,
  geburtsort                text,
  staatsangehoerigkeit      text,
  anschrift                 text,
  ausweis_art               text,
  ausweis_nr                text,
  ausweis_behoerde          text,
  ausweis_gueltig_bis       date,
  firma                     text,
  rechtsform                text,
  register_nr               text,
  vertreter                 text,
  wirtschaftlich_berechtigte text,
  transparenzregister       boolean not null default false,
  pep                       boolean not null default false,
  mittelherkunft            text,
  leitung_zugestimmt        boolean not null default false,
  risiko                    text not null default 'normal' check (risiko in ('gering', 'normal', 'hoch')),
  kopie_vorhanden           boolean not null default false,
  verdacht                  boolean not null default false,
  verdacht_gemeldet_am      date,
  vernichtet_am             date,
  erstellt_von              uuid default auth.uid(),
  erstellt_am               timestamptz not null default now()
);
create index if not exists gwg_identifizierung_owner_idx on public.gwg_identifizierung (owner_user_id, bereich, datum desc);
alter table public.gwg_identifizierung enable row level security;
drop policy if exists gwg_chef_all on public.gwg_identifizierung;
create policy gwg_chef_all on public.gwg_identifizierung for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists gwg_ma_select on public.gwg_identifizierung;
create policy gwg_ma_select on public.gwg_identifizierung for select to public using (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
drop policy if exists gwg_ma_insert on public.gwg_identifizierung;
create policy gwg_ma_insert on public.gwg_identifizierung for insert to public with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());

-- ---------- Agentur: Nutzungsrechte ----------
create table if not exists public.agentur_nutzungsrecht (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  retainer_id   uuid references public.agentur_retainer(id) on delete set null,
  kunde         text,
  werk          text not null,
  werkart       text,
  recht         text not null default 'einfach' check (recht in ('einfach', 'ausschliesslich')),
  raum          text,
  medien        text[] not null default '{}',
  von           date,
  bis           date,
  bearbeitung   boolean not null default false,
  weiterlizenz  boolean not null default false,
  urheber       text,
  fremd_recht   text check (fremd_recht is null or fremd_recht in ('einfach', 'ausschliesslich')),
  fremd_bis     date,
  fremd_medien  text[] not null default '{}',
  verguetung    numeric(12,2),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists agentur_nutzungsrecht_owner_idx on public.agentur_nutzungsrecht (owner_user_id, bis);
alter table public.agentur_nutzungsrecht enable row level security;
drop policy if exists anr_chef_all on public.agentur_nutzungsrecht;
create policy anr_chef_all on public.agentur_nutzungsrecht for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists anr_ma_select on public.agentur_nutzungsrecht;
create policy anr_ma_select on public.agentur_nutzungsrecht for select to public using (owner_user_id = mein_chef_id());
drop policy if exists anr_ma_insert on public.agentur_nutzungsrecht;
create policy anr_ma_insert on public.agentur_nutzungsrecht for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists anr_ma_update on public.agentur_nutzungsrecht;
create policy anr_ma_update on public.agentur_nutzungsrecht for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---------- Landwirtschaft: Duengebedarf ----------
alter table public.agrar_schlaege add column if not exists flaechenart text;
alter table public.agrar_schlaege add column if not exists rotes_gebiet boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agrar_schlaege_flaechenart_chk') then
    alter table public.agrar_schlaege add constraint agrar_schlaege_flaechenart_chk check (flaechenart is null or flaechenart in ('acker', 'gruenland'));
  end if;
end $$;

create table if not exists public.agrar_duengebedarf (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  schlag_id     uuid not null references public.agrar_schlaege(id) on delete cascade,
  jahr          integer not null check (jahr between 2000 and 2100),
  kultur        text,
  n_kg_ha       numeric(8,1),
  p2o5_kg_ha    numeric(8,1),
  ermittelt_am  date not null default current_date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create unique index if not exists agrar_duengebedarf_uidx on public.agrar_duengebedarf (schlag_id, jahr);
alter table public.agrar_duengebedarf enable row level security;
drop policy if exists adb_chef_all on public.agrar_duengebedarf;
create policy adb_chef_all on public.agrar_duengebedarf for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists adb_ma_select on public.agrar_duengebedarf;
create policy adb_ma_select on public.agrar_duengebedarf for select to public using (owner_user_id = mein_chef_id());
drop policy if exists adb_ma_insert on public.agrar_duengebedarf;
create policy adb_ma_insert on public.agrar_duengebedarf for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists adb_ma_update on public.agrar_duengebedarf;
create policy adb_ma_update on public.agrar_duengebedarf for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---------- Kontrolle ----------
select table_name, count(*) as spalten
from information_schema.columns
where table_schema = 'public' and table_name in ('hotel_meldeschein', 'hotel_kurtaxe', 'hotel_kurtaxe_beleg', 'cmr_frachtbrief', 'logistik_kartenbuchung', 'gwg_identifizierung', 'agentur_nutzungsrecht', 'agrar_duengebedarf')
group by table_name
union all
select 'neue Spalten (fahrzeuge + agrar_schlaege)', count(*)
from information_schema.columns
where table_schema = 'public' and ((table_name = 'fahrzeuge' and column_name = 'tank_liter') or (table_name = 'agrar_schlaege' and column_name in ('flaechenart', 'rotes_gebiet')))
order by 1;
