-- ============================================================
-- ARGONAUT OS · BLOCK 8 (ERP) · E1 DATENMODELL
-- Warenwirtschaft & Betriebsmittel
-- Idempotent — mehrfach ausfuehrbar (IF NOT EXISTS / DROP+CREATE)
-- RLS: owner-policy (owner_user_id = auth.uid())
-- Platzhalter firma_id/kunde_id gesetzt, NICHT verbunden (erst im Finale)
-- ============================================================

-- ---------- updated_at Trigger-Funktion (ERP-eigen) ----------
create or replace function erp_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1) LIEFERANTEN
-- ============================================================
create table if not exists lieferanten (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  name text not null,
  ansprechpartner text,
  email text,
  telefon text,
  adresse text,
  website text,
  kundennummer text,            -- unsere Kundennr. beim Lieferanten
  notizen text,
  aktiv boolean not null default true,
  firma_id uuid,                -- Platzhalter (Finale)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table lieferanten add column if not exists firma_id uuid;

alter table lieferanten enable row level security;
drop policy if exists lieferanten_owner on lieferanten;
create policy lieferanten_owner on lieferanten
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop trigger if exists trg_lieferanten_updated on lieferanten;
create trigger trg_lieferanten_updated before update on lieferanten
  for each row execute function erp_set_updated_at();

create index if not exists idx_lieferanten_owner on lieferanten(owner_user_id);

-- ============================================================
-- 2) ARTIKEL (Stammdaten + aktueller Bestand)
-- ============================================================
create table if not exists artikel (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  artikelnummer text,
  bezeichnung text not null,
  beschreibung text,
  kategorie text,
  einheit text not null default 'Stk',      -- Stk/kg/m/l/...
  einkaufspreis numeric(12,2) default 0,
  verkaufspreis numeric(12,2) default 0,
  mindestbestand numeric(12,2) not null default 0,
  aktueller_bestand numeric(12,2) not null default 0,
  lagerort text,
  lieferant_id uuid references lieferanten(id) on delete set null,
  aktiv boolean not null default true,
  firma_id uuid,               -- Platzhalter
  kunde_id uuid,               -- Platzhalter
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table artikel add column if not exists firma_id uuid;
alter table artikel add column if not exists kunde_id uuid;

alter table artikel enable row level security;
drop policy if exists artikel_owner on artikel;
create policy artikel_owner on artikel
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop trigger if exists trg_artikel_updated on artikel;
create trigger trg_artikel_updated before update on artikel
  for each row execute function erp_set_updated_at();

create index if not exists idx_artikel_owner on artikel(owner_user_id);

-- ============================================================
-- 3) LAGERBEWEGUNGEN (Historie / Audit-Trail)
--    Wareneingang, manuelle Korrekturen, Inventur buchen hier.
-- ============================================================
create table if not exists lagerbewegungen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  artikel_id uuid not null references artikel(id) on delete cascade,
  typ text not null default 'korrektur',   -- eingang/ausgang/korrektur/inventur
  menge numeric(12,2) not null,            -- +/-
  grund text,
  referenz text,                           -- z.B. Wareneingang-/Bestell-ID
  bewegung_am timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table lagerbewegungen enable row level security;
drop policy if exists lagerbewegungen_owner on lagerbewegungen;
create policy lagerbewegungen_owner on lagerbewegungen
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create index if not exists idx_lagerbew_artikel on lagerbewegungen(artikel_id);

-- ============================================================
-- 4) BESTELLUNGEN (Einkauf) + POSITIONEN
-- ============================================================
create table if not exists bestellungen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  bestellnummer text,                      -- BE-JJJJ-XXXX (Vergabe in E5)
  lieferant_id uuid references lieferanten(id) on delete set null,
  status text not null default 'entwurf',  -- entwurf/bestellt/teilweise_geliefert/geliefert/storniert
  bestelldatum date default current_date,
  lieferdatum_erwartet date,
  notizen text,
  firma_id uuid,               -- Platzhalter
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table bestellungen add column if not exists firma_id uuid;

