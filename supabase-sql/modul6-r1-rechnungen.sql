-- ============================================================
-- ARGONAUT OS · MODUL 6 "RECHNUNG" · R1 DATENMODELL
-- Idempotent · RLS owner-only · Auto-Nummer RE-JJJJ-XXXX
-- ============================================================

-- 1) Fortlaufende Rechnungsnummer (global, §14-konform)
CREATE SEQUENCE IF NOT EXISTS rechnung_nr_seq START 1;

-- 2) Haupttabelle: rechnungen
CREATE TABLE IF NOT EXISTS rechnungen (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default auth.uid(),
  rechnungsnummer   text unique,
  auftrag_id        uuid references auftraege(id) on delete set null,
  kontakt_id        uuid,
  firma_id          uuid,
  titel             text,
  zahlungsstatus    text not null default 'offen',
  rechnungsdatum    date not null default current_date,
  leistungsdatum    date,
  faelligkeitsdatum date,
  zahlungsziel_tage integer not null default 14,
  netto_summe       numeric(12,2) not null default 0,
  mwst_summe        numeric(12,2) not null default 0,
  brutto_summe      numeric(12,2) not null default 0,
  waehrung          text not null default 'EUR',
  kleinunternehmer  boolean not null default false,
  bezahlt_am        date,
  bezahlter_betrag  numeric(12,2) not null default 0,
  mahnstufe         integer not null default 0,   -- Andock R6 (Mahnwesen)
  letzte_mahnung_am date,                         -- Andock R6
  notizen           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2b) Additive Spalten-Absicherung (falls Tabelle schon existierte)
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS auftrag_id        uuid;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS kontakt_id        uuid;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS firma_id          uuid;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS titel             text;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS zahlungsstatus    text NOT NULL DEFAULT 'offen';
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS rechnungsdatum    date NOT NULL DEFAULT current_date;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS leistungsdatum    date;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS faelligkeitsdatum date;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS zahlungsziel_tage integer NOT NULL DEFAULT 14;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS netto_summe       numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS mwst_summe        numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS brutto_summe      numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS waehrung          text NOT NULL DEFAULT 'EUR';
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS kleinunternehmer  boolean NOT NULL DEFAULT false;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS bezahlt_am        date;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS bezahlter_betrag  numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS mahnstufe         integer NOT NULL DEFAULT 0;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS letzte_mahnung_am date;
ALTER TABLE rechnungen ADD COLUMN IF NOT EXISTS notizen           text;

-- 2c) Status-Werte absichern (CHECK, idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rechnungen_zahlungsstatus_check') THEN
    ALTER TABLE rechnungen ADD CONSTRAINT rechnungen_zahlungsstatus_check
      CHECK (zahlungsstatus IN ('offen','teilbezahlt','bezahlt','storniert','ueberfaellig'));
  END IF;
END $$;

-- 3) Positionen-Tabelle (analog auftrag_positionen)
CREATE TABLE IF NOT EXISTS rechnung_positionen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  rechnung_id   uuid not null references rechnungen(id) on delete cascade,
  position      integer not null default 1,
  bezeichnung   text,
  beschreibung  text,
  menge         numeric(12,2) not null default 1,
  einheit       text default 'Stk',
  einzelpreis   numeric(12,2) not null default 0,
  mwst_satz     numeric(5,2) not null default 19,
  gesamt_netto  numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

ALTER TABLE rechnung_positionen ADD COLUMN IF NOT EXISTS beschreibung text;
ALTER TABLE rechnung_positionen ADD COLUMN IF NOT EXISTS einheit      text DEFAULT 'Stk';
ALTER TABLE rechnung_positionen ADD COLUMN IF NOT EXISTS mwst_satz    numeric(5,2) NOT NULL DEFAULT 19;

-- 4) updated_at-Funktion (generisch, überschreibbar)
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5) Auto-Rechnungsnummer RE-JJJJ-XXXX
CREATE OR REPLACE FUNCTION fn_rechnung_nummer()
RETURNS trigger AS $$
BEGIN
  IF NEW.rechnungsnummer IS NULL THEN
    NEW.rechnungsnummer := 'RE-'
      || to_char(coalesce(NEW.rechnungsdatum, current_date), 'YYYY')
      || '-' || lpad(nextval('rechnung_nr_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6) Trigger (idempotent via DROP + CREATE)
DROP TRIGGER IF EXISTS trg_rechnung_nummer ON rechnungen;
CREATE TRIGGER trg_rechnung_nummer BEFORE INSERT ON rechnungen
  FOR EACH ROW EXECUTE FUNCTION fn_rechnung_nummer();

DROP TRIGGER IF EXISTS trg_rechnungen_updated ON rechnungen;
CREATE TRIGGER trg_rechnungen_updated BEFORE UPDATE ON rechnungen
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_rechnung_pos_updated ON rechnung_positionen;
CREATE TRIGGER trg_rechnung_pos_updated BEFORE UPDATE ON rechnung_positionen
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 7) RLS owner-only
ALTER TABLE rechnungen          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rechnung_positionen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rechnungen_owner_all" ON rechnungen;
CREATE POLICY "rechnungen_owner_all" ON rechnungen
  FOR ALL USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "rechnung_pos_owner_all" ON rechnung_positionen;
CREATE POLICY "rechnung_pos_owner_all" ON rechnung_positionen
  FOR ALL USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- 8) Indizes
CREATE INDEX IF NOT EXISTS idx_rechnungen_owner    ON rechnungen(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rechnungen_auftrag  ON rechnungen(auftrag_id);
CREATE INDEX IF NOT EXISTS idx_rechnungen_status   ON rechnungen(zahlungsstatus);
CREATE INDEX IF NOT EXISTS idx_rechnungen_faellig  ON rechnungen(faelligkeitsdatum);
CREATE INDEX IF NOT EXISTS idx_rechnung_pos_rid    ON rechnung_positionen(rechnung_id);

-- 9) FK auftraege.rechnung_id -> rechnungen (für "✓ Fakturiert"-Logik)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auftraege_rechnung_id_fkey') THEN
    ALTER TABLE auftraege
      ADD CONSTRAINT auftraege_rechnung_id_fkey
      FOREIGN KEY (rechnung_id) REFERENCES rechnungen(id) ON DELETE SET NULL;
  END IF;
END $$;
