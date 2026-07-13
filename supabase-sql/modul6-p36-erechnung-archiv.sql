-- ============================================================
-- ARGONAUT OS · MODUL 6 (Rechnung) · P36 — GoBD-ARCHIV (E-Rechnung)
-- ------------------------------------------------------------
-- Revisionssichere Aufbewahrung von E-Rechnungen (§ 147 AO / GoBD):
-- Original-Datei (XML bzw. ZUGFeRD-PDF) wird UNVERÄNDERT im privaten
-- Bucket 'erechnungen' abgelegt. Diese Tabelle protokolliert Metadaten
-- + SHA-256-Hash der Datei (Nachweis der Unverfälschtheit) + Zeitpunkt.
--
-- Zwei Richtungen (richtung-Spalte):
--   'ausgang'  = von ARGONAUT erzeugte, versendete E-Rechnung
--   'eingang'  = empfangene E-Rechnung eines Lieferanten
--
-- SAFETY-FIRST + ADDITIV: idempotent (IF NOT EXISTS), owner-only RLS,
-- keine destruktiven Operationen, hängt an keiner bestehenden Tabelle.
-- UNVERÄNDERBARKEIT: kein UPDATE/DELETE per RLS erlaubt (nur INSERT+SELECT)
-- ============================================================

-- 1) Archiv-Tabelle
CREATE TABLE IF NOT EXISTS erechnung_archiv (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default auth.uid(),
  richtung          text not null default 'ausgang',   -- 'ausgang' | 'eingang'
  rechnung_id       uuid,                               -- optional: Verweis auf rechnungen(id) bei Ausgang
  rechnungsnummer   text,
  format            text,                               -- 'CII' | 'UBL' | 'PDF'
  lieferant_name    text,                               -- bei Eingang: wer stellt die Rechnung
  empfaenger_name   text,
  brutto_summe      numeric(12,2) not null default 0,
  waehrung          text not null default 'EUR',
  rechnungsdatum    date,
  datei_pfad        text not null,                      -- Pfad im Bucket 'erechnungen'
  datei_name        text,
  datei_hash        text not null,                      -- SHA-256 der Originaldatei
  datei_groesse     integer not null default 0,
  archiviert_am     timestamptz not null default now(), -- unveränderlicher Zeitstempel
  notiz             text
);

-- 1b) Additive Spalten-Absicherung (falls Tabelle schon existierte)
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS richtung        text NOT NULL DEFAULT 'ausgang';
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS rechnung_id     uuid;
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS rechnungsnummer text;
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS format          text;
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS lieferant_name  text;
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS empfaenger_name text;
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS brutto_summe    numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS waehrung        text NOT NULL DEFAULT 'EUR';
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS rechnungsdatum  date;
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS datei_name      text;
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS datei_groesse   integer NOT NULL DEFAULT 0;
ALTER TABLE erechnung_archiv ADD COLUMN IF NOT EXISTS notiz           text;

-- 1c) richtung-Werte absichern (CHECK, idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erechnung_archiv_richtung_check') THEN
    ALTER TABLE erechnung_archiv ADD CONSTRAINT erechnung_archiv_richtung_check
      CHECK (richtung IN ('ausgang','eingang'));
  END IF;
END $$;

-- 2) Owner-Trigger (gleiches Muster wie einsaetze / termine)
CREATE OR REPLACE FUNCTION erechnung_archiv_set_owner()
RETURNS trigger AS $$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := coalesce(mein_chef_id(), auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_erechnung_archiv_owner ON erechnung_archiv;
CREATE TRIGGER trg_erechnung_archiv_owner BEFORE INSERT ON erechnung_archiv
  FOR EACH ROW EXECUTE FUNCTION erechnung_archiv_set_owner();

-- 3) RLS: nur SELECT + INSERT (KEIN Update/Delete = unveränderbar, GoBD)
ALTER TABLE erechnung_archiv ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erechnung_archiv_select" ON erechnung_archiv;
CREATE POLICY "erechnung_archiv_select" ON erechnung_archiv
  FOR SELECT USING (owner_user_id = coalesce(mein_chef_id(), auth.uid()));

DROP POLICY IF EXISTS "erechnung_archiv_insert" ON erechnung_archiv;
CREATE POLICY "erechnung_archiv_insert" ON erechnung_archiv
  FOR INSERT WITH CHECK (owner_user_id = coalesce(mein_chef_id(), auth.uid()));

-- Bewusst KEINE update/delete-Policy -> Datensätze sind unveränderbar.

-- 4) Indizes
CREATE INDEX IF NOT EXISTS idx_erechnung_archiv_owner    ON erechnung_archiv(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_erechnung_archiv_richtung ON erechnung_archiv(richtung);
CREATE INDEX IF NOT EXISTS idx_erechnung_archiv_rid      ON erechnung_archiv(rechnung_id);
CREATE INDEX IF NOT EXISTS idx_erechnung_archiv_datum    ON erechnung_archiv(rechnungsdatum);

-- 5) Privater Storage-Bucket 'erechnungen' (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('erechnungen', 'erechnungen', false)
ON CONFLICT (id) DO NOTHING;

-- 6) Storage-RLS: owner darf in seinen eigenen Ordner lesen/schreiben.
--    Pfad-Konvention: {owner_user_id}/{jahr}/{dateiname}
--    (gleiche Idee wie bei einsatz-fotos)
DROP POLICY IF EXISTS "erechnungen_select_own" ON storage.objects;
CREATE POLICY "erechnungen_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'erechnungen'
    AND (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text
  );

DROP POLICY IF EXISTS "erechnungen_insert_own" ON storage.objects;
CREATE POLICY "erechnungen_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'erechnungen'
    AND (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text
  );

-- Kein update/delete auf Storage-Objekte im erechnungen-Bucket -> unveränderbar.