alter table bestellungen enable row level security;
drop policy if exists bestellungen_owner on bestellungen;
create policy bestellungen_owner on bestellungen
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop trigger if exists trg_bestellungen_updated on bestellungen;
create trigger trg_bestellungen_updated before update on bestellungen
  for each row execute function erp_set_updated_at();

create index if not exists idx_bestellungen_owner on bestellungen(owner_user_id);

create table if not exists bestellpositionen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  bestellung_id uuid not null references bestellungen(id) on delete cascade,
  artikel_id uuid references artikel(id) on delete set null,
  bezeichnung text not null,
  menge numeric(12,2) not null default 1,
  einzelpreis numeric(12,2) not null default 0,
  menge_geliefert numeric(12,2) not null default 0,
  position int not null default 1,
  created_at timestamptz not null default now()
);
alter table bestellpositionen enable row level security;
drop policy if exists bestellpositionen_owner on bestellpositionen;
create policy bestellpositionen_owner on bestellpositionen
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create index if not exists idx_bestellpos_bestellung on bestellpositionen(bestellung_id);

-- ============================================================
-- 5) WARENEINGANG + POSITIONEN (bucht Bestand hoch, in E6)
-- ============================================================
create table if not exists wareneingang (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  bestellung_id uuid references bestellungen(id) on delete set null,
  lieferschein_nr text,
  eingangsdatum date default current_date,
  notizen text,
  created_at timestamptz not null default now()
);
alter table wareneingang enable row level security;
drop policy if exists wareneingang_owner on wareneingang;
create policy wareneingang_owner on wareneingang
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create table if not exists wareneingang_positionen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  wareneingang_id uuid not null references wareneingang(id) on delete cascade,
  bestellposition_id uuid references bestellpositionen(id) on delete set null,
  artikel_id uuid references artikel(id) on delete set null,
  menge numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
alter table wareneingang_positionen enable row level security;
drop policy if exists wareneingang_pos_owner on wareneingang_positionen;
create policy wareneingang_pos_owner on wareneingang_positionen
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create index if not exists idx_we_pos_we on wareneingang_positionen(wareneingang_id);

-- ============================================================
-- 6) INVENTAR / BETRIEBSMITTEL (mit Pruef-Ampel)
-- ============================================================
create table if not exists inventar (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  bezeichnung text not null,
  inventarnummer text,
  kategorie text,
  seriennummer text,
  standort text,
  zustand text not null default 'gut',     -- neu/gut/gebraucht/defekt/ausgemustert
  anschaffungsdatum date,
  anschaffungswert numeric(12,2) default 0,
  naechste_pruefung_am date,               -- fuer Pruef-Ampel (z.B. DGUV V3)
  notizen text,
  firma_id uuid,               -- Platzhalter
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table inventar add column if not exists firma_id uuid;

alter table inventar enable row level security;
drop policy if exists inventar_owner on inventar;
create policy inventar_owner on inventar
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop trigger if exists trg_inventar_updated on inventar;
create trigger trg_inventar_updated before update on inventar
  for each row execute function erp_set_updated_at();

-- ============================================================
-- 7) FUHRPARK (Fahrzeuge mit TUEV-/Wartungsfristen-Ampel)
-- ============================================================
create table if not exists fahrzeuge (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  bezeichnung text not null,               -- z.B. "VW Transporter"
  kennzeichen text,
  fahrzeugtyp text,                        -- PKW/LKW/Harvester/Anhaenger/...
  fahrgestellnummer text,
  erstzulassung date,
  tuev_bis date,
  wartung_bis date,
  versicherung_bis date,
  km_stand numeric(12,0) default 0,
  kraftstoff text,                         -- Diesel/Benzin/Elektro/...
  notizen text,
  aktiv boolean not null default true,
  firma_id uuid,               -- Platzhalter
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table fahrzeuge add column if not exists firma_id uuid;

alter table fahrzeuge enable row level security;
drop policy if exists fahrzeuge_owner on fahrzeuge;
create policy fahrzeuge_owner on fahrzeuge
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop trigger if exists trg_fahrzeuge_updated on fahrzeuge;
create trigger trg_fahrzeuge_updated before update on fahrzeuge
  for each row execute function erp_set_updated_at();

-- ============================================================
-- FERTIG · Block 8 E1 Datenmodell
-- ============================================================
