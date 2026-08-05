-- ============================================================
-- ARGONAUT OS · Website-Bauer · Speicher-Wächter
-- (1) Funktion: belegte Bytes EINES Kunden (alle Buckets, Ordner = owner_key).
-- (2) Spalte profiles.zusatz_speicher_gb für ein dazugebuchtes Speicher-Paket.
-- Beides idempotent. Ergänzt welle4-speicher-verbrauch.sql (speicher_pro_kunde).
-- ============================================================

-- (1) Summe der belegten Bytes für einen einzelnen Kunden (Ordner-Präfix).
create or replace function speicher_bytes_fuer(owner_key text)
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)::bigint
  from storage.objects
  where name like owner_key || '/%';
$$;

-- (2) Dazugebuchtes Speicher-Paket (in GB). Default 0 = nur Tarif-Grundmenge.
alter table profiles
  add column if not exists zusatz_speicher_gb integer not null default 0;
