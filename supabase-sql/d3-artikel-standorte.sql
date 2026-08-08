-- ============================================================
-- ARGONAUT OS · D3 · Multistandort-Tiefe · Sortiment (Artikel ↔ Filialen)
-- „Jede Filiale ihr eigenes Sortiment": ordnet EINEN Artikel mehreren Filialen
-- zu (viele-zu-viele) — derselbe Baustein wie bei den Dokumenten (D2).
-- WICHTIG: eigene Zuordnungstabelle, das Textfeld `artikel.standort` (Lagerort)
-- bleibt unberuehrt — keine Kollision.
-- Ein Artikel OHNE Zuordnung bleibt ueberall im Sortiment (fail-open).
-- Additiv · idempotent · NICHT destruktiv.
-- ============================================================

create table if not exists public.artikel_standorte (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  artikel_id    uuid not null references public.artikel(id)   on delete cascade,
  standort_id   uuid not null references public.standorte(id) on delete cascade,
  erstellt_am   timestamptz not null default now(),
  unique (artikel_id, standort_id)
);

create index if not exists artikel_standorte_artikel_idx
  on public.artikel_standorte (artikel_id);
create index if not exists artikel_standorte_standort_idx
  on public.artikel_standorte (standort_id);
create index if not exists artikel_standorte_owner_idx
  on public.artikel_standorte (owner_user_id);

alter table public.artikel_standorte enable row level security;

drop policy if exists artikel_standorte_select on public.artikel_standorte;
create policy artikel_standorte_select on public.artikel_standorte
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists artikel_standorte_select_ma on public.artikel_standorte;
create policy artikel_standorte_select_ma on public.artikel_standorte
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists artikel_standorte_insert on public.artikel_standorte;
create policy artikel_standorte_insert on public.artikel_standorte
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists artikel_standorte_update on public.artikel_standorte;
create policy artikel_standorte_update on public.artikel_standorte
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists artikel_standorte_delete on public.artikel_standorte;
create policy artikel_standorte_delete on public.artikel_standorte
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));
