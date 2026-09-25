-- ============================================================
-- ARGONAUT OS · Paket PS3 · Vorgaenge mit Kunden — Stand 25.09.2026
--   shop_retoure         Retouren & Widerruf (Shop)
--   kfz_schadenfall      Schadenabwicklung mit Versicherern (KFZ)
--   nachkauf_produkt     Produkte mit Reichweite (Beauty)
--   nachkauf_verkauf     Produktverkaeufe an Kundinnen (Beauty)
--   tier_tiere           + halter_email, halter_telefon, erinnerung_ok, erinnerung_ok_am, erinnerung_widerruf_am
--   tier_erinnerung      Protokoll: wer wurde wann an welche Impfung erinnert
--   (SLA-Bericht IT braucht KEIN SQL — er liest tickets, ticket_verlauf, it_sla.)
--
-- ADDITIV UND IDEMPOTENT: neue Tabellen, neue Spalten mit Standardwert,
-- nichts Bestehendes geaendert oder geloescht.
-- Besitzer = Betrieb (coalesce(mein_chef_id(), auth.uid())), wie PS2.
-- RLS: Chef alles. Mitarbeiter lesen, anlegen, bearbeiten — loeschen nur der Chef.
-- ============================================================

-- ---------- Retouren ----------
create table if not exists public.shop_retoure (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(mein_chef_id(), auth.uid()),
  nummer                text not null,
  bestellung_id         uuid,
  art                   text not null default 'widerruf' check (art in ('widerruf', 'reklamation', 'kulanz')),
  status                text not null default 'gemeldet' check (status in ('gemeldet', 'unterwegs', 'eingegangen', 'geprueft', 'erstattet', 'ersetzt', 'abgelehnt')),
  kunde_name            text,
  email                 text,
  bestellnummer         text,
  positionen            jsonb not null default '[]'::jsonb,
  vollstaendig          boolean not null default false,
  erhalten_am           date,
  widerruf_am           date,
  belehrung_ok          boolean not null default true,
  abholung_angeboten    boolean not null default false,
  ware_zurueck_am       date,
  rueckversand_nachweis boolean not null default false,
  zustand               text check (zustand is null or zustand in ('neuwertig', 'geoeffnet', 'gebrauchsspuren', 'beschaedigt', 'unvollstaendig')),
  hinversand            numeric(12,2),
  mehrkosten_lieferart  numeric(12,2),
  wertersatz            numeric(12,2),
  wertersatz_grund      text,
  erstattung_betrag     numeric(12,2),
  erstattet_am          date,
  erstattungsweg        text,
  lager_gebucht         boolean not null default false,
  grund                 text,
  notiz                 text,
  erstellt_von          uuid default auth.uid(),
  erstellt_am           timestamptz not null default now(),
  aktualisiert_am       timestamptz not null default now()
);
create unique index if not exists shop_retoure_nummer_uidx on public.shop_retoure (owner_user_id, nummer);
create index if not exists shop_retoure_bestellung_idx on public.shop_retoure (bestellung_id);

-- Fremdschluessel nur, wenn shop_bestellungen.id wirklich uuid ist.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shop_bestellungen' and column_name = 'id' and data_type = 'uuid')
     and not exists (select 1 from pg_constraint where conname = 'shop_retoure_bestellung_fk') then
    alter table public.shop_retoure add constraint shop_retoure_bestellung_fk foreign key (bestellung_id) references public.shop_bestellungen(id) on delete set null;
  end if;
end $$;

