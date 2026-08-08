-- ============================================================
-- ARGONAUT OS · D2 · Multistandort-Tiefe · Dokumente ↔ Filialen
-- Wiederverwendbares Muster „Filial-Zuordnung" (viele Filialen je Datensatz).
-- Ein Dokument OHNE Zuordnung bleibt ueberall sichtbar (fail-open) — es
-- verschwindet nie etwas. Additiv · idempotent · NICHT destruktiv.
-- RLS spiegelt das Bestandsmuster (standorte): Chef pflegt eigene,
-- Mitarbeiter liest die des Chefs (mein_chef_id()).
-- ============================================================

create table if not exists public.document_standorte (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  document_id   uuid not null references public.documents(id)  on delete cascade,
  standort_id   uuid not null references public.standorte(id)  on delete cascade,
  erstellt_am   timestamptz not null default now(),
  unique (document_id, standort_id)
);

create index if not exists document_standorte_doc_idx
  on public.document_standorte (document_id);
create index if not exists document_standorte_standort_idx
  on public.document_standorte (standort_id);
create index if not exists document_standorte_owner_idx
  on public.document_standorte (owner_user_id);

alter table public.document_standorte enable row level security;

-- Chef sieht/pflegt seine eigenen Zuordnungen.
drop policy if exists document_standorte_select on public.document_standorte;
create policy document_standorte_select on public.document_standorte
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

-- Mitarbeiter sieht die Zuordnungen seines Chefs.
drop policy if exists document_standorte_select_ma on public.document_standorte;
create policy document_standorte_select_ma on public.document_standorte
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists document_standorte_insert on public.document_standorte;
create policy document_standorte_insert on public.document_standorte
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists document_standorte_update on public.document_standorte;
create policy document_standorte_update on public.document_standorte
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists document_standorte_delete on public.document_standorte;
create policy document_standorte_delete on public.document_standorte
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));
