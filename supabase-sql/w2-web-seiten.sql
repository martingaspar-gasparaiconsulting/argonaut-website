-- ============================================================
-- ARGONAUT OS · W2 · Webauftritt · Seiten-Gerüst
-- Grundlage für den Website-Bauer: jede Seite (Startseite, Unterseite,
-- Landingpage, Produktseite …) ist EIN Datensatz. Die Bausteine der Seite
-- liegen als jsonb-Liste in `bloecke` — so bleibt das Modell einfach und
-- erweiterbar (kein Join-Geflecht). Zweck steuert später den KI-Zuschnitt.
-- Additiv · idempotent · NICHT destruktiv. RLS: nur der Eigentümer.
-- (Öffentliches Lesen für LIVE-Seiten kommt erst mit W7 = Veröffentlichen.)
-- ============================================================

create table if not exists public.web_seiten (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  titel           text not null,
  slug            text not null,
  zweck           text not null default 'webseite',   -- visitenkarte | webseite | funnel | produkt | event
  status          text not null default 'entwurf',    -- entwurf | live
  ist_startseite  boolean not null default false,
  sortierung      int not null default 0,
  bloecke         jsonb not null default '[]'::jsonb,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  unique (owner_user_id, slug)
);

create index if not exists web_seiten_owner_idx on public.web_seiten (owner_user_id);

alter table public.web_seiten enable row level security;

-- RLS: nur der Chef sieht/pflegt seine eigenen Seiten (Entwurfsphase).
drop policy if exists web_seiten_select on public.web_seiten;
create policy web_seiten_select on public.web_seiten
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists web_seiten_insert on public.web_seiten;
create policy web_seiten_insert on public.web_seiten
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists web_seiten_update on public.web_seiten;
create policy web_seiten_update on public.web_seiten
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists web_seiten_delete on public.web_seiten;
create policy web_seiten_delete on public.web_seiten
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));
