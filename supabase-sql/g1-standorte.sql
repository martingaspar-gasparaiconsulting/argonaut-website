-- ============================================================
-- ARGONAUT OS · G1 · Multistandort · Grundlage
-- 1) Neue Tabelle `standorte` (Hauptsitz + Filialen) mit Tenant-RLS.
-- 2) Anker-Spalte `standort_id` an `mitarbeiter` (G2/G3 docken hier an).
-- Additiv · idempotent · NICHT destruktiv. RLS spiegelt das Bestandsmuster.
-- ============================================================

-- 1) Standorte / Filialen ------------------------------------------------------
create table if not exists public.standorte (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null,
  ist_hauptsitz boolean not null default false,
  strasse       text,
  plz           text,
  ort           text,
  telefon       text,
  aktiv         boolean not null default true,
  erstellt_am   timestamptz not null default now()
);

create index if not exists standorte_owner_idx
  on public.standorte (owner_user_id);

alter table public.standorte enable row level security;

-- RLS: Chef sieht/pflegt seine eigenen; Mitarbeiter sieht die des Chefs.
drop policy if exists standorte_select on public.standorte;
create policy standorte_select on public.standorte
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists standorte_select_ma on public.standorte;
create policy standorte_select_ma on public.standorte
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists standorte_insert on public.standorte;
create policy standorte_insert on public.standorte
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists standorte_update on public.standorte;
create policy standorte_update on public.standorte
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists standorte_delete on public.standorte;
create policy standorte_delete on public.standorte
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));

-- 2) Anker: Mitarbeiter kann einem Standort zugeordnet werden ------------------
--    Nullable + ON DELETE SET NULL → nichts bricht, wenn ein Standort entfällt.
alter table public.mitarbeiter
  add column if not exists standort_id uuid references public.standorte(id) on delete set null;

create index if not exists mitarbeiter_standort_idx
  on public.mitarbeiter (standort_id);
