-- ============================================================
-- ARGONAUT OS · Bündel 9 · Lager/WMS mit Scanner
-- Ergänzt den Artikelstamm um ein EAN-/Barcode-Feld, damit der Scanner
-- Artikel per Barcode findet. Bestände laufen über die bestehende Logik
-- (artikel.aktueller_bestand + lagerbewegungen). Nicht-brechend · idempotent.
-- ============================================================

alter table public.artikel add column if not exists ean text;
create index if not exists idx_artikel_ean on public.artikel (ean) where ean is not null;
