-- ============================================================================
-- ARGONAUT OS · db/ki_nutzung.sql  (Phase 1 · B)
-- Detail-Protokoll pro KI-Aufruf: WER (user_id) · WAS (route) · welches Modell
-- · Tokens (rein/raus/cache) · Kosten in USD · Zeitpunkt.
-- Speist spaeter die Auswertung "welcher Kunde / welche Funktion kostet was"
-- und den "Waechter" (Schwellen/Warnsignale).
--
-- RLS an, KEINE Policies -> nur der Service-Role-Key (lib/ki.ts) schreibt,
-- nur der Owner liest im Supabase-Dashboard. Kunden sehen davon nichts.
-- Mit "if not exists" gebaut -> gefahrlos wiederholbar.
-- ============================================================================

create table if not exists public.ki_nutzung (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  route text not null,
  modell text,
  tokens_rein integer not null default 0,
  tokens_raus integer not null default 0,
  tokens_cache_write integer not null default 0,
  tokens_cache_read integer not null default 0,
  kosten_usd numeric(12,6) not null default 0,
  erstellt_am timestamptz not null default now()
);

create index if not exists ki_nutzung_user_zeit_idx on public.ki_nutzung (user_id, erstellt_am desc);
create index if not exists ki_nutzung_route_zeit_idx on public.ki_nutzung (route, erstellt_am desc);

alter table public.ki_nutzung enable row level security;