alter table public.shop_retoure enable row level security;
drop policy if exists sr_chef_all on public.shop_retoure;
create policy sr_chef_all on public.shop_retoure for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists sr_ma_select on public.shop_retoure;
create policy sr_ma_select on public.shop_retoure for select to public using (owner_user_id = mein_chef_id());
drop policy if exists sr_ma_insert on public.shop_retoure;
create policy sr_ma_insert on public.shop_retoure for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists sr_ma_update on public.shop_retoure;
create policy sr_ma_update on public.shop_retoure for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---------- KFZ-Schadenfall ----------
create table if not exists public.kfz_schadenfall (
  id                     uuid primary key default gen_random_uuid(),
  owner_user_id          uuid not null default coalesce(mein_chef_id(), auth.uid()),
  nummer                 text not null,
  fahrzeug_id            uuid,
  kunde_name             text,
  kennzeichen            text,
  art                    text not null default 'haftpflicht' check (art in ('haftpflicht', 'vollkasko', 'teilkasko', 'selbstzahler', 'unklar')),
  status                 text not null default 'aufgenommen' check (status in ('aufgenommen', 'gemeldet', 'gutachten', 'freigegeben', 'reparatur', 'abgerechnet', 'bezahlt', 'gekuerzt', 'abgeschlossen')),
  schadentag             date,
  versicherer            text,
  schadennummer          text,
  gutachter              text,
  kva_betrag             numeric(12,2),
  gemeldet_am            date,
  freigabe_am            date,
  ersatz_art             text,
  ersatz_von             date,
  ersatz_bis             date,
  rechnung_betrag        numeric(12,2),
  rechnung_am            date,
  unterlagen_komplett_am date,
  selbstbeteiligung      numeric(12,2),
  zahlungen              jsonb not null default '[]'::jsonb,
  unterlagen             jsonb not null default '{}'::jsonb,
  notiz                  text,
  abgeschlossen_am       date,
  erstellt_von           uuid default auth.uid(),
  erstellt_am            timestamptz not null default now(),
  aktualisiert_am        timestamptz not null default now()
);
create unique index if not exists kfz_schadenfall_nummer_uidx on public.kfz_schadenfall (owner_user_id, nummer);
create index if not exists kfz_schadenfall_fahrzeug_idx on public.kfz_schadenfall (fahrzeug_id);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kfz_fahrzeuge' and column_name = 'id' and data_type = 'uuid')
     and not exists (select 1 from pg_constraint where conname = 'kfz_schadenfall_fahrzeug_fk') then
    alter table public.kfz_schadenfall add constraint kfz_schadenfall_fahrzeug_fk foreign key (fahrzeug_id) references public.kfz_fahrzeuge(id) on delete set null;
  end if;
end $$;

alter table public.kfz_schadenfall enable row level security;
drop policy if exists ksf_chef_all on public.kfz_schadenfall;
create policy ksf_chef_all on public.kfz_schadenfall for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists ksf_ma_select on public.kfz_schadenfall;
create policy ksf_ma_select on public.kfz_schadenfall for select to public using (owner_user_id = mein_chef_id());
drop policy if exists ksf_ma_insert on public.kfz_schadenfall;
create policy ksf_ma_insert on public.kfz_schadenfall for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists ksf_ma_update on public.kfz_schadenfall;
create policy ksf_ma_update on public.kfz_schadenfall for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---------- Nachkauf (Beauty) ----------
create table if not exists public.nachkauf_produkt (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(mein_chef_id(), auth.uid()),
  bezeichnung     text not null,
  reichweite_tage integer not null check (reichweite_tage between 1 and 1000),
  artikel_id      uuid,
  aktiv           boolean not null default true,
  erstellt_am     timestamptz not null default now()
);
create index if not exists nachkauf_produkt_owner_idx on public.nachkauf_produkt (owner_user_id, bezeichnung);

