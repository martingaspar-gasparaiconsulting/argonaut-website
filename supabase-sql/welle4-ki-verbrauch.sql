-- ============================================================
-- ARGONAUT OS · Welle 4 · Schritt 2 — KI-Verbrauch (Betreiber-Rundumblick)
-- Die Protokoll-Zeile schreibt lib/ki.ts bereits bei JEDEM KI-Aufruf (Service-
-- Role). Es fehlte nur die Zieltabelle in vollständiger Form — hier wird JEDE
-- Spalte defensiv sichergestellt (die Tabelle existierte evtl. schon reduziert).
-- Idempotent.
-- ============================================================

-- Tabelle anlegen, falls noch gar nicht vorhanden.
create table if not exists ki_nutzung (
  id uuid primary key default gen_random_uuid()
);

-- JEDE Spalte einzeln sicherstellen (greift auch, wenn die Tabelle schon existierte).
alter table ki_nutzung add column if not exists user_id uuid;
alter table ki_nutzung add column if not exists route text;
alter table ki_nutzung add column if not exists modell text;
alter table ki_nutzung add column if not exists tokens_rein integer not null default 0;
alter table ki_nutzung add column if not exists tokens_raus integer not null default 0;
alter table ki_nutzung add column if not exists tokens_cache_write integer not null default 0;
alter table ki_nutzung add column if not exists tokens_cache_read integer not null default 0;
alter table ki_nutzung add column if not exists kosten_usd numeric(14,6) not null default 0;
alter table ki_nutzung add column if not exists created_at timestamptz not null default now();

create index if not exists idx_ki_nutzung_user_zeit on ki_nutzung (user_id, created_at desc);
create index if not exists idx_ki_nutzung_zeit on ki_nutzung (created_at desc);

-- RLS an, KEINE Policies: nur die Service-Role (lib/ki.ts + Admin-Panel) hat Zugriff.
alter table ki_nutzung enable row level security;

-- Auswertung je Kunde ab einem Zeitpunkt.
create or replace function ki_verbrauch_pro_kunde(seit timestamptz)
returns table(user_id uuid, anzahl bigint, tok_rein bigint, tok_raus bigint, kosten_usd numeric)
language sql stable security definer set search_path = public as $$
  select user_id,
         count(*)::bigint,
         coalesce(sum(tokens_rein), 0)::bigint,
         coalesce(sum(tokens_raus), 0)::bigint,
         coalesce(sum(kosten_usd), 0)::numeric
  from ki_nutzung
  where created_at >= seit
  group by user_id
  order by 5 desc nulls last;
$$;

-- Auswertung je Funktion/Route ab einem Zeitpunkt.
create or replace function ki_verbrauch_pro_route(seit timestamptz)
returns table(route text, anzahl bigint, kosten_usd numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(route, 'unbekannt'),
         count(*)::bigint,
         coalesce(sum(kosten_usd), 0)::numeric
  from ki_nutzung
  where created_at >= seit
  group by route
  order by 3 desc nulls last;
$$;
