-- ============================================================
-- ARGONAUT OS · G2b · Modul-Freischaltung je Filiale
-- Neue Tabelle standort_module — welche Module an welchem Standort aktiv sind.
-- Spiegelt das tenant_module-Muster, aber pro Standort (eine Ebene tiefer).
-- Additiv · idempotent · NICHT destruktiv. Setzt G1 (standorte) voraus.
-- Der Live-Buchungs-Gate (tenant_module) bleibt unberührt; die Wirkung greift
-- erst mit dem Filial-Umschalter (G3).
-- ============================================================

create table if not exists public.standort_module (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  standort_id   uuid not null references public.standorte(id) on delete cascade,
  modul_key     text not null,
  aktiv         boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (standort_id, modul_key)
);

create index if not exists standort_module_standort_idx
  on public.standort_module (standort_id);

alter table public.standort_module enable row level security;

drop policy if exists smod_select on public.standort_module;
create policy smod_select on public.standort_module
  as PERMISSIVE for SELECT to public using ((auth.uid() = owner_user_id));

drop policy if exists smod_select_ma on public.standort_module;
create policy smod_select_ma on public.standort_module
  as PERMISSIVE for SELECT to public using ((owner_user_id = mein_chef_id()));

drop policy if exists smod_insert on public.standort_module;
create policy smod_insert on public.standort_module
  as PERMISSIVE for INSERT to public with check ((auth.uid() = owner_user_id));

drop policy if exists smod_update on public.standort_module;
create policy smod_update on public.standort_module
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));

drop policy if exists smod_delete on public.standort_module;
create policy smod_delete on public.standort_module
  as PERMISSIVE for DELETE to public using ((auth.uid() = owner_user_id));
