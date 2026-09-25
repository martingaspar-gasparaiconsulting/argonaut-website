-- ============================================================
-- ARGONAUT OS · Paket PS5 · Gebuehren & Honorare — Stand 25.09.2026
--   tier_got_leistung   eigene GOT-Leistungsliste der Praxis (einfacher Satz)
--   bildung_honorar     Dozentenhonorare je Einsatz (NUR Chef — Geld)
--   gastro_trinkgeld    Trinkgeld-Verteilungen je Tag/Schicht
--   mitglieder          + Vertragsdaten fuer Kuendigungsfristen (9 neue Spalten)
--   mitglied_checkin    Check-ins am Tresen
--
-- Der Gebuehren-Rechner RVG/StBVV braucht KEINE Tabelle (reine Rechenhilfe).
-- ADDITIV UND IDEMPOTENT: neue Tabellen, neue Spalten, nichts geaendert oder geloescht.
-- Besitzer = Betrieb (coalesce(mein_chef_id(), auth.uid())).
-- Loeschen: nur der Chef. Niemand wird ausgesperrt.
-- ============================================================

-- ---------- Tier: eigene GOT-Leistungsliste ----------
create table if not exists public.tier_got_leistung (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  nr            text,
  bezeichnung   text not null,
  einfach_satz  numeric(12,2) not null check (einfach_satz > 0),
  aktiv         boolean not null default true,
  erstellt_am   timestamptz not null default now()
);
create index if not exists tier_got_leistung_owner_idx on public.tier_got_leistung (owner_user_id, bezeichnung);

alter table public.tier_got_leistung enable row level security;
drop policy if exists tgl_chef_all on public.tier_got_leistung;
create policy tgl_chef_all on public.tier_got_leistung for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists tgl_ma_select on public.tier_got_leistung;
create policy tgl_ma_select on public.tier_got_leistung for select to public using (owner_user_id = mein_chef_id());
drop policy if exists tgl_ma_insert on public.tier_got_leistung;
create policy tgl_ma_insert on public.tier_got_leistung for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists tgl_ma_update on public.tier_got_leistung;
create policy tgl_ma_update on public.tier_got_leistung for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- ---------- Bildung: Dozentenhonorare (nur Chef) ----------
create table if not exists public.bildung_honorar (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  kurs_id       uuid references public.bildung_kurse(id) on delete set null,
  dozent        text not null,
  datum         date not null,
  ue            numeric(8,2) not null check (ue > 0),
  satz          numeric(12,2) not null check (satz >= 0),
  fahrt_km      numeric(10,1) not null default 0 check (fahrt_km >= 0),
  km_satz       numeric(6,2) not null default 0.30 check (km_satz >= 0),
  auslagen      numeric(12,2) not null default 0 check (auslagen >= 0),
  ust_satz      numeric(5,2) not null default 0 check (ust_satz >= 0),
  status        text not null default 'offen' check (status in ('offen', 'abgerechnet', 'bezahlt')),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists bildung_honorar_owner_idx on public.bildung_honorar (owner_user_id, datum desc);

alter table public.bildung_honorar enable row level security;
drop policy if exists bh_chef_all on public.bildung_honorar;
create policy bh_chef_all on public.bildung_honorar for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ---------- Gastro: Trinkgeld-Verteilung ----------
create table if not exists public.gastro_trinkgeld (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  datum         date not null default current_date,
  schicht       text,
  bar           numeric(12,2) not null default 0 check (bar >= 0),
  karte         numeric(12,2) not null default 0 check (karte >= 0),
  methode       text not null default 'stunden' check (methode in ('stunden', 'punkte', 'gleich')),
  anteile       jsonb not null default '[]'::jsonb,
  notiz         text,
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now()
);
create index if not exists gastro_trinkgeld_owner_idx on public.gastro_trinkgeld (owner_user_id, datum desc);

alter table public.gastro_trinkgeld enable row level security;
drop policy if exists gtg_chef_all on public.gastro_trinkgeld;
create policy gtg_chef_all on public.gastro_trinkgeld for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists gtg_ma_select on public.gastro_trinkgeld;
create policy gtg_ma_select on public.gastro_trinkgeld for select to public using (owner_user_id = mein_chef_id());
drop policy if exists gtg_ma_insert on public.gastro_trinkgeld;
create policy gtg_ma_insert on public.gastro_trinkgeld for insert to public with check (owner_user_id = mein_chef_id());

-- ---------- Mitglieder: Vertragsdaten fuer Kuendigungsfristen ----------
alter table public.mitglieder add column if not exists vertragsart text not null default 'studio';
alter table public.mitglieder add column if not exists mitglieds_nr text;
alter table public.mitglieder add column if not exists abgeschlossen_am date;
alter table public.mitglieder add column if not exists erstlaufzeit_monate integer;
alter table public.mitglieder add column if not exists kuendigungsfrist_monate numeric(4,1);
alter table public.mitglieder add column if not exists verlaengerung_monate integer;
alter table public.mitglieder add column if not exists satzung_frist_monate numeric(4,1);
alter table public.mitglieder add column if not exists satzung_zum text;
alter table public.mitglieder add column if not exists kuendigung_eingang date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mitglieder_vertragsart_chk') then
    alter table public.mitglieder add constraint mitglieder_vertragsart_chk check (vertragsart in ('studio', 'verein'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mitglieder_satzung_zum_chk') then
    alter table public.mitglieder add constraint mitglieder_satzung_zum_chk check (satzung_zum is null or satzung_zum in ('monatsende', 'quartalsende', 'jahresende', 'jederzeit'));
  end if;
end $$;

-- ---------- Mitglieder: Check-in ----------
create table if not exists public.mitglied_checkin (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  mitglied_id   uuid not null references public.mitglieder(id) on delete cascade,
  zeit          timestamptz not null default now(),
  erfasst_von   uuid default auth.uid()
);
create index if not exists mitglied_checkin_owner_idx on public.mitglied_checkin (owner_user_id, zeit desc);
create index if not exists mitglied_checkin_mitglied_idx on public.mitglied_checkin (mitglied_id, zeit desc);

alter table public.mitglied_checkin enable row level security;
drop policy if exists mci_chef_all on public.mitglied_checkin;
create policy mci_chef_all on public.mitglied_checkin for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists mci_ma_select on public.mitglied_checkin;
create policy mci_ma_select on public.mitglied_checkin for select to public using (owner_user_id = mein_chef_id());
drop policy if exists mci_ma_insert on public.mitglied_checkin;
create policy mci_ma_insert on public.mitglied_checkin for insert to public with check (owner_user_id = mein_chef_id());

-- ---------- Kontrolle ----------
select table_name, count(*) as spalten
from information_schema.columns
where table_schema = 'public' and table_name in ('tier_got_leistung', 'bildung_honorar', 'gastro_trinkgeld', 'mitglied_checkin')
group by table_name
union all
select 'mitglieder (neue Spalten)', count(*)
from information_schema.columns
where table_schema = 'public' and table_name = 'mitglieder'
  and column_name in ('vertragsart', 'mitglieds_nr', 'abgeschlossen_am', 'erstlaufzeit_monate', 'kuendigungsfrist_monate', 'verlaengerung_monate', 'satzung_frist_monate', 'satzung_zum', 'kuendigung_eingang')
order by 1;
