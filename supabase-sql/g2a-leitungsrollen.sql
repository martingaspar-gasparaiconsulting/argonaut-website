-- ============================================================
-- ARGONAUT OS · G2a · Leitungsrollen & Standort-Zuordnung
-- 1) mitarbeiter.leitungsrolle — der gewählte Titel (Preset ODER eigener).
-- 2) leitungsrolle_eigen — firmenweite eigene Titel (z. B. „Bayern-Leiter").
-- 3) mitarbeiter_standorte — welche Standorte eine Person abdeckt (n:m).
-- Additiv · idempotent · NICHT destruktiv. RLS nach Bestandsmuster.
-- Setzt G1 voraus (Tabelle standorte).
-- ============================================================

-- 1) Titel-Spalte am Mitarbeiter (getrennt von der Rechte-Rolle `rolle`) --------
alter table public.mitarbeiter
  add column if not exists leitungsrolle text;

-- 2) Firmen-eigene Titel -------------------------------------------------------
create table if not exists public.leitungsrolle_eigen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null,
  erstellt_am   timestamptz not null default now(),
  unique (owner_user_id, name)
);

create index if not exists leitungsrolle_eigen_owner_idx
  on public.leitungsrolle_eigen (owner_user_id);

alter table public.leitungsrolle_eigen enable row level security;

drop policy if exists lre_select on public.leitungsrolle_eigen;
create policy lre_select on public.leitungsrolle_eigen
  as PERMISSIVE for SELECT to public using ((auth.uid() = owner_user_id));

drop policy if exists lre_select_ma on public.leitungsrolle_eigen;
create policy lre_select_ma on public.leitungsrolle_eigen
  as PERMISSIVE for SELECT to public using ((owner_user_id = mein_chef_id()));

drop policy if exists lre_insert on public.leitungsrolle_eigen;
create policy lre_insert on public.leitungsrolle_eigen
  as PERMISSIVE for INSERT to public with check ((auth.uid() = owner_user_id));

drop policy if exists lre_update on public.leitungsrolle_eigen;
create policy lre_update on public.leitungsrolle_eigen
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));

drop policy if exists lre_delete on public.leitungsrolle_eigen;
create policy lre_delete on public.leitungsrolle_eigen
  as PERMISSIVE for DELETE to public using ((auth.uid() = owner_user_id));

-- 3) Standort-Zuordnung je Mitarbeiter (n:m) -----------------------------------
create table if not exists public.mitarbeiter_standorte (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  mitarbeiter_id uuid not null references public.mitarbeiter(id) on delete cascade,
  standort_id    uuid not null references public.standorte(id) on delete cascade,
  erstellt_am    timestamptz not null default now(),
  unique (mitarbeiter_id, standort_id)
);

create index if not exists mitarbeiter_standorte_ma_idx
  on public.mitarbeiter_standorte (mitarbeiter_id);
create index if not exists mitarbeiter_standorte_st_idx
  on public.mitarbeiter_standorte (standort_id);

alter table public.mitarbeiter_standorte enable row level security;

drop policy if exists mst_select on public.mitarbeiter_standorte;
create policy mst_select on public.mitarbeiter_standorte
  as PERMISSIVE for SELECT to public using ((auth.uid() = owner_user_id));

drop policy if exists mst_select_ma on public.mitarbeiter_standorte;
create policy mst_select_ma on public.mitarbeiter_standorte
  as PERMISSIVE for SELECT to public using ((owner_user_id = mein_chef_id()));

drop policy if exists mst_insert on public.mitarbeiter_standorte;
create policy mst_insert on public.mitarbeiter_standorte
  as PERMISSIVE for INSERT to public with check ((auth.uid() = owner_user_id));

drop policy if exists mst_delete on public.mitarbeiter_standorte;
create policy mst_delete on public.mitarbeiter_standorte
  as PERMISSIVE for DELETE to public using ((auth.uid() = owner_user_id));
