-- ============================================================
-- ARGONAUT OS · Welle 4 · Schritt 3 — Speicher-Verbrauch je Kunde
-- Summiert die Dateigrößen aus allen Storage-Buckets, gruppiert nach dem
-- Kunden-Ordner (erstes Pfad-Segment = owner_user_id, wie die Storage-Policies
-- es anlegen). Nur Service-Role/Admin ruft die Funktion auf. Idempotent.
-- ============================================================

create or replace function speicher_pro_kunde()
returns table(owner_key text, bytes bigint, dateien bigint)
language sql stable security definer set search_path = public as $$
  select split_part(name, '/', 1)::text as owner_key,
         coalesce(sum((metadata->>'size')::bigint), 0)::bigint as bytes,
         count(*)::bigint as dateien
  from storage.objects
  where name like '%/%'
  group by 1
  order by 2 desc nulls last;
$$;

-- Gesamtsumme (ein Wert) — bequem fürs Panel.
create or replace function speicher_gesamt()
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)::bigint from storage.objects;
$$;