create table if not exists public.nachkauf_verkauf (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null default coalesce(mein_chef_id(), auth.uid()),
  kunde_id             uuid not null,
  produkt_id           uuid references public.nachkauf_produkt(id) on delete set null,
  produkt              text not null,
  menge                integer not null default 1 check (menge between 1 and 100),
  reichweite_tage      integer not null check (reichweite_tage between 1 and 1000),
  verkauft_am          date not null default current_date,
  email                text,
  hinweis_widerspruch  boolean not null default false,
  einwilligung_werbung boolean not null default false,
  widerspruch_am       date,
  erinnert_am          date,
  erinnerung_id        uuid,
  erstellt_von         uuid default auth.uid(),
  erstellt_am          timestamptz not null default now()
);
create index if not exists nachkauf_verkauf_kunde_idx on public.nachkauf_verkauf (owner_user_id, kunde_id, verkauft_am desc);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wellness_kunden' and column_name = 'id' and data_type = 'uuid')
     and not exists (select 1 from pg_constraint where conname = 'nachkauf_verkauf_kunde_fk') then
    alter table public.nachkauf_verkauf add constraint nachkauf_verkauf_kunde_fk foreign key (kunde_id) references public.wellness_kunden(id) on delete cascade;
  end if;
end $$;

alter table public.nachkauf_produkt enable row level security;
drop policy if exists nkp_chef_all on public.nachkauf_produkt;
create policy nkp_chef_all on public.nachkauf_produkt for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists nkp_ma_select on public.nachkauf_produkt;
create policy nkp_ma_select on public.nachkauf_produkt for select to public using (owner_user_id = mein_chef_id());

alter table public.nachkauf_verkauf enable row level security;
drop policy if exists nkv_chef_all on public.nachkauf_verkauf;
create policy nkv_chef_all on public.nachkauf_verkauf for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists nkv_ma_select on public.nachkauf_verkauf;
create policy nkv_ma_select on public.nachkauf_verkauf for select to public using (owner_user_id = mein_chef_id());
drop policy if exists nkv_ma_insert on public.nachkauf_verkauf;
create policy nkv_ma_insert on public.nachkauf_verkauf for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists nkv_ma_update on public.nachkauf_verkauf;
create policy nkv_ma_update on public.nachkauf_verkauf for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---------- Impf-Erinnerung (Tier) ----------
alter table public.tier_tiere add column if not exists halter_email text;
alter table public.tier_tiere add column if not exists halter_telefon text;
alter table public.tier_tiere add column if not exists erinnerung_ok boolean not null default false;
alter table public.tier_tiere add column if not exists erinnerung_ok_am date;
alter table public.tier_tiere add column if not exists erinnerung_widerruf_am date;

-- tier_tiere hatte fuer Mitarbeiter nur select + insert. Damit Mitarbeiter am
-- Empfang Halter-E-Mail und Einwilligung eintragen koennen: update fuer Mitarbeiter.
drop policy if exists tt_update_ma on public.tier_tiere;
create policy tt_update_ma on public.tier_tiere for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

create table if not exists public.tier_erinnerung (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null default coalesce(mein_chef_id(), auth.uid()),
  tier_id        uuid not null references public.tier_tiere(id) on delete cascade,
  behandlung_id  uuid not null references public.tier_behandlungen(id) on delete cascade,
  faellig        date,
  erinnert_am    date not null default current_date,
  kanal          text check (kanal is null or kanal in ('email', 'telefon', 'sms', 'brief')),
  erinnerung_id  uuid,
  erstellt_von   uuid default auth.uid(),
  erstellt_am    timestamptz not null default now()
);
create index if not exists tier_erinnerung_beh_idx on public.tier_erinnerung (behandlung_id);

alter table public.tier_erinnerung enable row level security;
drop policy if exists ter_chef_all on public.tier_erinnerung;
create policy ter_chef_all on public.tier_erinnerung for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists ter_ma_select on public.tier_erinnerung;
create policy ter_ma_select on public.tier_erinnerung for select to public using (owner_user_id = mein_chef_id());
drop policy if exists ter_ma_insert on public.tier_erinnerung;
create policy ter_ma_insert on public.tier_erinnerung for insert to public with check (owner_user_id = mein_chef_id());

-- ---------- Kontrolle (nur lesen) ----------
select tablename, count(*) as regeln
from pg_policies
where schemaname = 'public' and tablename in ('shop_retoure', 'kfz_schadenfall', 'nachkauf_produkt', 'nachkauf_verkauf', 'tier_erinnerung', 'tier_tiere')
group by tablename
order by tablename;
